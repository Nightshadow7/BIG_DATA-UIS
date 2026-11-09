import os
import json
import time
import random
import socket
import urllib.request
import urllib.parse
from datetime import datetime, timezone
import pandas as pd
from kafka import KafkaProducer
from dotenv import load_dotenv

try:
    import requests
except ImportError:
    requests = None

load_dotenv(override=False)

TOPIC_NAME = "telemetria-precipitacion"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def get_kafka_broker():
    env_broker = os.getenv("KAFKA_BOOTSTRAP_SERVERS")
    if env_broker:
        return env_broker
    try:
        socket.gethostbyname("kafka")
        return "kafka:29092"
    except socket.gaierror:
        return "localhost:9092"


def fetch_forecast_by_coords(lat, lon):
    """Consulta pronóstico real en las próximas 3 horas para la latitud y longitud exactas."""
    try:
        params = {
            "latitude": round(float(lat), 5),
            "longitude": round(float(lon), 5),
            "hourly": "precipitation,precipitation_probability,soil_moisture_0_to_7cm",
            "forecast_days": 1,
            "timezone": "America/Bogota"
        }
        if requests is not None:
            resp = requests.get(OPEN_METEO_URL, params=params, timeout=5)
            resp.raise_for_status()
            payload = resp.json()
        else:
            url = f"{OPEN_METEO_URL}?{urllib.parse.urlencode(params)}"
            with urllib.request.urlopen(url, timeout=5) as response:
                payload = json.loads(response.read().decode("utf-8"))

        hourly = payload.get("hourly", {})
        precip_list = hourly.get("precipitation", [0, 0, 0])[:3]
        prob_list = hourly.get("precipitation_probability", [50, 50, 50])[:3]
        soil_list = hourly.get("soil_moisture_0_to_7cm", [0.35])[:3]

        return {
            "pronostico_3h_mm": round(sum(precip_list), 2),
            "probabilidad_lluvia_pct": int(max(prob_list)),
            "saturacion_suelo_pct": round(float(soil_list[0]) * 100, 1) if soil_list[0] else 42.0
        }
    except Exception:
        return {
            "pronostico_3h_mm": 0.0,
            "probabilidad_lluvia_pct": 65,
            "saturacion_suelo_pct": 48.5
        }


def run_producer(num_events=25, delay_seconds=1.0):
    gold_sample_path = "data/processed_sample/ideam_oro_sample.csv"
    if not os.path.exists(gold_sample_path):
        raise FileNotFoundError(f"No se encontró {gold_sample_path}. Ejecuta primero silver_to_gold.py")

    stations_df = pd.read_csv(gold_sample_path)
    stations = stations_df.to_dict(orient="records")

    broker = get_kafka_broker()
    print(f"[Productor Predictivo Kafka] Conectando al broker en {broker}...")

    producer = KafkaProducer(
        bootstrap_servers=[broker],
        api_version=(3, 7, 0),
        key_serializer=lambda k: str(k).encode("utf-8"),
        value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode("utf-8"),
        acks="all"
    )

    print(f"[Productor Predictivo Kafka] Emitiendo {num_events} vectores de predicción a '{TOPIC_NAME}'...\n")

    for i in range(1, num_events + 1):
        st = random.choice(stations)
        lat = float(st["latitud"])
        lon = float(st["longitud"])
        p90 = float(st["umbral_alerta_naranja"])
        p99 = float(st["umbral_alerta_roja"])

        # 1. Consultar pronóstico satelital real en las coordenadas de la estación
        forecast = fetch_forecast_by_coords(lat, lon)

        # 2. Simular o combinar escenario predictivo a T+3 horas (incluso con lluvia actual baja)
        escenario = random.choices(
            ["NORMAL", "PREDICCION_NARANJA", "PREDICCION_ROJA"],
            weights=[0.35, 0.35, 0.30]
        )[0]
        lluvia_actual_mm = round(random.uniform(0.0, max(2.0, p90 * 0.25)), 2)

        if escenario == "PREDICCION_ROJA":
            pronostico_3h_mm = round(random.uniform(p99 * 0.85, p99 * 1.15), 2)
            saturacion_antecedente_mm = round(random.uniform(p99 * 0.25, p99 * 0.40), 2)
            probabilidad_pct = random.randint(85, 99)
        elif escenario == "PREDICCION_NARANJA":
            pronostico_3h_mm = round(random.uniform(p90 * 0.75, p90 * 0.95), 2)
            saturacion_antecedente_mm = round(random.uniform(p90 * 0.25, p90 * 0.35), 2)
            probabilidad_pct = random.randint(70, 88)
        else:
            pronostico_3h_mm = forecast["pronostico_3h_mm"]
            saturacion_antecedente_mm = round(random.uniform(1.0, max(2.0, p90 * 0.20)), 2)
            probabilidad_pct = forecast["probabilidad_lluvia_pct"]

        # Índice Predictivo Total a T+3h = Saturación Antecedente + Pronóstico Próximas 3 Horas
        lluvia_predicha_acumulada_3h = round(saturacion_antecedente_mm + pronostico_3h_mm, 2)

        evento = {
            "evento_id": f"PRED-{int(time.time() * 1000)}-{i}",
            "codigoestacion": str(st["codigoestacion"]),
            "nombreestacion": st["nombreestacion"],
            "departamento": st["departamento"],
            "municipio": st["municipio"],
            "zonahidrografica": st["zonahidrografica"],
            "latitud": lat,
            "longitud": lon,
            "lluvia_actual_mm": lluvia_actual_mm,
            "saturacion_antecedente_mm": saturacion_antecedente_mm,
            "pronostico_proximas_3h_mm": pronostico_3h_mm,
            "probabilidad_lluvia_pct": probabilidad_pct,
            "saturacion_suelo_pct": forecast["saturacion_suelo_pct"],
            "valorobservado": lluvia_predicha_acumulada_3h,
            "horizonte_prediccion": "T+3 horas",
            "unidadmedida": "mm",
            "fechaobservacion": datetime.now(timezone.utc).isoformat()
        }

        future = producer.send(TOPIC_NAME, key=evento["codigoestacion"], value=evento)
        meta = future.get(timeout=10)

        print(
            f"  -> [{i:02d}/{num_events}] Estación {evento['codigoestacion']} ({evento['municipio']} | "
            f"Lat:{lat:.4f}, Lon:{lon:.4f}) | Actual: {lluvia_actual_mm} mm -> "
            f"Predicción T+3h: {lluvia_predicha_acumulada_3h} mm (Prob: {probabilidad_pct}%) | Partición: {meta.partition}"
        )
        time.sleep(delay_seconds)

    producer.flush()
    producer.close()
    print("\n[Productor Predictivo Kafka] Transmisión de vectores predictivos finalizada.")


if __name__ == "__main__":
    events_count = int(os.getenv("KAFKA_NUM_EVENTS", "25"))
    delay_sec = float(os.getenv("KAFKA_DELAY_SECONDS", "1.0"))
    run_producer(num_events=events_count, delay_seconds=delay_sec)