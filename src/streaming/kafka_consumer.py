import os
import json
import socket
import argparse
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


def persist_sample(processed_events):
    """Guarda la muestra verificable de los últimos eventos procesados (hasta 50 filas)."""
    if not processed_events:
        return
    os.makedirs("data/processed_sample", exist_ok=True)
    recent = processed_events[-50:]
    pd.DataFrame(recent).to_csv("data/processed_sample/ideam_streaming_alerts_sample.csv", index=False)
    with open("data/processed_sample/ideam_streaming_alerts_sample.json", "w", encoding="utf-8") as f:
        json.dump(recent, f, ensure_ascii=False, indent=2)


def run_consumer(max_messages=None):
    thresholds = load_gold_thresholds()
    broker = get_kafka_broker()

    supabase = None
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    mode_str = f"lote de {max_messages} eventos" if max_messages else "escucha continua en vivo (Ctrl+C para detener)"
    print(f"[Consumidor Predictivo Kafka] Conectado a {broker} | Grupo: '{GROUP_ID}'")
    print(f"[Consumidor Predictivo Kafka] Evaluando predicciones T+3h/T+6h en '{TOPIC_NAME}' ({mode_str})...\n")

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

    try:
        for msg in consumer:
            evento = msg.value
            if "horizonte_prediccion" not in evento:
                continue

            cod = str(evento["codigoestacion"])
            ref = thresholds.get(cod)
            if not ref:
                continue

            prediccion_3h = float(evento["valorobservado"])
            prediccion_6h = float(evento.get("volumen_proyectado_6h_mm", prediccion_3h))
            lluvia_actual = float(evento.get("lluvia_actual_mm", 0.0))
            prob_desborde = int(evento.get("probabilidad_desbordamiento_pct", evento.get("probabilidad_lluvia_pct", 75)))
            saturacion_suelo = float(evento.get("saturacion_suelo_pct", 45.0))
            ventana_evac = int(evento.get("ventana_evacuacion_min", ref.get("ventana_evacuacion_min", 150)))
            lat = float(evento["latitud"])
            lon = float(evento["longitud"])

            p90_3h = float(ref.get("umbral_3h_p90", ref["umbral_alerta_naranja"]))
            p99_3h = float(ref.get("umbral_3h_p99", ref["umbral_alerta_roja"]))
            coef_esc = float(ref.get("coef_escorrentia", 0.65))
            volumen_evaluado = max(prediccion_3h, round(prediccion_6h * 0.9, 2))

            if prediccion_3h >= p99_3h or volumen_evaluado >= p99_3h:
                nivel = "ALERTA CRÍTICA"
                color = "red"
                zona_id = "north"
                alerta_id = 1
                titulo = f"Predicción T+3h/T+6h: Riesgo de desbordamiento ({prob_desborde}% prob.)"
                prioridad = f"Evacuación Preventiva / Ventana {ventana_evac} min (Horizonte T+3h)"
                descripcion = (
                    f"Estación {evento['nombreestacion']} [Lat {lat:.4f}, Lon {lon:.4f}]: "
                    f"Volumen proyectado T+3h={prediccion_3h} mm (T+6h={prediccion_6h} mm) supera Umbral 3h P99 ({p99_3h} mm). "
                    f"Saturación suelo: {saturacion_suelo}% | Coef. escorrentía Spark: {coef_esc} | Lluvia actual: {lluvia_actual} mm."
                )
            elif prediccion_3h >= p90_3h or prediccion_6h >= p90_3h:
                nivel = "VIGILANCIA"
                color = "orange"
                zona_id = "south"
                alerta_id = 2
                titulo = f"Predicción T+3h/T+6h: Saturación y lluvia entrante ({prob_desborde}% prob.)"
                prioridad = f"Vigilancia Predictiva / Ventana {ventana_evac} min (Horizonte T+3h/T+6h)"
                descripcion = (
                    f"Estación {evento['nombreestacion']} [Lat {lat:.4f}, Lon {lon:.4f}]: "
                    f"Volumen proyectado T+3h={prediccion_3h} mm / T+6h={prediccion_6h} mm supera Umbral 3h P90 ({p90_3h} mm). "
                    f"Saturación suelo: {saturacion_suelo}% | Lluvia actual: {lluvia_actual} mm."
                )
            else:
                nivel = "NORMAL"
                color = "green"
                zona_id = "none"
                alerta_id = None
                titulo = "Pronóstico T+3h/T+6h dentro de capacidad de cuenca"
                prioridad = "Sin riesgo de desbordamiento proyectado"
                descripcion = f"Proyección acumulada T+3h ({prediccion_3h} mm) y T+6h ({prediccion_6h} mm) inferior al umbral 3h P90 ({p90_3h} mm)."

            print(
                f"  <- [{nivel}] {evento['municipio']} (Lat:{lat:.3f}, Lon:{lon:.3f}) | "
                f"T+3h: {prediccion_3h} mm | T+6h: {prediccion_6h} mm (3h-P90={p90_3h}, 3h-P99={p99_3h} | "
                f"Desborde: {prob_desborde}%, Evac: {ventana_evac} min)"
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
                "umbral_3h_p90": p90_3h,
                "umbral_3h_p99": p99_3h,
                "clasificacion_predictiva": nivel,
                "particion_kafka": msg.partition,
                "offset_kafka": msg.offset
            })
            persist_sample(processed_events)

            count += 1
            if max_messages is not None and count >= max_messages:
                break
    except KeyboardInterrupt:
        print("\n[Consumidor Predictivo Kafka] Detenido manualmente por el usuario.")
    finally:
        consumer.close()
        persist_sample(processed_events)
        print(f"\n[Consumidor Predictivo Kafka] Sesión cerrada ({len(processed_events)} eventos evaluados y guardados en data/processed_sample/).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Consumidor de Inferencia Hidrológica en Tiempo Real (Apache Kafka -> Supabase Realtime)"
    )
    env_max = os.getenv("KAFKA_MAX_MESSAGES")
    parser.add_argument(
        "--max-messages",
        type=int,
        default=int(env_max) if env_max else None,
        help="Límite opcional de mensajes a procesar (por defecto None = flujo continuo infinito)"
    )
    args = parser.parse_args()
    run_consumer(max_messages=args.max_messages)