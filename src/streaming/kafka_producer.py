import os
import json
import time
import random
import socket
from datetime import datetime, timezone
import pandas as pd
from kafka import KafkaProducer
from dotenv import load_dotenv

load_dotenv(override=False)

TOPIC_NAME = "telemetria-precipitacion"

def get_kafka_broker():
    env_broker = os.getenv("KAFKA_BOOTSTRAP_SERVERS")
    if env_broker:
        return env_broker
    try:
        socket.gethostbyname("kafka")
        return "kafka:29092"
    except socket.gaierror:
        return "localhost:9092"

def run_producer(num_events=15, delay_seconds=2.0):
    gold_sample_path = "data/processed_sample/ideam_oro_sample.csv"
    if not os.path.exists(gold_sample_path):
        raise FileNotFoundError(f"No se encontró {gold_sample_path}. Ejecuta primero silver_to_gold.py")

    stations_df = pd.read_csv(gold_sample_path)
    stations = stations_df.to_dict(orient="records")

    broker = get_kafka_broker()
    print(f"[Productor Kafka] Conectando al broker en {broker}...")

    producer = KafkaProducer(
        bootstrap_servers=[broker],
        key_serializer=lambda k: str(k).encode("utf-8"),
        value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode("utf-8"),
        acks="all"
    )

    print(f"[Productor Kafka] Emitiendo {num_events} eventos al topic '{TOPIC_NAME}'...\n")

    for i in range(1, num_events + 1):
        st = random.choice(stations)
        p90 = float(st["umbral_alerta_naranja"])
        p99 = float(st["umbral_alerta_roja"])

        # Alternar entre lluvia normal, alerta naranja (>P90) y alerta crítica roja (>P99)
        escenario = random.choices(["NORMAL", "NARANJA", "ROJA"], weights=[0.4, 0.35, 0.25])[0]
        if escenario == "ROJA":
            valor_simulado = round(random.uniform(p99 * 1.02, p99 * 1.35), 2)
        elif escenario == "NARANJA":
            valor_simulado = round(random.uniform(p90 * 1.01, max(p90 * 1.05, p99 * 0.95)), 2)
        else:
            valor_simulado = round(random.uniform(0.5, max(1.0, p90 * 0.75)), 2)

        evento = {
            "evento_id": f"EVT-{int(time.time() * 1000)}-{i}",
            "codigoestacion": str(st["codigoestacion"]),
            "nombreestacion": st["nombreestacion"],
            "departamento": st["departamento"],
            "municipio": st["municipio"],
            "zonahidrografica": st["zonahidrografica"],
            "latitud": float(st["latitud"]),
            "longitud": float(st["longitud"]),
            "valorobservado": valor_simulado,
            "unidadmedida": "mm",
            "fechaobservacion": datetime.now(timezone.utc).isoformat()
        }

        future = producer.send(
            TOPIC_NAME,
            key=evento["codigoestacion"],
            value=evento
        )
        record_metadata = future.get(timeout=10)

        print(
            f"  -> [{i:02d}/{num_events}] Estación {evento['codigoestacion']} ({evento['municipio']}) | "
            f"Lluvia: {valor_simulado} mm | Partición: {record_metadata.partition} | Offset: {record_metadata.offset}"
        )
        time.sleep(delay_seconds)

    producer.flush()
    producer.close()
    print("\n[Productor Kafka] Transmisión de telemetría finalizada.")

if __name__ == "__main__":
    run_producer(num_events=15, delay_seconds=2.0)