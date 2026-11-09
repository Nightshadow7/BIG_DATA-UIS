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


def run_consumer(max_messages=25):
    thresholds = load_gold_thresholds()
    broker = get_kafka_broker()

    supabase = None
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print(f"[Consumidor Predictivo Kafka] Conectado a {broker} | Grupo: '{GROUP_ID}'")
    print(f"[Consumidor Predictivo Kafka] Evaluando predicciones T+3h en '{TOPIC_NAME}'...\n")

    consumer = KafkaConsumer(
        TOPIC_NAME,
        bootstrap_servers=[broker],
        api_version=(3, 7, 0),
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
        if "horizonte_prediccion" not in evento:
            continue

        cod = str(evento["codigoestacion"])
        prediccion_3h = float(evento["valorobservado"])
        lluvia_actual = float(evento.get("lluvia_actual_mm", 0.0))
        prob_pct = int(evento.get("probabilidad_lluvia_pct", 80))
        lat = float(evento["latitud"])
        lon = float(evento["longitud"])

        ref = thresholds.get(cod)
        if not ref:
            continue

        p90 = float(ref["umbral_alerta_naranja"])
        p99 = float(ref["umbral_alerta_roja"])

        if prediccion_3h >= p99:
            nivel = "ALERTA CRÍTICA"
            color = "red"
            zona_id = "north"
            alerta_id = 1
            titulo = f"Predicción T+3h: Riesgo de desbordamiento ({prob_pct}% prob.)"
            prioridad = "Alerta Temprana Predictiva / Horizonte T+3h"
            descripcion = (
                f"Estación {evento['nombreestacion']} [Lat {lat:.4f}, Lon {lon:.4f}]: "
                f"Lluvia actual de {lluvia_actual} mm, pero se proyectan {prediccion_3h} mm acumulados "
                f"en las próximas 3h (supera P99 histórico de {p99} mm)."
            )
        elif prediccion_3h >= p90:
            nivel = "VIGILANCIA"
            color = "orange"
            zona_id = "south"
            alerta_id = 2
            titulo = f"Predicción T+3h: Lluvia severa entrante ({prob_pct}% prob.)"
            prioridad = "Vigilancia Predictiva / Horizonte T+3h"
            descripcion = (
                f"Estación {evento['nombreestacion']} [Lat {lat:.4f}, Lon {lon:.4f}]: "
                f"Lluvia actual de {lluvia_actual} mm, con proyección de {prediccion_3h} mm en 3h "
                f"(supera P90 histórico de {p90} mm)."
            )
        else:
            nivel = "NORMAL"
            color = "green"
            zona_id = "none"
            alerta_id = None
            titulo = "Pronóstico T+3h estable"
            prioridad = "Sin riesgo proyectado"
            descripcion = f"Proyección a 3h ({prediccion_3h} mm) inferior al umbral P90 ({p90} mm)."

        print(
            f"  <- [{nivel}] {evento['municipio']} (Lat:{lat:.3f}, Lon:{lon:.3f}) | "
            f"Actual: {lluvia_actual} mm -> Predicción T+3h: {prediccion_3h} mm (P90={p90}, P99={p99})"
        )

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
                "precipitacion_registrada": prediccion_3h,
                "revisado": False,
                "fecha_evento": evento["fechaobservacion"]
            }
            supabase.table("alertas_activas").upsert(payload).execute()
            print(f"     [Supabase Realtime] Predicción temprana '{zona_id}' publicada en vivo.")

        processed_events.append({
            **evento,
            "umbral_p90": p90,
            "umbral_p99": p99,
            "clasificacion_predictiva": nivel,
            "particion_kafka": msg.partition,
            "offset_kafka": msg.offset
        })

        count += 1
        if count >= max_messages:
            break

    consumer.close()

    if processed_events:
        os.makedirs("data/processed_sample", exist_ok=True)
        pd.DataFrame(processed_events).to_csv("data/processed_sample/ideam_streaming_alerts_sample.csv", index=False)
        with open("data/processed_sample/ideam_streaming_alerts_sample.json", "w", encoding="utf-8") as f:
            json.dump(processed_events, f, ensure_ascii=False, indent=2)
        print(f"\n[Consumidor Predictivo Kafka] Muestra guardada en data/processed_sample/ ({len(processed_events)} eventos)")


if __name__ == "__main__":
    max_msgs = int(os.getenv("KAFKA_MAX_MESSAGES", "25"))
    run_consumer(max_messages=max_msgs)