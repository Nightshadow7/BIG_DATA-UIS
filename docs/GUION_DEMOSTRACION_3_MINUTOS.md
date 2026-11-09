# Guion de Demostracion Funcional en Vivo (180 Segundos)

**Proyecto:** Sistema de Alerta Temprana y Resiliencia Hidroclimatica en Santander
**Autores:** Anthoni Lexandre Hernandez (2191198), Andres Santiago Marin, Angie Nicol Boada, Laura Valentina Ortiz
**Duracion objetivo:** 3 minutos exactos (180 segundos)
**URL en vivo:** [https://big-data-uis-5vob.vercel.app/](https://big-data-uis-5vob.vercel.app/)

---

## Preparacion previa antes de iniciar la grabacion o sustentacion

Antes de comenzar a correr el cronometro, deja abiertas estas cuatro pestanas o ventanas listas para alternar sin tiempos muertos:

1. **Terminal dividida en dos paneles** ubicada en la raiz del repositorio:
   - Panel izquierdo con `docker compose ps` ya impreso en pantalla y el comando del consumidor listo para ejecutar: `python src/streaming/kafka_consumer.py`
   - Panel derecho con el comando del productor listo para ejecutar: `python src/streaming/kafka_producer.py`
2. **Navegador — Pestana 1 (Consola Web de MinIO):** `http://localhost:9001/browser` con sesion iniciada (`admin` / `minioadmin123`), mostrando los tres buckets: `bronce`, `plata` y `oro`.
3. **Navegador — Pestana 2 (Centro de Mando en Vercel):** `https://big-data-uis-5vob.vercel.app/` cargado en vista completa.

---

## Minuto 1 (0:00 a 1:00) — Infraestructura Docker y Arquitectura Medallon en MinIO

**En pantalla (0:00 - 0:25):** Muestra la terminal con `docker compose ps` y el archivo `compose.yaml`.
**Que decir:**
> "Buenas tardes. Presentamos nuestro sistema de alerta temprana hidroclimatica para Santander. Toda la infraestructura corre sobre contenedores Docker orquestados desde la raiz del proyecto: tenemos un nodo de almacenamiento compatible con Amazon S3 en MinIO, un broker Apache Kafka en modo KRaft sin dependencia de Zookeeper, nuestro contenedor de procesamiento distribuido con PySpark 3.5 y el cliente web en React."

**En pantalla (0:25 - 1:00):** Cambia a la Pestana 1 del navegador (`http://localhost:9001`). Haz clic rapidamente en el bucket `bronce`, luego en `plata` mostrando las carpetas `departamento=SANTANDER/anio=...`, y finalmente en `oro`.
**Que decir:**
> "En el Data Lake implementamos la arquitectura Medallon. En el bucket bronce almacenamos el archivo crudo descargado desde la API de Datos Abiertos del IDEAM con registros desde el ano 2000. Con el job de PySpark `bronze_to_silver.py`, depuramos lecturas invalidas y guardamos en el bucket plata en formato columnar Apache Parquet, particionado fisicamente por departamento y ano. Luego, `silver_to_gold.py` calcula con Spark SQL los percentiles 90 y 99 historicos para las 26 estaciones de Santander —como Puerto Wilches con un umbral critico P99 de 26.8 milimetros o la estacion UIS en Bucaramanga con 11 milimetros— y sincroniza este catalogo en el bucket oro y en Supabase."

---

## Minuto 2 (1:00 a 2:00) — Procesamiento en Tiempo Real con Apache Kafka

**En pantalla (1:00 - 1:30):** Vuelve a la terminal dividida. En el panel izquierdo ejecuta `python src/streaming/kafka_consumer.py` y en el panel derecho ejecuta `python src/streaming/kafka_producer.py`.
**Que decir:**
> "Para el monitoreo en tiempo real implementamos una capa de streaming sobre Apache Kafka utilizando el topic `telemetria-precipitacion`. A la derecha, el productor simula la llegada de lecturas pluviometricas de estaciones reales del IDEAM en Santander, usando el codigo de la estacion como llave de particionamiento para garantizar el orden cronologico de cada sensor."

**En pantalla (1:30 - 2:00):** Senala en el panel izquierdo como el consumidor imprime en consola la evaluacion de cada mensaje (`ROJA`, `NARANJA` o `NORMAL`) junto con su particion y offset.
**Que decir:**
> "A la izquierda, el consumidor del grupo `centro-mando-hidroclimatico` descarga al iniciar los umbrales P90 y P99 desde la capa Oro y evalua cada evento en milisegundos. Cuando una lectura supera el percentil 90 declara alerta naranja de vigilancia, y si alcanza el percentil 99 dispara alerta roja por riesgo de desbordamiento, actualizando inmediatamente el estado de la estacion en PostgreSQL y emitiendo el evento por WebSockets."

---

## Minuto 3 (2:00 a 3:00) — Centro de Mando Web en Vercel y Protocolo de Respuesta

**En pantalla (2:00 - 2:35):** Cambia a la Pestana 2 del navegador (`https://big-data-uis-5vob.vercel.app/`). Muestra los indicadores superiores, el panel izquierdo de alertas activas y haz clic sobre una estacion en el mapa interactivo de Santander.
**Que decir:**
> "Finalmente, aqui vemos el Centro de Mando desplegado en produccion sobre Vercel. Sin necesidad de recargar la pagina, la interfaz recibe por Supabase Realtime las alertas que acaba de procesar Kafka, o permite ejecutar una simulacion directa con el boton de inyeccion de lluvia. En el mapa geoespacial vemos las 26 estaciones de Santander coloreadas segun su nivel de riesgo actual y, en la parte inferior, la tabla completa de la capa Oro con sus umbrales P90 y P99."

**En pantalla (2:35 - 3:00):** Haz clic en el boton **Desplegar Protocolo** en la barra superior para abrir el modal de actuacion de la UNGRD, selecciona una estacion en alerta y muestra la lista de verificacion y el despacho de alerta comunitaria.
**Que decir:**
> "Cuando una estacion entra en estado critico, el operador abre desde aqui el protocolo de actuacion alineado con la Unidad Nacional para la Gestion del Riesgo de Desastres, verifica los pasos operativos para esa estacion y registra el despacho de la alerta temprana. Con esto demostramos el flujo completo de extremo a extremo, desde la ingesta cruda del IDEAM hasta la toma de decisiones en tiempo real. Muchas gracias."
