import os
import sys
import boto3
import pandas as pd
from dotenv import load_dotenv
from pyspark.sql import SparkSession, Window
from pyspark.sql import functions as F
from supabase import create_client

load_dotenv(override=False)

os.environ["PYSPARK_PYTHON"] = sys.executable
os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_USER = os.getenv("MINIO_ROOT_USER", "admin")
MINIO_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin123")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

SUPABASE_GOLD_COLS = [
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


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_USER,
        aws_secret_access_key=MINIO_PASSWORD,
    )


def sync_to_supabase(df_gold_pd):
    """Sincroniza el modelo predictivo de la Capa Oro hacia Supabase."""
    if not SUPABASE_URL or "tu-proyecto" in SUPABASE_URL or not SUPABASE_KEY:
        print("[!] SUPABASE_URL / SUPABASE_KEY no configuradas en .env. Omitiendo envío a la nube.")
        return

    print("[4/4] Sincronizando Capa Oro y predicciones iniciales hacia Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    records_full = df_gold_pd.to_dict(orient="records")
    records_db = []
    for row in records_full:
        clean_row = {col: row[col] for col in SUPABASE_GOLD_COLS if col in row}
        clean_row["codigoestacion"] = str(clean_row["codigoestacion"])
        records_db.append(clean_row)

    for i in range(0, len(records_db), 100):
        supabase.table("umbrales_estaciones").upsert(records_db[i:i + 100]).execute()

    print(f"      {len(records_db)} estaciones actualizadas en Supabase (tabla: umbrales_estaciones).")

    if len(records_full) >= 2:
        top_critica = sorted(records_full, key=lambda x: x["umbral_3h_p99"], reverse=True)[0]
        top_vigilancia = sorted(records_full, key=lambda x: x["umbral_3h_p90"], reverse=True)[1]

        prob_crit = int(round(min(98.0, top_critica["prob_transicion_exceso"] * 100.0 + 35.0)))
        prob_vig = int(round(min(92.0, top_vigilancia["prob_transicion_exceso"] * 100.0 + 25.0)))
        proy_crit = round(top_critica["umbral_3h_p99"] * 1.08, 2)
        proy_vig = round((top_vigilancia["umbral_3h_p90"] + top_vigilancia["umbral_3h_p99"]) / 2.0, 2)

        alertas_iniciales = [
            {
                "id": 1,
                "zona_id": "north",
                "codigoestacion": str(top_critica["codigoestacion"]),
                "titulo_alerta": f"Predicción T+3h: Riesgo de desbordamiento ({prob_crit}% prob.)",
                "tipo_alerta": "ALERTA CRÍTICA",
                "color_alerta": "red",
                "cuenca_sector": f"Cuenca {top_critica['zonahidrografica']} ({top_critica['municipio']})",
                "descripcion": (
                    f"Estación {top_critica['nombreestacion']} [Lat {top_critica['latitud']:.4f}, "
                    f"Lon {top_critica['longitud']:.4f}]: Volumen proyectado a T+3h de {proy_crit} mm "
                    f"(Umbral 3h P99={top_critica['umbral_3h_p99']} mm | Coef. escorrentía={top_critica['coef_escorrentia']} | "
                    f"Ventana de evacuación={int(top_critica['ventana_evacuacion_min'])} min)."
                ),
                "estado_prioridad": f"Evacuación Preventiva / Ventana {int(top_critica['ventana_evacuacion_min'])} min (Horizonte T+3h)",
                "precipitacion_registrada": proy_crit,
                "revisado": False
            },
            {
                "id": 2,
                "zona_id": "south",
                "codigoestacion": str(top_vigilancia["codigoestacion"]),
                "titulo_alerta": f"Predicción T+3h: Saturación y lluvia entrante ({prob_vig}% prob.)",
                "tipo_alerta": "VIGILANCIA",
                "color_alerta": "orange",
                "cuenca_sector": f"Cuenca {top_vigilancia['zonahidrografica']} ({top_vigilancia['municipio']})",
                "descripcion": (
                    f"Estación {top_vigilancia['nombreestacion']} [Lat {top_vigilancia['latitud']:.4f}, "
                    f"Lon {top_vigilancia['longitud']:.4f}]: Volumen proyectado a T+3h de {proy_vig} mm "
                    f"(Umbral 3h P90={top_vigilancia['umbral_3h_p90']} mm | API 24h={top_vigilancia['api_critico_24h_mm']} mm | "
                    f"Ventana preventiva={int(top_vigilancia['ventana_evacuacion_min'])} min)."
                ),
                "estado_prioridad": f"Vigilancia Predictiva / Ventana {int(top_vigilancia['ventana_evacuacion_min'])} min (Horizonte T+3h)",
                "precipitacion_registrada": proy_vig,
                "revisado": False
            }
        ]
        supabase.table("alertas_activas").upsert(alertas_iniciales).execute()
        print("      Pronósticos iniciales T+3h cargados en Supabase (tabla: alertas_activas).")


def run_silver_to_gold():
    silver_dir = "data/full_dataset/plata_parquet"
    if not os.path.exists(silver_dir):
        raise FileNotFoundError(f"No se encontró {silver_dir}. Ejecuta primero bronze_to_silver.py")

    print("[1/4] Inicializando Apache Spark para entrenamiento hidrológico (Silver -> Gold)...")
    spark = (
        SparkSession.builder
        .appName("IDEAM-Silver-To-Gold-Predictive-Hydrology")
        .master("local[*]")
        .config("spark.sql.session.timeZone", "America/Bogota")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    df_silver = spark.read.parquet(silver_dir).withColumn(
        "ts_epoch", F.unix_timestamp(F.col("fecha_ts"))
    )

    if "altitud_msnm" not in df_silver.columns:
        df_silver = df_silver.withColumn(
            "altitud_msnm",
            F.round(F.greatest(F.lit(80.0), (F.col("longitud") + F.lit(74.15)) * F.lit(1650.0)), 0)
        )

    print("[2/4] Calculando en Spark ventanas acumuladas 3h, saturación antecedente (API 24h/72h) y probabilidades de transición Markoviana...")

    # Ventanas temporales deslizantes por estación ordenadas por epoch (segundos)
    w_3h_rolling = Window.partitionBy("codigoestacion").orderBy("ts_epoch").rangeBetween(-10800, 0)
    w_3h_future = Window.partitionBy("codigoestacion").orderBy("ts_epoch").rangeBetween(1, 10800)
    w_24h_antecedent = Window.partitionBy("codigoestacion").orderBy("ts_epoch").rangeBetween(-86400, -1)
    w_72h_antecedent = Window.partitionBy("codigoestacion").orderBy("ts_epoch").rangeBetween(-259200, -1)

    df_windowed = (
        df_silver
        .withColumn("acumulado_3h", F.sum("valorobservado").over(w_3h_rolling))
        .withColumn("futuro_3h", F.coalesce(F.sum("valorobservado").over(w_3h_future), F.lit(0.0)))
        .withColumn("api_24h", F.coalesce(F.sum("valorobservado").over(w_24h_antecedent), F.lit(0.0)))
        .withColumn("api_72h", F.coalesce(F.sum("valorobservado").over(w_72h_antecedent), F.lit(0.0)))
    )

    # Umbral de referencia por estación en ventana de 3 horas para evaluar transiciones Markovianas
    w_station = Window.partitionBy("codigoestacion")
    df_transitions = (
        df_windowed
        .filter(F.col("valorobservado") > 0)
        .withColumn("p90_station_3h", F.expr("percentile_approx(acumulado_3h, 0.90)").over(w_station))
        .withColumn("api_p50_station", F.expr("percentile_approx(api_24h, 0.50)").over(w_station))
        .withColumn(
            "estado_saturado_t",
            F.when((F.col("api_24h") > F.col("api_p50_station")) | (F.col("acumulado_3h") >= F.col("p90_station_3h") * 0.5), 1).otherwise(0)
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
            F.round(F.expr("percentile_approx(acumulado_3h, 0.90)"), 2).alias("umbral_3h_p90"),
            F.round(F.expr("percentile_approx(acumulado_3h, 0.99)"), 2).alias("umbral_3h_p99"),
            F.round(F.greatest(F.lit(0.5), F.expr("percentile_approx(api_24h, 0.75)")), 2).alias("api_critico_24h_mm"),
            F.round(F.greatest(F.lit(1.2), F.expr("percentile_approx(api_72h, 0.75)")), 2).alias("api_critico_72h_mm"),
            F.sum("estado_saturado_t").alias("eventos_saturados"),
            F.sum("transicion_exceso_t3h").alias("eventos_transicion_exceso"),
        )
        .filter(F.col("total_lecturas") >= 10)
        .withColumn("umbral_alerta_naranja", F.col("umbral_3h_p90"))
        .withColumn("umbral_alerta_roja", F.col("umbral_3h_p99"))
        # Probabilidad condicional empírica P(Exceso_{t+3h} | Saturacion_t) suavizada con prior de Laplace
        .withColumn(
            "prob_transicion_exceso",
            F.round(
                (F.col("eventos_transicion_exceso") + F.lit(2.0)) /
                (F.greatest(F.col("eventos_saturados"), F.lit(1.0)) + F.lit(6.0)),
                4
            )
        )
        # Coeficiente de escorrentía hidrológica C_esc en función de pendiente andina (altitud) e intensidad P99/P90
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
        # Ventana de evacuación preventiva estimada en minutos antes del pico de avenida torrencial
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

    print("[3/4] Subiendo modelo predictivo de la Capa Oro a MinIO (Bucket: oro)...")
    s3 = get_s3_client()
    s3.upload_file(gold_parquet_file, "oro", "umbrales_estaciones_oro.parquet")
    print("      Archivo almacenado en s3://oro/umbrales_estaciones_oro.parquet")

    sync_to_supabase(df_gold_pd)
    spark.stop()


if __name__ == "__main__":
    run_silver_to_gold()