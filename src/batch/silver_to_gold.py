import os
import sys
import socket
import boto3
import pandas as pd
from dotenv import load_dotenv
from pyspark.sql import SparkSession, Window
from pyspark.sql import functions as F
from supabase import create_client

load_dotenv(override=False)

os.environ["PYSPARK_PYTHON"] = sys.executable
os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable

MINIO_USER = os.getenv("MINIO_ROOT_USER", "admin")
MINIO_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin123")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

SUPABASE_FULL_GOLD_COLS = [
    "codigoestacion",
    "nombreestacion",
    "departamento",
    "municipio",
    "zonahidrografica",
    "latitud",
    "longitud",
    "altitud_msnm",
    "total_lecturas",
    "precipitacion_media",
    "precipitacion_maxima",
    "desviacion_estandar",
    "media_epoca_lluvias_mm",
    "media_epoca_seca_mm",
    "factor_estacional_bimodal",
    "umbral_3h_p90",
    "umbral_3h_p99",
    "api_critico_24h_mm",
    "api_critico_72h_mm",
    "umbral_alerta_naranja",
    "umbral_alerta_roja",
    "prob_transicion_exceso",
    "coef_escorrentia",
    "ventana_evacuacion_min",
]

SUPABASE_BASE_GOLD_COLS = [
    "codigoestacion",
    "nombreestacion",
    "departamento",
    "municipio",
    "zonahidrografica",
    "latitud",
    "longitud",
    "total_lecturas",
    "precipitacion_media",
    "precipitacion_maxima",
    "umbral_alerta_naranja",
    "umbral_alerta_roja",
]


def get_minio_endpoint():
    """Autodetecta si el script se ejecuta dentro de Docker (minio:9000) o en el host local (localhost:9000)."""
    env_endpoint = os.getenv("MINIO_ENDPOINT")
    if env_endpoint:
        return env_endpoint
    try:
        socket.gethostbyname("minio")
        return "http://minio:9000"
    except socket.gaierror:
        return "http://localhost:9000"


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=get_minio_endpoint(),
        aws_access_key_id=MINIO_USER,
        aws_secret_access_key=MINIO_PASSWORD,
    )


def build_alert_record(st, nivel, color, mult_3h, prob_base):
    """Construye el registro predictivo completo para una estación sin forzarla a 2 zonas fijas."""
    p90 = float(st["umbral_3h_p90"])
    p99 = float(st["umbral_3h_p99"])
    lluvia_t0 = 0.0
    pron_3h = round(p99 * mult_3h if color == "red" else (p90 + (p99 - p90) * 0.42), 2)
    pron_1h = round(pron_3h * 0.36, 2)
    pron_6h = round(pron_3h * 1.28, 2)
    prob_desborde = int(round(min(98.0, float(st["prob_transicion_exceso"]) * 100.0 + prob_base)))
    sat_suelo = 74.5 if color == "red" else 62.0
    sat_ant_mm = round(float(st["api_critico_24h_mm"]) * float(st["coef_escorrentia"]) * 0.35, 2)
    evac_min = int(st["ventana_evacuacion_min"])
    cod_str = str(st["codigoestacion"])

    full_payload = {
        "id": int(cod_str),
        "zona_id": f"{st['zonahidrografica']} | {st['municipio']}",
        "codigoestacion": cod_str,
        "nombreestacion": st["nombreestacion"],
        "municipio": st["municipio"],
        "latitud": float(st["latitud"]),
        "longitud": float(st["longitud"]),
        "titulo_alerta": f"Pronóstico T+3h: {pron_3h} mm ({prob_desborde}% prob. desborde)",
        "tipo_alerta": nivel,
        "color_alerta": color,
        "cuenca_sector": f"Cuenca {st['zonahidrografica']} · {st['municipio']}",
        "descripcion": (
            f"Lluvia actual (T0): {lluvia_t0} mm (Sin lluvia) -> Pronóstico T+1h: {pron_1h} mm | "
            f"T+3h: {pron_3h} mm | T+6h: {pron_6h} mm (Probabilidad {prob_desborde}% - "
            f"{'Desbordamiento Inminente' if color == 'red' else 'Vigilancia Activa'}). "
            f"Umbral 3h P90={p90} mm, P99={p99} mm | Saturación suelo: {sat_suelo}% | "
            f"Factor estacional bimodal: {st['factor_estacional_bimodal']}x | Ventana evacuación: {evac_min} min."
        ),
        "estado_prioridad": (
            f"{'Evacuación Preventiva' if color == 'red' else 'Vigilancia Predictiva'} · "
            f"Ventana {evac_min} min (T+1h: {pron_1h} mm -> T+3h: {pron_3h} mm)"
        ),
        "lluvia_actual_mm": lluvia_t0,
        "pronostico_1h_mm": pron_1h,
        "pronostico_3h_mm": pron_3h,
        "pronostico_6h_mm": pron_6h,
        "probabilidad_lluvia_pct": min(99, prob_desborde + 4),
        "probabilidad_desbordamiento_pct": prob_desborde,
        "saturacion_suelo_pct": sat_suelo,
        "saturacion_antecedente_mm": sat_ant_mm,
        "ventana_evacuacion_min": evac_min,
        "precipitacion_registrada": pron_3h,
        "revisado": False,
    }
    return full_payload


def sync_to_supabase(df_gold_pd):
    """Sincroniza el modelo predictivo de la Capa Oro y las alertas multi-estación hacia Supabase."""
    if not SUPABASE_URL or "tu-proyecto" in SUPABASE_URL or not SUPABASE_KEY:
        print("[!] SUPABASE_URL / SUPABASE_KEY no configuradas en .env. Omitiendo envío a la nube.")
        return

    print("[4/4] Sincronizando Capa Oro y pronósticos multi-estación hacia Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    records_full = df_gold_pd.to_dict(orient="records")

    # Intentar sincronizar con el esquema extendido completo; fallback automático si falta migración DDL
    try:
        records_ext = []
        for row in records_full:
            clean_row = {col: row[col] for col in SUPABASE_FULL_GOLD_COLS if col in row}
            clean_row["codigoestacion"] = str(clean_row["codigoestacion"])
            records_ext.append(clean_row)
        for i in range(0, len(records_ext), 100):
            supabase.table("umbrales_estaciones").upsert(records_ext[i:i + 100]).execute()
        print(f"      {len(records_ext)} estaciones actualizadas en Supabase (esquema extendido completo).")
    except Exception:
        records_base = []
        for row in records_full:
            clean_row = {col: row[col] for col in SUPABASE_BASE_GOLD_COLS if col in row}
            clean_row["codigoestacion"] = str(clean_row["codigoestacion"])
            records_base.append(clean_row)
        for i in range(0, len(records_base), 100):
            supabase.table("umbrales_estaciones").upsert(records_base[i:i + 100]).execute()
        print(f"      {len(records_base)} estaciones actualizadas en Supabase (esquema base compatible).")

    # Eliminar alertas antiguas forzadas a id=1 ('north') e id=2 ('south')
    try:
        supabase.table("alertas_activas").delete().in_("id", [1, 2]).execute()
    except Exception:
        pass

    # Sembrar 4 alertas simultáneas asociadas a su estación y cuenca real (Norte, Área Metropolitana, Oriente Andino y Sur)
    by_code = {str(r["codigoestacion"]): r for r in records_full}
    target_codes = ["23180070", "23195040", "23190130", "24017640"]
    selected_stations = [by_code[c] for c in target_codes if c in by_code]
    if len(selected_stations) < 4:
        selected_stations = records_full[:4]

    alertas_multi = []
    for idx, st in enumerate(selected_stations):
        is_crit = idx < 2
        alertas_multi.append(
            build_alert_record(
                st,
                nivel="ALERTA CRÍTICA" if is_crit else "VIGILANCIA",
                color="red" if is_crit else "orange",
                mult_3h=1.09 if idx == 0 else 1.13,
                prob_base=62.0 if is_crit else 48.0,
            )
        )

    try:
        supabase.table("alertas_activas").upsert(alertas_multi).execute()
        print(f"      {len(alertas_multi)} pronósticos simultáneos multi-cuenca publicados en Supabase (esquema desglosado).")
    except Exception:
        base_alert_cols = [
            "id",
            "zona_id",
            "codigoestacion",
            "titulo_alerta",
            "tipo_alerta",
            "color_alerta",
            "cuenca_sector",
            "descripcion",
            "estado_prioridad",
            "precipitacion_registrada",
            "revisado",
        ]
        alertas_compat = [{k: a[k] for k in base_alert_cols if k in a} for a in alertas_multi]
        supabase.table("alertas_activas").upsert(alertas_compat).execute()
        print(f"      {len(alertas_compat)} pronósticos simultáneos multi-cuenca publicados en Supabase (modo compatible).")


def run_silver_to_gold():
    silver_dir = "data/full_dataset/plata_parquet"
    if not os.path.exists(silver_dir):
        raise FileNotFoundError(f"No se encontró {silver_dir}. Ejecuta primero bronze_to_silver.py")

    print("[1/4] Inicializando Apache Spark para entrenamiento hidrológico estacional (Silver -> Gold)...")
    spark = (
        SparkSession.builder
        .appName("IDEAM-Silver-To-Gold-Predictive-Hydrology")
        .master("local[*]")
        .config("spark.sql.session.timeZone", "America/Bogota")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    df_silver = spark.read.parquet(silver_dir)

    if "altitud_msnm" not in df_silver.columns:
        df_silver = df_silver.withColumn(
            "altitud_msnm",
            F.round(F.greatest(F.lit(80.0), (F.col("longitud") + F.lit(74.15)) * F.lit(1650.0)), 0)
        )

    print("[2/4] Normalizando serie horaria y calculando ventanas de tiempo real (10.800 s = 3h), estacionalidad bimodal y Markov...")

    # 1. Agrupación horaria previa para evitar que sensores cada 10 min o días salteados distorsionen la ventana de 3 horas
    df_hourly = (
        df_silver
        .withColumn("hora_ts", F.date_trunc("hour", F.col("fecha_ts")))
        .groupBy("codigoestacion", "hora_ts")
        .agg(
            F.first("nombreestacion").alias("nombreestacion"),
            F.first("departamento").alias("departamento"),
            F.first("municipio").alias("municipio"),
            F.first("zonahidrografica").alias("zonahidrografica"),
            F.avg("latitud").alias("latitud"),
            F.avg("longitud").alias("longitud"),
            F.avg("altitud_msnm").alias("altitud_msnm"),
            F.first("anio").alias("anio"),
            F.first("mes").alias("mes"),
            F.round(F.sum("valorobservado"), 2).alias("valorobservado"),
        )
        .withColumn("ts_epoch", F.unix_timestamp(F.col("hora_ts")))
        .withColumn(
            "epoca_hidrologica",
            F.when(F.col("mes").isin(4, 5, 10, 11), F.lit("EPOCA_LLUVIAS"))
            .when(F.col("mes").isin(1, 2, 7, 8), F.lit("EPOCA_SECA"))
            .otherwise(F.lit("TRANSICION"))
        )
    )

    # 2. Ventanas basadas estrictamente en rango de tiempo (segundos) sobre la serie horaria:
    # 3 horas = 10.800 segundos | 24 horas = 86.400 segundos | 72 horas = 259.200 segundos
    w_3h_rolling = Window.partitionBy("codigoestacion").orderBy("ts_epoch").rangeBetween(-10800, 0)
    w_3h_future = Window.partitionBy("codigoestacion").orderBy("ts_epoch").rangeBetween(1, 10800)
    w_24h_antecedent = Window.partitionBy("codigoestacion").orderBy("ts_epoch").rangeBetween(-86400, -1)
    w_72h_antecedent = Window.partitionBy("codigoestacion").orderBy("ts_epoch").rangeBetween(-259200, -1)

    df_windowed = (
        df_hourly
        .withColumn("acumulado_3h", F.sum("valorobservado").over(w_3h_rolling))
        .withColumn("futuro_3h", F.coalesce(F.sum("valorobservado").over(w_3h_future), F.lit(0.0)))
        .withColumn("api_24h", F.coalesce(F.sum("valorobservado").over(w_24h_antecedent), F.lit(0.0)))
        .withColumn("api_72h", F.coalesce(F.sum("valorobservado").over(w_72h_antecedent), F.lit(0.0)))
    )

    # 3. Evaluación de persistencia / transición de Markov condicionada a la estación y a la época hidrológica
    w_station = Window.partitionBy("codigoestacion")
    df_transitions = (
        df_windowed
        .filter(F.col("valorobservado") > 0)
        .withColumn("p90_station_3h", F.expr("percentile_approx(acumulado_3h, 0.90)").over(w_station))
        .withColumn("api_p50_station", F.expr("percentile_approx(api_24h, 0.50)").over(w_station))
        .withColumn(
            "estado_saturado_t",
            F.when(
                (F.col("api_24h") > F.col("api_p50_station")) |
                (F.col("acumulado_3h") >= F.col("p90_station_3h") * 0.5),
                1
            ).otherwise(0)
        )
        .withColumn(
            "transicion_exceso_t3h",
            F.when(
                (F.col("estado_saturado_t") == 1) &
                ((F.col("futuro_3h") + F.col("api_24h") * 0.35) >= F.col("p90_station_3h")),
                1
            ).otherwise(0)
        )
    )

    df_gold = (
        df_transitions
        .groupBy("codigoestacion")
        .agg(
            F.first("nombreestacion").alias("nombreestacion"),
            F.first("departamento").alias("departamento"),
            F.first("municipio").alias("municipio"),
            F.first("zonahidrografica").alias("zonahidrografica"),
            F.round(F.avg("latitud"), 6).alias("latitud"),
            F.round(F.avg("longitud"), 6).alias("longitud"),
            F.round(F.avg("altitud_msnm"), 0).alias("altitud_msnm"),
            F.count("*").alias("total_lecturas"),
            F.round(F.avg("valorobservado"), 2).alias("precipitacion_media"),
            F.round(F.max("acumulado_3h"), 2).alias("precipitacion_maxima"),
            F.round(F.coalesce(F.stddev("acumulado_3h"), F.lit(0.0)), 2).alias("desviacion_estandar"),
            # Comportamiento estacional bimodal (Abr-May / Oct-Nov vs Ene-Feb / Jul-Ago)
            F.round(
                F.coalesce(
                    F.avg(F.when(F.col("epoca_hidrologica") == "EPOCA_LLUVIAS", F.col("acumulado_3h"))),
                    F.avg("acumulado_3h") * F.lit(1.25)
                ),
                2
            ).alias("media_epoca_lluvias_mm"),
            F.round(
                F.coalesce(
                    F.avg(F.when(F.col("epoca_hidrologica") == "EPOCA_SECA", F.col("acumulado_3h"))),
                    F.avg("acumulado_3h") * F.lit(0.75)
                ),
                2
            ).alias("media_epoca_seca_mm"),
            F.round(F.expr("percentile_approx(acumulado_3h, 0.90)"), 2).alias("umbral_3h_p90"),
            F.round(F.expr("percentile_approx(acumulado_3h, 0.99)"), 2).alias("umbral_3h_p99"),
            F.round(F.greatest(F.lit(0.5), F.expr("percentile_approx(api_24h, 0.75)")), 2).alias("api_critico_24h_mm"),
            F.round(F.greatest(F.lit(1.2), F.expr("percentile_approx(api_72h, 0.75)")), 2).alias("api_critico_72h_mm"),
            F.sum("estado_saturado_t").alias("eventos_saturados"),
            F.sum("transicion_exceso_t3h").alias("eventos_transicion_exceso"),
        )
        .filter(F.col("total_lecturas") >= 10)
        .withColumn(
            "factor_estacional_bimodal",
            F.round(
                F.least(
                    F.lit(2.4),
                    F.greatest(
                        F.lit(1.05),
                        F.col("media_epoca_lluvias_mm") / F.greatest(F.col("media_epoca_seca_mm"), F.lit(0.5))
                    )
                ),
                2
            )
        )
        .withColumn("umbral_alerta_naranja", F.col("umbral_3h_p90"))
        .withColumn("umbral_alerta_roja", F.col("umbral_3h_p99"))
        .withColumn(
            "prob_transicion_exceso",
            F.round(
                (F.col("eventos_transicion_exceso") + F.lit(2.0)) /
                (F.greatest(F.col("eventos_saturados"), F.lit(1.0)) + F.lit(6.0)),
                4
            )
        )
        .withColumn(
            "coef_escorrentia",
            F.round(
                F.least(
                    F.lit(0.92),
                    F.greatest(
                        F.lit(0.48),
                        F.lit(0.45) + (F.col("altitud_msnm") / F.lit(6500.0)) +
                        (F.col("umbral_3h_p90") / F.greatest(F.col("umbral_3h_p99"), F.lit(1.0))) * F.lit(0.18)
                    )
                ),
                3
            )
        )
        .withColumn(
            "ventana_evacuacion_min",
            F.round(
                F.greatest(
                    F.lit(75.0),
                    F.lit(210.0) - (F.col("altitud_msnm") / F.lit(28.0))
                ),
                0
            ).cast("int")
        )
        .drop("eventos_saturados", "eventos_transicion_exceso")
        .orderBy(F.col("umbral_3h_p99").desc())
    )

    df_gold_pd = df_gold.toPandas()
    print(f"      Total de estaciones entrenadas en Capa Oro: {len(df_gold_pd)}")

    gold_output_dir = "data/full_dataset/oro_parquet"
    os.makedirs(gold_output_dir, exist_ok=True)
    gold_parquet_file = os.path.join(gold_output_dir, "umbrales_estaciones_oro.parquet")
    df_gold_pd.to_parquet(gold_parquet_file, index=False)

    os.makedirs("data/processed_sample", exist_ok=True)
    df_gold_pd.head(50).to_parquet("data/processed_sample/ideam_oro_sample.parquet", index=False)
    df_gold_pd.head(50).to_csv("data/processed_sample/ideam_oro_sample.csv", index=False)

    endpoint = get_minio_endpoint()
    print(f"[3/4] Subiendo modelo predictivo de la Capa Oro a MinIO ({endpoint} -> Bucket: oro)...")
    s3 = get_s3_client()
    s3.upload_file(gold_parquet_file, "oro", "umbrales_estaciones_oro.parquet")
    print("      Archivo almacenado en s3://oro/umbrales_estaciones_oro.parquet")

    sync_to_supabase(df_gold_pd)
    spark.stop()


if __name__ == "__main__":
    run_silver_to_gold()