import os
import json
import socket
import pandas as pd
from kafka import KafkaConsumer
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(override=False)

TOPIC_NAME = "telemetria-precipitacion"
GROUP_ID = "centro-mando-hidroclimatico"

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

def get_kafka_broker():
    env_broker = os.getenv("KAFKA_BOOTSTRAP_SERVERS")
    if env_broker:
        return env_broker
    try:
        socket.gethostbyname("kafka")
        return "kafka:29092"
    except socket.gaierror:
        return "localhost:9092"

def load_gold_thresholds():
    gold_sample_path = "data/processed_sample/ideam_oro_sample.csv"
    df = pd.read_csv(gold_sample_path)
    df["codigoestacion"] = df["codigoestacion"].astype(str)
    return df.set_index("codigoestacion").to_dict(orient="index")

def run_consumer(max_messages=15):
    thresholds = load_gold_thresholds()
    broker = get_kafka_broker()

    supabase = None
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print(f"[Consumidor Kafka] Conectado a {broker} | Grupo: '{GROUP_ID}'")
    print(f"[Consumidor Kafka] Esperando telemetría en '{TOPIC_NAME}' (procesará {max_messages} eventos)...\n")

    consumer = KafkaConsumer(
        TOPIC_NAME,
        bootstrap_servers=[broker],
        group_id=GROUP_ID,
        auto_offset_reset="earliest",
        enable_auto_commit=True,
        key_deserializer=lambda k: k.decode("utf-8") if k else None,
        value_deserializer=lambda v: json.loads(v.decode("utf-8"))
    )

    processed_events = []
    count = 0

    for msg in consumer:
        evento = msg.value
        cod = str(evento["codigoestacion"])
        lluvia = float(evento["valorobservado"])
        ref = thresholds.get(cod)

        if not ref:
            continue

        p90 = float(ref["umbral_alerta_naranja"])
        p99 = float(ref["umbral_alerta_roja"])

        if lluvia >= p99:
            nivel = "ALERTA CRÍTICA"
            color = "red"
            zona_id = "north"
            alerta_id = 1
            titulo = "Desbordamiento inminente en 2 horas"
            prioridad = "Prioridad crítica / horizonte 2 h"
            descripcion = (
                f"Estación {evento['nombreestacion']} registró {lluvia} mm "
                f"(supera umbral crítico P99 de {p99} mm)."
            )
        elif lluvia >= p90:
            nivel = "VIGILANCIA"
            color = "orange"
            zona_id = "south"
            alerta_id = 2
            titulo = "Lluvia intensa persistente"
            prioridad = "Vigilancia / seguimiento preventivo"
            descripcion = (
                f"Estación {evento['nombreestacion']} registró {lluvia} mm "
                f"(supera umbral P90 de {p90} mm)."
            )
        else:
            nivel = "NORMAL"
            color = "green"
            zona_id = "none"
            alerta_id = None
            titulo = "Precipitación dentro del rango normal"
            prioridad = "Monitoreo estándar"
            descripcion = f"Lectura normal ({lluvia} mm < P90 {p90} mm)."

        print(f"  <- [{nivel}] {evento['municipio']} ({evento['nombreestacion']}): {lluvia} mm (P90={p90}, P99={p99})")

        # Si hay alerta naranja o roja, actualizar Supabase en vivo
        if alerta_id and supabase:
            payload = {
                "id": alerta_id,
                "zona_id": zona_id,
                "codigoestacion": cod,
                "titulo_alerta": titulo,
                "tipo_alerta": nivel,
                "color_alerta": color,
                "cuenca_sector": f"Cuenca {evento['zonahidrografica']} ({evento['municipio']})",
                "descripcion": descripcion,
                "estado_prioridad": prioridad,
                "precipitacion_registrada": lluvia,
                "revisado": False,
                "fecha_evento": evento["fechaobservacion"]
            }
            supabase.table("alertas_activas").upsert(payload).execute()
            print(f"     [Supabase Realtime] Escenario '{zona_id}' actualizado en vivo.")

        evento_procesado = {
            **evento,
            "umbral_p90": p90,
            "umbral_p99": p99,
            "clasificacion_riesgo": nivel,
            "particion_kafka": msg.partition,
            "offset_kafka": msg.offset
        }
        processed_events.append(evento_procesado)

        count += 1
        if count >= max_messages:
            break

    consumer.close()

    # Guardar muestra procesada de streaming para GitHub (Rúbrica Código Fuente)
    if processed_events:
        os.makedirs("data/processed_sample", exist_ok=True)
        df_stream = pd.DataFrame(processed_events)
        df_stream.to_csv("data/processed_sample/ideam_streaming_alerts_sample.csv", index=False)
        with open("data/processed_sample/ideam_streaming_alerts_sample.json", "w", encoding="utf-8") as f:
            json.dump(processed_events, f, ensure_ascii=False, indent=2)
        print(f"\n[Consumidor Kafka] Muestra de {len(processed_events)} eventos guardada en data/processed_sample/")

if __name__ == "__main__":
    run_consumer(max_messages=15)