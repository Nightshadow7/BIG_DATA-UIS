# Informe Técnico: Sistema de Alerta Temprana y Resiliencia Hidroclimática en Santander

**Universidad Industrial de Santander (UIS)**  
**Escuela de Ingeniería de Sistemas e Informática — Procesamiento Distribuido y Big Data**  

**Autores:**
* Anthoni Lexandre Hernandez — `2191198`
* Andres Santiago Marin
* Angie Nicol Boada
* Laura Valentina Ortiz

**Enlace de producción (Centro de Mando Web):** [https://big-data-uis-5vob.vercel.app/](https://big-data-uis-5vob.vercel.app/)

---

## 1. Planteamiento del Problema y Justificación

El departamento de Santander presenta una topografía pronunciada donde convergen tres zonas hidrográficas principales: el Medio Magdalena, la cuenca del río Sogamoso y sectores tributarios del río Arauca. Durante las temporadas de lluvias intensas, municipios como Puerto Wilches, Cimitarra, Barrancabermeja, Socorro, Sabana de Torres y el Área Metropolitana de Bucaramanga sufren crecientes súbitas e inundaciones que afectan tanto a la población como a la infraestructura vial y agrícola.

Tradicionalmente, los registros pluviométricos capturados por las estaciones automáticas del Instituto de Hidrología, Meteorología y Estudios Ambientales (IDEAM) se almacenan en repositorios planos de millones de filas que resultan difíciles de consultar en tiempo real. Un umbral único de lluvia para todo el departamento no es representativo: 15 mm de lluvia en una hora pueden ser habituales en el Magdalena Medio, pero representan un riesgo crítico en cuencas de alta pendiente como Suratá o Vetas.

Por esta razón, este proyecto implementa una arquitectura híbrida de Big Data capaz de:
1. Procesar el histórico masivo de precipitaciones del IDEAM (desde el año 2000 en adelante) mediante Apache Spark para calcular umbrales estadísticos propios de cada estación (Percentil 90 para vigilancia y Percentil 99 para alerta roja).
2. Ingerir y evaluar lecturas pluviométricas en tiempo real mediante Apache Kafka, contrastando cada evento entrante con el modelo histórico de su estación y actualizando un Centro de Mando Web interactivo mediante Supabase Realtime.

---

## 2. Caracterización de los Datos y las 5V del Big Data

La fuente primaria corresponde al conjunto de datos abiertos del IDEAM: *Datos Hidrometeorológicos Crudos - Red de Estaciones IDEAM (Precipitación)*, publicado en el portal Datos Abiertos Colombia bajo el identificador Socrata `s54a-sgyg`.

* **Volumen:** El repositorio nacional supera los 292 millones de registros históricos. Para el entrenamiento y modelado del departamento de Santander se descargan lotes de hasta 150.000 observaciones recientes ($\ge$ año 2000) almacenados en crudo en el Data Lake.
* **Velocidad:** Las estaciones hidrometeorológicas automáticas (`AUT`) transmiten lecturas continuas cada pocos minutos. Esta dinámica se reproduce mediante el bus de eventos en Apache Kafka (`telemetria-precipitacion`), con latencias de procesamiento inferiores a 50 ms por evento.
* **Variedad:** Los datos integran atributos alfanuméricos de identificación (`codigoestacion`, `nombreestacion`), clasificación territorial (`departamento`, `municipio`, `zonahidrografica`), coordenadas geoespaciales (`latitud`, `longitud`), series de tiempo (`fechaobservacion`) y magnitudes físicas (`valorobservado` en milímetros). En el sistema coexisten formatos CSV (Capa Bronce), Apache Parquet particionado (Capas Plata y Oro), mensajes JSON sobre TCP (Kafka) y tablas relacionales en PostgreSQL (Supabase).
* **Veracidad:** Los sensores en campo presentan ruido instrumental, lecturas negativas por descalibración, valores extremos fuera de rango físico ($> 500\text{ mm}$), registros duplicados por retransmisión y coordenadas erróneas fuera del territorio colombiano. Estas anomalías se corrigen en la transición de la Capa Bronce a la Capa Plata.
* **Valor:** La transformación del dato crudo en los percentiles P90 y P99 permite a los organismos de socorro (CDGRD y UNGRD) priorizar el despacho de recursos según el comportamiento histórico real de cada microcuenca.

---

## 3. Arquitectura Híbrida de la Solución (Medallón + Lambda)

La plataforma se despliega mediante contenedores en Docker (`compose.yaml`) y servicios en la nube (Supabase y Vercel), organizados en cuatro niveles:

```mermaid
flowchart LR
    A["API IDEAM Socrata (s54a-sgyg)"] -->|ingest_ideam.py| B["MinIO S3: Bucket Bronce (CSV)"]
    B -->|bronze_to_silver.py (PySpark)| C["MinIO S3: Bucket Plata (Parquet Particionado)"]
    C -->|silver_to_gold.py (Spark SQL)| D["MinIO S3: Bucket Oro (Parquet P90/P99)"]
    D -->|Upsert Lotes| E["Supabase PostgreSQL (umbrales_estaciones)"]
    F["Productor Kafka (kafka_producer.py)"] -->|Topic: telemetria-precipitacion| G["Apache Kafka 3.7 (KRaft)"]
    G -->|Consumidor (kafka_consumer.py)| H["Motor de Cruce en Memoria (Evento vs P90/P99)"]
    D -.->|Lectura de Umbrales| H
    H -->|Upsert Alerta Activa| I["Supabase Realtime (alertas_activas)"]
    E --> J["Centro de Mando React + Tailwind (Vercel)"]
    I -->|WebSockets En Vivo| J
```

### 3.1. Almacenamiento Distribuido (Data Lake en MinIO)
Se utiliza MinIO como servidor de almacenamiento de objetos compatible con el protocolo Amazon S3. Un contenedor inicializador (`datalake-minio-init`) aprovisiona de forma automática tres buckets al arrancar el clúster:
* `s3://bronce`: Almacena el archivo `ideam_raw_2000_onwards.csv` tal como proviene de la fuente oficial, garantizando la inmutabilidad del dato original.
* `s3://plata`: Almacena el conjunto de datos depurado y serializado en formato columnar Apache Parquet, particionado jerárquicamente por `departamento=SANTANDER/anio=YYYY/`.
* `s3://oro`: Contiene el archivo `umbrales_estaciones_oro.parquet` con los indicadores estadísticos consolidados por estación.

### 3.2. Procesamiento por Lotes en Apache Spark (PySpark)
El contenedor `spark-processor` (basado en Python 3.11 y OpenJDK 17) ejecuta dos trabajos secuenciales:

1. **Trabajo `bronze_to_silver.py`:**
   * Conversión explícita de tipos (`valorobservado`, `latitud` y `longitud` a `DoubleType`; `fechaobservacion` a `TimestampType`).
   * Aplicación de filtros de calidad: descarte de fechas nulas, restricción temporal $\text{año} \ge 2000$, validación física $0.0 \le \text{valorobservado} \le 500.0\text{ mm}$, validación espacial dentro de Colombia ($\text{latitud} \in [-4.5, 13.5]$ y $\text{longitud} \in [-82.0, -66.0]$).
   * Estandarización de cadenas de texto (`UPPER` y `TRIM` en departamento, municipio y zona hidrográfica) y eliminación de duplicados mediante la clave compuesta `(codigoestacion, fechaobservacion)`.
   * Escritura particionada en Parquet usando PyArrow y sincronización hacia `s3://plata/`.

2. **Trabajo `silver_to_gold.py`:**
   * Registra la vista temporal `precipitaciones_plata` sobre el motor Spark SQL.
   * Filtra los eventos de lluvia efectiva ($\text{valorobservado} > 0$) en estaciones con representatividad estadística ($\text{COUNT}(*) \ge 10$) y ejecuta la función analítica distribuida `percentile_approx(valorobservado, 0.90)` y `percentile_approx(valorobservado, 0.99)`.
   * Exporta el modelo resultante a `s3://oro/umbrales_estaciones_oro.parquet` y sincroniza las 26 estaciones modeladas hacia la tabla `umbrales_estaciones` en Supabase.

### 3.3. Procesamiento en Flujos con Apache Kafka (Modo KRaft)
Se emplea Apache Kafka 3.7.0 configurado en modo **KRaft** (sin dependencia de ZooKeeper), exponiendo un listener interno (`kafka:29092`) para la red de contenedores y un listener externo (`localhost:9092`) para ejecución desde el sistema anfitrión:
* **Productor (`kafka_producer.py`):** Lee el catálogo de estaciones de la Capa Oro y genera lecturas de telemetría con clave de particionamiento `codigoestacion` hacia el tópico `telemetria-precipitacion` con confirmación `acks="all"`.
* **Consumidor (`kafka_consumer.py`):** Suscrito bajo el grupo `centro-mando-hidroclimatico`, deserializa cada mensaje JSON, busca en memoria los umbrales P90 y P99 de la estación correspondiente y clasifica el evento en tres niveles: `NORMAL` ($< \text{P90}$), `VIGILANCIA` ($\ge \text{P90}$) o `ALERTA CRÍTICA` ($\ge \text{P99}$). Cuando detecta una anomalía naranja o roja, actualiza en tiempo real la tabla `alertas_activas` en Supabase.

---

## 4. Resultados Experimentales del Pipeline

### 4.1. Modelo de Resiliencia en Capa Oro (26 Estaciones de Santander)
La siguiente tabla resume las 15 estaciones con mayor umbral crítico (P99) obtenidas tras la ejecución de `silver_to_gold.py` (el listado completo de 26 estaciones se encuentra en `data/processed_sample/ideam_oro_sample.csv`):

| Código | Estación | Municipio | Zona Hidrográfica | Lecturas | Media (mm) | Máx (mm) | Umbral P90 (mm) | Umbral P99 (mm) |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `23187010` | PUERTO WILCHES - AUT | PUERTO WILCHES | MEDIO MAGDALENA | 337 | 1.79 | 29.80 | 3.60 | **26.80** |
| `23127060` | SANTA ROSA - AUT | CIMITARRA | MEDIO MAGDALENA | 419 | 1.52 | 28.60 | 2.60 | **19.80** |
| `24017640` | LA CEIBA - AUT | SOCORRO | SOGAMOSO | 158 | 1.26 | 23.00 | 3.40 | **18.80** |
| `23127050` | FINCA BARREDERO - AUT | PUERTO PARRA | MEDIO MAGDALENA | 361 | 1.37 | 23.20 | 4.00 | **16.40** |
| `23180070` | SABANA DE TORRES | SABANA DE TORRES | MEDIO MAGDALENA | 200 | 1.06 | 24.20 | 1.80 | **14.60** |
| `23155030` | AEROPUERTO YARIGUÍES - AUT | BARRANCABERMEJA | MEDIO MAGDALENA | 622 | 0.82 | 20.10 | 1.40 | **13.30** |
| `2319500043` | FLORIDABLANCA - AUT | FLORIDABLANCA | MEDIO MAGDALENA | 252 | 0.91 | 22.40 | 1.60 | **12.60** |
| `23125120` | CIMITARRA | CIMITARRA | MEDIO MAGDALENA | 329 | 0.77 | 24.20 | 1.40 | **12.30** |
| `23147020` | PUENTE FERROCARRIL OPÓN | SIMACOTA | MEDIO MAGDALENA | 320 | 1.41 | 16.00 | 4.40 | **11.20** |
| `23195040` | UNIVERSIDAD INDUSTRIAL SANTANDER | BUCARAMANGA | MEDIO MAGDALENA | 237 | 1.13 | 13.20 | 2.60 | **11.00** |
| `23190440` | NARANJO EL | LEBRIJA | MEDIO MAGDALENA | 319 | 0.87 | 14.20 | 1.60 | **10.10** |
| `24017590` | PUENTE NACIONAL - AUT | PUENTE NACIONAL | SOGAMOSO | 294 | 0.67 | 14.80 | 1.40 | **9.80** |
| `24027070` | MERIDA - AUT | PÁRAMO | SOGAMOSO | 424 | 0.71 | 13.20 | 1.20 | **9.80** |
| `23197690` | PALOGORDO - AUT | GIRÓN | MEDIO MAGDALENA | 190 | 0.53 | 11.20 | 0.80 | **9.10** |
| `24025090` | MOGOTES - AUT | MOGOTES | SOGAMOSO | 635 | 0.65 | 13.60 | 1.10 | **8.30** |

**Análisis de hallazgos:**  
Se comprueba la hipótesis geográfica planteada al inicio: las estaciones ubicadas en el valle del Magdalena Medio (Puerto Wilches con $\text{P99} = 26.8\text{ mm}$, Cimitarra con $19.8\text{ mm}$ y Puerto Parra con $16.4\text{ mm}$) registran regímenes convectivos de mucha mayor intensidad que las estaciones de páramo y alta montaña como Vetas - Santurbán ($\text{P99} = 1.0\text{ mm}$) o Berlín en Tona ($\text{P99} = 2.3\text{ mm}$). Contar con percentiles individualizados evita falsas alarmas en el Magdalena Medio y permite detectar lluvias atípicas en el macizo de Santurbán.

### 4.2. Detección de Anomalías en Tiempo Real (Streaming en Kafka)
En la prueba de transmisión de 25 eventos consecutivos (`data/processed_sample/ideam_streaming_alerts_sample.csv`), el consumidor procesó la totalidad del flujo desde la partición `0` (offsets `19` al `43`). A continuación se presenta una selección representativa de los eventos evaluados:

| ID Evento | Estación (`codigoestacion`) | Municipio | Lluvia (mm) | P90 (mm) | P99 (mm) | Clasificación | Offset Kafka |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| `EVT-...-1` | LLANO GRANDE (`23195110`) | GIRÓN | 3.71 | 1.0 | 4.9 | `VIGILANCIA` | 19 |
| `EVT-...-2` | PUENTE GUILLERMO (`2401500052`) | PUENTE NACIONAL | 7.16 | 1.2 | 6.4 | `ALERTA CRÍTICA` | 20 |
| `EVT-...-5` | CACHIRI (`23195200`) | SURATÁ | 4.79 | 1.1 | 3.8 | `ALERTA CRÍTICA` | 23 |
| `EVT-...-6` | UIS (`23195040`) | BUCARAMANGA | 14.37 | 2.6 | 11.0 | `ALERTA CRÍTICA` | 24 |
| `EVT-...-8` | FINCA BARREDERO (`23127050`) | PUERTO PARRA | 0.76 | 4.0 | 16.4 | `NORMAL` | 26 |
| `EVT-...-11` | MOGOTES (`24025090`) | MOGOTES | 10.58 | 1.1 | 8.3 | `ALERTA CRÍTICA` | 29 |
| `EVT-...-19` | GRANJA PIEDECUESTA (`2319500065`) | PIEDECUESTA | 0.72 | 1.0 | 5.0 | `NORMAL` | 37 |
| `EVT-...-25` | LA CEIBA (`24017640`) | SOCORRO | 17.62 | 3.4 | 18.8 | `VIGILANCIA` | 43 |

---

## 5. Centro de Mando Web y Seguridad en Base de Datos

El frontend fue construido bajo una arquitectura modular en React 19, Vite y Tailwind CSS (`web-dashboard/`), desplegado en producción en Vercel ([https://big-data-uis-5vob.vercel.app/](https://big-data-uis-5vob.vercel.app/)).

1. **Seguridad Row Level Security (RLS):** El esquema SQL (`src/batch/supabase_schema.sql`) habilita políticas RLS sobre `umbrales_estaciones` y `alertas_activas`, permitiendo lectura pública e inserción/actualización controlada de los escenarios operativos.
2. **Visualización Geoespacial y Tabla de Capa Oro:** Incluye un mapa interactivo de Santander con proyección de las 26 estaciones, filtros por subzona hidrográfica (`GeospatialMap.jsx` y `GoldLayerTable.jsx`), barras comparativas frente al umbral P99 (`AlertsSidebar.jsx`) y un modal de atención de emergencias (`ProtocolModal.jsx`) que registra el cierre del protocolo directamente en Supabase.
3. **Pruebas Unitarias:** La lógica de clasificación hidrológica (`src/lib/hydrologyRules.js`) cuenta con una suite de 7 pruebas automatizadas (`src/lib/hydrologyRules.test.js`) ejecutables con el corredor nativo de Node.js (`npm test`), validando el cálculo de KPIs, porcentajes de excedencia sobre P99 y filtrado por cuencas.

---

## 6. Conclusiones

1. La separación del almacenamiento en capas Bronce (CSV), Plata (Parquet particionado) y Oro (Parquet agregado) en MinIO redujo el tamaño en disco y aceleró las consultas analíticas de Spark SQL al aprovechar la compresión columnar y el poda de particiones (*partition pruning*).
2. El uso de percentiles históricos por estación (P90 y P99) demostró ser mucho más preciso que el uso de umbrales estáticos departamentales, adaptándose a la variabilidad climática entre el valle del Magdalena Medio y la cordillera Oriental en Santander.
3. La integración entre Apache Kafka y Supabase Realtime permitió conectar el procesamiento distribuido en Python con el Centro de Mando en React logrando actualizaciones instantáneas en la interfaz web sin necesidad de recargas manuales.
