# Guion de Demostracion Funcional en Vivo (180 Segundos — Enfoque Predictivo T+3h)

**Proyecto:** Sistema Predictivo de Alerta Temprana y Resiliencia Hidroclimatica en Santander
**Autores:** Anthoni Lexandre Hernandez (2191198), Andres Santiago Marin, Angie Nicol Boada, Laura Valentina Ortiz
**Duracion objetivo:** 3 minutos exactos (180 segundos)
**URL en vivo:** [https://big-data-uis-5vob.vercel.app/](https://big-data-uis-5vob.vercel.app/)

---

## Preparacion previa antes de iniciar la grabacion o sustentacion

Deja listas estas cuatro pestanas antes de empezar a correr el tiempo:

1. **Terminal dividida en dos paneles** en la raiz del repositorio:
   - Panel izquierdo con el consumidor predictivo en escucha continua: `docker compose run --rm spark-processor python src/streaming/kafka_consumer.py`
   - Panel derecho con el productor predictivo: `docker compose run --rm spark-processor python src/streaming/kafka_producer.py` (o con `--stress-test` si ese dia esta soleado en Santander y quieres demostrar una tormenta convectiva extrema).
2. **Navegador — Pestana 1 (Consola Web de MinIO):** `http://localhost:9001/browser` mostrando los buckets `bronce` (precipitaciones `s54a-sgyg` + catalogo `hp9r-jxuu`), `plata` y `oro`.
3. **Navegador — Pestana 2 (Centro de Mando Predictivo en Vercel):** `https://big-data-uis-5vob.vercel.app/` cargado en pantalla completa.
4. **Navegador — Pestana 3 (Verificador Satelital Windy / GeoJSON.io):** `https://www.windy.com/7.1997/-72.9692?rain,7.1997,-72.9692,10` (o lista para abrirse desde el enlace directo de cualquier estacion en el dashboard).

---

## Minuto 1 (0:00 a 1:00) — Enfoque Predictivo y Modelo Hidrologico en MinIO + PySpark

**En pantalla (0:00 - 0:25):** Muestra brevemente los contenedores activos en terminal (`docker compose ps`) y pasa a la consola de MinIO (`http://localhost:9001`).
**Que decir:**
> "Buenas tardes. Un sistema de alerta temprana no puede limitarse a informar que esta lloviendo cuando la emergencia ya ocurrio. Por eso disenamos un sistema predictivo con horizonte de anticipacion de tres a seis horas para las 26 estaciones del IDEAM en Santander, desplegado sobre Docker con MinIO S3, Apache Spark y Apache Kafka en modo KRaft."

**En pantalla (0:25 - 1:00):** Recorre en MinIO los buckets `bronce`, `plata` (mostrando el particionamiento `departamento=SANTANDER/anio=...`) y `oro`.
**Que decir:**
> "En el bucket bronce ingerimos tanto el historico pluviometrico del IDEAM como el Catalogo Nacional de Estaciones (`hp9r-jxuu`) con las coordenadas y altitudes oficiales. En el bucket plata hacemos el cruce geodesico y particionamos en Parquet. Y en el bucket oro, Apache Spark entrena nuestro modelo hidrologico predictivo mediante ventanas moviles de tres y veinticuatro horas: calcula los umbrales acumulados de tres horas P90 y P99, el indice de precipitacion antecedente, el coeficiente de escorrentia y la probabilidad condicional de transicion de Markov de cada cuenca."

---

## Minuto 2 (1:00 a 2:00) — Prediccion Determinista a T+3h/T+6h (Open-Meteo API + Spark + Kafka)

**En pantalla (1:00 - 1:30):** Cambia a la terminal dividida y ejecuta el productor a la derecha y el consumidor continuo a la izquierda.
**Que decir:**
> "A la derecha, nuestro productor de Kafka opera de forma cien por ciento determinista: consulta la API satelital Open-Meteo para la latitud y longitud exacta de cada estacion y aplica los parametros hidrologicos entrenados en Spark. Ademas, incluimos la bandera explicita `--stress-test` para inyectar un frente convectivo determinista cuando sustentamos en dias de tiempo seco."

**En pantalla (1:30 - 2:00):** Senala en la consola del consumidor las lineas de `VIGILANCIA` y `ALERTA CRITICA` donde la lluvia actual es `0.0 mm`, pero la proyeccion a `T+3h / T+6h` supera el umbral `3h-P90` o `3h-P99`.
**Que decir:**
> "Observen el consumidor en tiempo real a la izquierda: aunque la lluvia actual es cero milimetros, al integrar la saturacion antecedente del suelo con la lluvia proyectada para las proximas tres y seis horas, el motor calcula la probabilidad de desbordamiento y la ventana de evacuacion en minutos, publicando la alerta temprana en Supabase Realtime antes de que crezca el rio."

---

## Minuto 3 (2:00 a 3:00) — Centro de Mando en Vercel ("Prediccion Primero, Informacion Despues")

**En pantalla (2:00 - 2:35):** Pasa a la Pestana 2 (`https://big-data-uis-5vob.vercel.app/`). Senala primero el bloque superior **Nivel 1 — Pronostico de Impacto Anticipado (T+3h / T+6h)**, luego el mapa de Santander con el enlace a **Windy.com**, y finalmente la seccion inferior **Nivel 2 — Respaldo Historico**.
**Que decir:**
> "Nuestro Centro de Mando sigue la jerarquia Prediccion Primero, Informacion Despues. En el Nivel 1, lo primero que ve el operador son las tarjetas de impacto futuro con los cuatro indicadores criticos: probabilidad de desbordamiento, volumen proyectado a tres y seis horas, saturacion antecedente del suelo y ventana de evacuacion preventiva en minutos. En el Nivel 2 inferior se consulta el respaldo historico de Spark desde el ano 2000 y el catalogo desplegable de las 26 estaciones."

**En pantalla (2:35 - 3:00):** Haz clic en **Protocolo Preventivo** sobre la alerta critica y pulsa confirmar verificacion.
**Que decir:**
> "Con mas de dos horas de anticipacion antes del pico de escorrentia, el operador verifica el frente nuboso en Windy.com, activa el protocolo preventivo de la UNGRD y registra la atencion del escenario en PostgreSQL. Muchas gracias."
