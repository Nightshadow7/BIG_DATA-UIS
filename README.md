# Sistema Predictivo de Alerta Temprana y Resiliencia Hidroclimatica en Santander

**Plataforma Distribuida de Big Data (Arquitectura Hibrida Medallon + Streaming Predictivo a Horizonte T+3h y T+6h)** para el modelado historico y la prediccion anticipada de desbordamientos en las cuencas hidrograficas del departamento de Santander, Colombia, integrando series del IDEAM con pronosticos meteorologicos satelitales por coordenadas geodesicas exactas.

**Demo Operativo en Vivo (Centro de Mando Web):** [https://big-data-uis-5vob.vercel.app/](https://big-data-uis-5vob.vercel.app/)

---

## Autores — Universidad Industrial de Santander (UIS)
* **Anthoni Lexandre Hernandez** — `2191198`
* **Andres Santiago Marin**
* **Angie Nicol Boada**
* **Laura Valentina Ortiz**

---

## Arquitectura Predictiva de la Solucion

A diferencia de los tableros reactivos tradicionales que notifican cuando la precipitacion ya desbordo el cauce, esta plataforma opera bajo un **enfoque predictivo anticipado (horizonte $T+3\text{ h}$ y $T+6\text{ h}$)** desacoplado en cuatro capas:

1. **Capa de Ingesta y Almacenamiento Distribuido (Data Lake en MinIO S3):**
   * Extraccion automatizada desde la API Socrata de Datos Abiertos Colombia — Precipitaciones IDEAM (`s54a-sgyg`, registros $\ge$ ano 2000) cruzada con el Catalogo Nacional de Estaciones del IDEAM (`hp9r-jxuu`) para garantizar la latitud, longitud, altitud y zonificacion hidrografica oficial de cada sensor.
   * Organizacion en tres buckets S3: `s3://bronce` (CSV crudo inmutable), `s3://plata` (Parquet limpio y particionado) y `s3://oro` (umbrales estadisticos y saturacion de referencia por estacion).
2. **Capa de Procesamiento Batch — Memoria Historica y Saturacion (Apache Spark / PySpark):**
   * **Bronce $\rightarrow$ Plata (`bronze_to_silver.py`):** Reglas de veracidad (filtrado de valores negativos o $>500\text{ mm}$, validacion de bounding box geografico para Colombia y eliminacion de duplicados). Serializacion columnar en **Apache Parquet** con **particionamiento logico** por `departamento` y `anio`.
   * **Plata $\rightarrow$ Oro (`silver_to_gold.py`):** Calculo distribuido en Spark SQL sobre las $N = 26$ estaciones hidrometeorologicas de Santander para determinar la linea base de cada microcuenca: el **Percentil 90 (`umbral_alerta_naranja` — Vigilancia Predictiva)** y el **Percentil 99 (`umbral_alerta_roja` — Riesgo de Desbordamiento)**.
3. **Capa de Streaming e Inferencia Predictiva a $T+3\text{ h}$ (Apache Kafka KRaft + Open-Meteo API):**
   * **Productor Predictivo (`kafka_producer.py`):** Consulta en tiempo real la API satelital abierta **Open-Meteo** (`https://api.open-meteo.com/v1/forecast`) enviando la `latitud` y `longitud` exactas de cada estacion del IDEAM en Santander para obtener la lluvia proyectada en las proximas 3 horas (`precipitation`), la probabilidad de precipitacion (`precipitation_probability`) y la humedad superficial del suelo (`soil_moisture_0_to_7cm`). Publica en el topic `telemetria-precipitacion` el vector predictivo compuesto por la saturacion antecedente mas el pronostico horario ($\hat{R}_{t+3\text{h}} = S_{\text{ant}} + \hat{P}_{t+3\text{h}}$).
   * **Consumidor de Inferencia (`kafka_consumer.py`):** Grupo de consumo `centro-mando-hidroclimatico` que evalua la precipitacion acumulada predicha a $T+3\text{ horas}$ frente a los umbrales $P_{90}$ y $P_{99}$ de la Capa Oro. Asi, aunque en el instante actual la lluvia sea cercana a $0\text{ mm}$, si la proyeccion a 3 horas supera el $P_{99}$ de la estacion, dispara la alerta temprana para activar protocolos de evacuacion antes de que ocurra la creciente.
4. **Capa de Consumo, Verificacion Geodesica y Persistencia (Supabase Realtime + React Vite):**
   * Almacenamiento relacional en PostgreSQL (`umbrales_estaciones` y `alertas_activas`) con politicas **Row Level Security (RLS)** y difusion por WebSockets hacia el Centro de Mando en Vercel, incluyendo enlaces directos por coordenadas hacia el radar satelital de **Windy.com** para contrastar visualmente los frentes de lluvia entrantes.

---

## Fuentes de Datos Abiertos, API Predictiva y Verificacion Geoespacial

* **Serie Historica de Precipitaciones IDEAM (`s54a-sgyg`):** [https://www.datos.gov.co/Ambiente-y-Desarrollo-Sostenible/Precipitaci-n/s54a-sgyg](https://www.datos.gov.co/Ambiente-y-Desarrollo-Sostenible/Precipitaci-n/s54a-sgyg)
* **Catalogo Nacional de Estaciones del IDEAM (`hp9r-jxuu`):** [https://www.datos.gov.co/Ambiente-y-Desarrollo-Sostenible/Catalogo-Nacional-de-Estaciones-del-IDEAM/hp9r-jxuu/about_data](https://www.datos.gov.co/Ambiente-y-Desarrollo-Sostenible/Catalogo-Nacional-de-Estaciones-del-IDEAM/hp9r-jxuu/about_data)
* **API Meteorologica Predictiva por Coordenadas (Open-Meteo):** `https://api.open-meteo.com/v1/forecast` (consulta libre sin clave de acceso para `precipitation`, `precipitation_probability` y `soil_moisture_0_to_7cm`).
* **Verificadores Visuales de Coordenadas y Radar de Nubes:** [https://www.windy.com](https://www.windy.com) (integrado directamente en cada estacion del dashboard) y [https://geojson.io](https://geojson.io).

---

## Estructura del Repositorio

```text
BIG_DATA-UIS/
├── compose.yaml                                  # Orquestacion principal (MinIO, Kafka KRaft, Spark Processor, Web)
├── docker/
│   ├── Dockerfile                                # Imagen Python 3.11 + OpenJDK 17 + PySpark
│   └── docker-compose.yml                        # Manifiesto de contenedores sincronizado
├── docs/
│   ├── INFORME_TECNICO_FINAL.md                  # Informe tecnico completo bajo enfoque predictivo T+3h
│   ├── GUION_DEMOSTRACION_3_MINUTOS.md           # Guion minuto a minuto para la sustentacion (180 s)
│   └── evidencias/                               # Carpeta versionada para capturas de MinIO, Spark, Kafka y Supabase
├── data/
│   ├── raw_sample/
│   │   └── ideam_precipitacion_raw_sample.csv    # Muestra verificable Capa Bronce (50 filas)
│   └── processed_sample/
│       ├── ideam_plata_sample.parquet            # Muestra verificable Capa Plata (Parquet y CSV)
│       ├── ideam_oro_sample.parquet              # Muestra verificable Capa Oro P90/P99 de 26 estaciones (Parquet y CSV)
│       └── ideam_streaming_alerts_sample.json    # Muestra verificable de 25 vectores predictivos T+3h en Kafka
├── src/
│   ├── ingestion/
│   │   └── ingest_ideam.py                       # Descarga API IDEAM (>=2000) e ingesta en s3://bronce
│   ├── batch/
│   │   ├── bronze_to_silver.py                   # Limpieza en PySpark y particionamiento en s3://plata
│   │   ├── silver_to_gold.py                     # Calculo de percentiles P90/P99 en s3://oro + Sync Supabase
│   │   └── supabase_schema.sql                   # DDL de tablas, publicacion Realtime y politicas RLS
│   └── streaming/
│       ├── kafka_producer.py                     # Productor predictivo T+3h (Open-Meteo API + coordenadas IDEAM)
│       └── kafka_consumer.py                     # Motor de inferencia anticipada P90/P99 y disparo a Supabase
└── web-dashboard/                                # Aplicacion modular en React + Vite + Tailwind + Supabase
    ├── Dockerfile                                # Contenedor de despliegue frontend
    └── src/
        ├── components/                           # Navbar, AlertsSidebar, GeospatialMap, GoldLayerTable, ProtocolModal
        └── lib/                                  # Cliente Supabase + Open-Meteo, reglas hidrologicas y tests
```

---

## Guia de Ejecucion y Reproduccion Paso a Paso

### 1. Variables de Entorno
Copia el archivo de plantilla y configura las credenciales de Supabase:
```bash
cp .env.example .env
```

### 2. Levantar el Cluster Local (MinIO Data Lake + Apache Kafka)
```bash
docker compose up -d
```
* **Consola Web MinIO:** `http://localhost:9001` (Usuario: `admin` | Clave: `minioadmin123`)
* **Broker Apache Kafka:** `localhost:9092` (Externo) / `kafka:29092` (Red interna Docker)

### 3. Ejecutar el Pipeline Batch (Ingesta $\rightarrow$ Bronce $\rightarrow$ Plata $\rightarrow$ Oro)
```bash
# Paso 1: Ingesta desde Datos Abiertos IDEAM (>= ano 2000) hacia s3://bronce
docker compose run --rm spark-processor python src/ingestion/ingest_ideam.py

# Paso 2: Limpieza en PySpark y particionamiento Parquet (departamento/anio) en s3://plata
docker compose run --rm spark-processor python src/batch/bronze_to_silver.py

# Paso 3: Modelado de percentiles P90 y P99 en s3://oro y sincronizacion con Supabase
docker compose run --rm spark-processor python src/batch/silver_to_gold.py
```

### 4. Ejecutar el Pipeline de Streaming Predictivo a $T+3\text{ h}$ (Apache Kafka + Open-Meteo)
```bash
# Consultar pronostico satelital por latitud/longitud y emitir vectores T+3h al topic 'telemetria-precipitacion'
docker compose run --rm spark-processor python src/streaming/kafka_producer.py

# Consumir vectores predictivos, evaluar superacion anticipada de P90/P99 y publicar en Supabase Realtime
docker compose run --rm spark-processor python src/streaming/kafka_consumer.py
```

### 5. Ejecutar el Centro de Mando Web (React) en Local
```bash
cd web-dashboard
npm install
npm run dev
```