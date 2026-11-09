# Guion de Demostracion Funcional en Vivo (180 Segundos — Enfoque Predictivo T+3h)

**Proyecto:** Sistema Predictivo de Alerta Temprana y Resiliencia Hidroclimatica en Santander
**Autores:** Anthoni Lexandre Hernandez (2191198), Andres Santiago Marin, Angie Nicol Boada, Laura Valentina Ortiz
**Duracion objetivo:** 3 minutos exactos (180 segundos)
**URL en vivo:** [https://big-data-uis-5vob.vercel.app/](https://big-data-uis-5vob.vercel.app/)

---

## Preparacion previa antes de iniciar la grabacion o sustentacion

Deja listas estas cuatro pestanas antes de empezar a correr el tiempo:

1. **Terminal dividida en dos paneles** en la raiz del repositorio:
   - Panel izquierdo con el consumidor predictivo listo: `docker compose run --rm spark-processor python src/streaming/kafka_consumer.py`
   - Panel derecho con el productor predictivo listo: `docker compose run --rm spark-processor python src/streaming/kafka_producer.py`
2. **Navegador — Pestana 1 (Consola Web de MinIO):** `http://localhost:9001/browser` mostrando los buckets `bronce`, `plata` y `oro`.
3. **Navegador — Pestana 2 (Centro de Mando Predictivo en Vercel):** `https://big-data-uis-5vob.vercel.app/` cargado en pantalla completa.
4. **Navegador — Pestana 3 (Verificador Satelital Windy / GeoJSON.io):** `https://www.windy.com/7.1997/-72.9692?rain,7.1997,-72.9692,10` (o lista para abrirse desde el enlace directo de cualquier estacion en el dashboard).

---

## Minuto 1 (0:00 a 1:00) — Enfoque Predictivo y Linea Base Historica en MinIO + PySpark

**En pantalla (0:00 - 0:25):** Muestra brevemente los contenedores activos en terminal (`docker compose ps`) y pasa a la consola de MinIO (`http://localhost:9001`).
**Que decir:**
> "Buenas tardes. Un sistema de alerta temprana no puede limitarse a informar que esta lloviendo cuando la emergencia ya ocurrio. Por eso disenamos un sistema predictivo con horizonte de anticipacion de tres a seis horas para las 26 estaciones del IDEAM en Santander, desplegado sobre Docker con MinIO S3, Apache Spark y Apache Kafka en modo KRaft."

**En pantalla (0:25 - 1:00):** Recorre en MinIO los buckets `bronce`, `plata` (mostrando el particionamiento `departamento=SANTANDER/anio=...`) y `oro`.
**Que decir:**
> "Para saber cuanta agua soporta cada microcuenca antes de desbordarse, primero construimos la memoria historica en nuestra arquitectura Medallon. En el bucket bronce ingerimos los registros del IDEAM desde el ano 2000 cruzados con las coordenadas geodesicas oficiales del Catalogo Nacional de Estaciones. Con PySpark limpiamos y particionamos en Parquet dentro del bucket plata, y en el bucket oro calculamos los percentiles 90 y 99 historicos de cada estacion. Asi sabemos, por ejemplo, que la estacion La Ceiba en Socorro entra en riesgo critico a los 18.8 milimetros y la estacion Tona a los 4.2 milimetros."

---

## Minuto 2 (1:00 a 2:00) — Prediccion en Tiempo Real a T+3h (Open-Meteo API + Apache Kafka)

**En pantalla (1:00 - 1:30):** Cambia a la terminal dividida y ejecuta el productor a la derecha y el consumidor a la izquierda.
**Que decir:**
> "Aqui ocurre la prediccion en tiempo real. A la derecha, nuestro productor de Kafka toma la latitud y longitud exactas de cada estacion del IDEAM y consulta la API satelital Open-Meteo para obtener la precipitacion proyectada en las proximas tres horas, la probabilidad de lluvia y la humedad superficial del suelo."

**En pantalla (1:30 - 2:00):** Senala en la consola del consumidor una linea de `ALERTA CRITICA` donde `Actual` sea baja (ej. `0.28 mm` o `1.65 mm`) pero `Prediccion T+3h` supere el umbral `P99`.
**Que decir:**
> "Observen la salida del consumidor a la izquierda: en estaciones como Tona o Socorro la lluvia actual en este instante es menor a dos milimetros —es decir, todavia no se ha desbordado el rio—, pero al sumar la saturacion antecedente de la cuenca con el frente de lluvia que entrara en las proximas tres horas, el modelo proyecta que se superara el percentil 99 historico y publica de inmediato la alerta temprana en Supabase Realtime para evacuar con tres horas de anticipacion."

---

## Minuto 3 (2:00 a 3:00) — Centro de Mando en Vercel, Verificacion en Windy y Protocolo Preventivo

**En pantalla (2:00 - 2:35):** Pasa a la Pestana 2 (`https://big-data-uis-5vob.vercel.app/`). Senala el panel izquierdo de **Alertas Predictivas (T+3h)**, haz clic sobre una estacion en el mapa de Santander, muestra el enlace de coordenadas hacia **Windy.com** y pulsa **Proyectar Escenario Predictivo (T+3h)**.
**Que decir:**
> "En nuestro Centro de Mando desplegado en Vercel vemos las alertas predictivas recibidas por WebSockets sin recargar la pagina. Cada tarjeta muestra que la lluvia actual es baja pero la proyeccion acumulada a tres horas supera el umbral P90 o P99, junto con la humedad del suelo y la probabilidad de lluvia. Ademas, al seleccionar cualquier estacion en el mapa o en la tabla inferior, podemos abrir con un clic su coordenada exacta en el radar satelital de Windy.com para contrastar visualmente el frente nuboso, o proyectar en vivo el pronostico de Open-Meteo para esa estacion."

**En pantalla (2:35 - 3:00):** Haz clic en **Protocolo Preventivo** sobre la alerta critica y pulsa confirmar verificacion.
**Que decir:**
> "Finalmente, con tres horas de margen antes del pico de escorrentia, el operador activa el protocolo preventivo de la UNGRD, coordina el preaviso comunitario y registra la atencion del escenario en PostgreSQL. Con esto pasamos de un monitoreo pasivo a un sistema predictivo real de prevencion de desastres. Muchas gracias."
