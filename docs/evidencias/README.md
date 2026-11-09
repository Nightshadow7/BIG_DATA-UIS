# Evidencias de Ejecución del Proyecto

En esta carpeta se almacenan las capturas de pantalla de respaldo correspondientes a la ejecución de cada etapa de la arquitectura:

1. `01_minio_buckets.png`: Consola web de MinIO (`http://localhost:9001`) mostrando los buckets `bronce`, `plata` y `oro` con los archivos CSV y Parquet generados.
2. `02_pyspark_batch.png`: Ejecución en consola de los trabajos `bronze_to_silver.py` y `silver_to_gold.py` procesando los registros de Santander y calculando los percentiles P90 y P99.
3. `03_kafka_streaming.png`: Ejecución simultánea del productor (`kafka_producer.py`) y consumidor (`kafka_consumer.py`) sobre el tópico `telemetria-precipitacion`.
4. `04_supabase_tablas.png`: Vista de las tablas `umbrales_estaciones` y `alertas_activas` en Supabase con la replicación Realtime activa.
5. `05_centro_mando_vercel.png`: Vista del Centro de Mando Hidroclimático desplegado en producción (`https://big-data-uis-5vob.vercel.app/`).
