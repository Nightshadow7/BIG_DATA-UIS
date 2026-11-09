# Sistema de Alerta Temprana y Resiliencia Hidroclimática en Santander

Plataforma distribuida de Big Data (arquitectura híbrida Medallón + Streaming) para el procesamiento histórico y el monitoreo en tiempo real de las precipitaciones registradas por el IDEAM en el departamento de Santander, Colombia.

**Demo operativo en vivo (Centro de Mando Web):** [https://big-data-uis-5vob.vercel.app/](https://big-data-uis-5vob.vercel.app/)

---

## Autores — Universidad Industrial de Santander (UIS)

* **Anthoni Lexandre Hernandez** — `2191198`
* **Andres Santiago Marin**
* **Angie Nicol Boada**
* **Laura Valentina Ortiz**

---

## Arquitectura de la Solución

El sistema sigue una arquitectura híbrida (Lambda / Medallón) dividida en cuatro capas independientes:

1. **Capa de Ingesta y Almacenamiento Distribuido (Data Lake en MinIO S3):**
   * Descarga automatizada desde la API Socrata de Datos Abiertos Colombia correspondiente al conjunto de precipitaciones del IDEAM (`s54a-sgyg`, filtrando registros desde el año 2000 en adelante).
   * Organización en tres buckets S3: `s3://bronce` (datos crudos en CSV sin modificar), `s3://plata` (datos depurados y particionados en Parquet) y `s3://oro` (métricas agregadas y umbrales de riesgo por estación).

2. **Capa de Procesamiento por Lotes / Batch (Apache Spark / PySpark):**
   * **Bronce a Plata (`bronze_to_silver.py`):** Limpieza de datos aplicando reglas de veracidad (descarte de valores nulos, negativos o superiores a $500\text{ mm}$, validación de coordenadas dentro de los límites geográficos de Colombia y eliminación de duplicados). Los resultados se guardan en formato columnar **Apache Parquet** con particionamiento lógico por `departamento` y `anio`.
   * **Plata a Oro (`silver_to_gold.py`):** Procesamiento analítico en Spark SQL sobre las 26 estaciones hidrometeorológicas de Santander para obtener la precipitación media, máxima histórica, el **Percentil 90 (`umbral_alerta_naranja` — Vigilancia)** y el **Percentil 99 (`umbral_alerta_roja` — Desbordamiento Crítico)**.

3. **Capa de Procesamiento en Flujos / Streaming (Apache Kafka KRaft):**
   * **Productor (`kafka_producer.py`):** Simula y transmite lecturas pluviométricas en tiempo real hacia el tópico `telemetria-precipitacion`, particionando los mensajes por `codigoestacion`.
   * **Consumidor (`kafka_consumer.py`):** Opera bajo el grupo de consumo `centro-mando-hidroclimatico`, contrasta cada lectura entrante contra los umbrales P90 y P99 de la Capa Oro y actualiza el estado de las alertas cuando se presenta una anomalía.

4. **Capa de Persistencia Analítica y Visualización (Supabase Realtime + React Vite):**
   * Sincronización en PostgreSQL sobre las tablas `umbrales_estaciones` y `alertas_activas`, configuradas con políticas **Row Level Security (RLS)** y replicación por WebSockets para actualizar el Centro de Mando Web desplegado en Vercel sin necesidad de recargar la página.

---

## Estructura del Repositorio

```text
bigdata-alerta-climatica/
├── compose.yaml                                  # Orquestación principal (MinIO, Kafka KRaft, Spark, Web)
├── vercel.json                                   # Configuración de compilación y rutas para Vercel
├── docker/
│   ├── Dockerfile                                # Imagen Python 3.11 + OpenJDK 17 + PySpark
│   └── docker-compose.yml                        # Manifiesto de contenedores de respaldo
├── docs/
│   └── evidencias/                               # Capturas de ejecución (MinIO, Spark, Kafka, Supabase)
├── data/
│   ├── raw_sample/
│   │   └── ideam_precipitacion_raw_sample.csv    # Muestra verificable Capa Bronce (50 filas)
│   └── processed_sample/
│       ├── ideam_plata_sample.parquet            # Muestra verificable Capa Plata (Parquet y CSV)
│       ├── ideam_oro_sample.parquet              # Muestra verificable Capa Oro P90/P99 (Parquet y CSV)
│       └── ideam_streaming_alerts_sample.json    # Muestra verificable de eventos procesados en Kafka
├── src/
│   ├── ingestion/
│   │   └── ingest_ideam.py                       # Extracción API IDEAM (>=2000) y carga en s3://bronce
│   ├── batch/
│   │   ├── bronze_to_silver.py                   # Limpieza en PySpark y particionamiento en s3://plata
│   │   ├── silver_to_gold.py                     # Cálculo de percentiles P90/P99 en s3://oro + Sync Supabase
│   │   └── supabase_schema.sql                   # Definición de tablas, Realtime y políticas RLS
│   └── streaming/
│       ├── kafka_producer.py                     # Emisor de telemetría hacia Apache Kafka
│       └── kafka_consumer.py                     # Evaluación de umbrales en vivo y actualización en Supabase
└── web-dashboard/                                # Centro de Mando en React + Vite + Tailwind CSS
    ├── Dockerfile                                # Contenedor de desarrollo para el frontend
    └── src/
        ├── components/                           # Navbar, AlertsSidebar, GeospatialMap, GoldLayerTable, ProtocolModal
        └── lib/                                  # Cliente Supabase, reglas hidrológicas y pruebas unitarias
```

---

## Guía de Ejecución Paso a Paso

### 1. Configuración de variables de entorno

Copia el archivo de ejemplo y verifica las credenciales de conexión a MinIO, Kafka y Supabase:

```bash
cp .env.example .env
```

### 2. Iniciar los contenedores (MinIO Data Lake + Apache Kafka)

```bash
docker compose up -d
```

* **Consola Web MinIO:** `http://localhost:9001` (Usuario: `admin` | Contraseña: `minioadmin123`)
* **API S3 MinIO:** `http://localhost:9000` (Buckets creados automáticamente: `bronce`, `plata`, `oro`)
* **Broker Apache Kafka:** `localhost:9092` (acceso desde el host) / `kafka:29092` (red interna de Docker)

### 3. Ejecutar el pipeline Batch (Ingesta -> Bronce -> Plata -> Oro)

```bash
# Paso 1: Descargar registros del IDEAM (>= año 2000) y subirlos a s3://bronce
docker compose run --rm spark-processor python src/ingestion/ingest_ideam.py

# Paso 2: Limpiar datos en PySpark y particionar en Parquet (departamento/anio) hacia s3://plata
docker compose run --rm spark-processor python src/batch/bronze_to_silver.py

# Paso 3: Calcular percentiles P90 y P99 en s3://oro y sincronizar con Supabase
docker compose run --rm spark-processor python src/batch/silver_to_gold.py
```

### 4. Ejecutar el flujo de Streaming en tiempo real (Apache Kafka)

```bash
# Emitir eventos de precipitación al tópico 'telemetria-precipitacion'
python src/streaming/kafka_producer.py

# Consumir el tópico, evaluar umbrales P90/P99 y publicar alertas en Supabase Realtime
python src/streaming/kafka_consumer.py
```

### 5. Ejecutar el Centro de Mando Web en entorno local

```bash
cd web-dashboard
npm install
npm run dev
```

Para ejecutar las pruebas unitarias de la lógica hidrológica:

```bash
npm --prefix web-dashboard test
```