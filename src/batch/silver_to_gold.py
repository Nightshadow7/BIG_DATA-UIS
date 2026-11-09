import os
import sys
import shutil
import boto3
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from dotenv import load_dotenv
from pyspark.sql import SparkSession
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

def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_USER,
        aws_secret_access_key=MINIO_PASSWORD,
    )

def sync_to_supabase(df_gold_pd):
    """Sincroniza la Capa Oro calculada en Spark hacia Supabase."""
    if not SUPABASE_URL or "tu-proyecto" in SUPABASE_URL or not SUPABASE_KEY:
        print("[!] SUPABASE_URL / SUPABASE_KEY no configuradas en .env. Omitiendo envío a la nube.")
        return

    print("[4/4] Sincronizando Capa Oro y escenarios hacia Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    records = df_gold_pd.to_dict(orient="records")
    for row in records:
        row["codigoestacion"] = str(row["codigoestacion"])

    # Upsert en lotes de 100 estaciones
    for i in range(0, len(records), 100):
        supabase.table("umbrales_estaciones").upsert(records[i:i+100]).execute()

    print(f"      {len(records)} estaciones actualizadas en Supabase (tabla: umbrales_estaciones).")

    # Crear las 2 alertas iniciales basadas en las estaciones con mayor riesgo real del dataset
    if len(records) >= 2:
        top_critica = sorted(records, key=lambda x: x["umbral_alerta_roja"], reverse=True)[0]
        top_vigilancia = sorted(records, key=lambda x: x["umbral_alerta_naranja"], reverse=True)[1]

        alertas_iniciales = [
            {
                "id": 1,
                "zona_id": "north",
                "codigoestacion": top_critica["codigoestacion"],
                "titulo_alerta": "Desbordamiento inminente en 2 horas",
                "tipo_alerta": "ALERTA CRÍTICA",
                "color_alerta": "red",
                "cuenca_sector": f"Cuenca {top_critica['zonahidrografica']} ({top_critica['municipio']})",
                "descripcion": f"Estación {top_critica['nombreestacion']} supera percentil 99 ({top_critica['umbral_alerta_roja']:.1f} mm).",
                "estado_prioridad": "Prioridad crítica / horizonte 2 h",
                "precipitacion_registrada": round(top_critica["precipitacion_maxima"], 2),
                "revisado": False
            },
            {
                "id": 2,
                "zona_id": "south",
                "codigoestacion": top_vigilancia["codigoestacion"],
                "titulo_alerta": "Lluvia intensa persistente",
                "tipo_alerta": "VIGILANCIA",
                "color_alerta": "orange",
                "cuenca_sector": f"Sector agrícola {top_vigilancia['municipio']} ({top_vigilancia['zonahidrografica']})",
                "descripcion": f"Estación {top_vigilancia['nombreestacion']} supera umbral P90 ({top_vigilancia['umbral_alerta_naranja']:.1f} mm).",
                "estado_prioridad": "Vigilancia / seguimiento preventivo",
                "precipitacion_registrada": round(top_vigilancia["umbral_alerta_naranja"], 2),
                "revisado": False
            }
        ]
        supabase.table("alertas_activas").upsert(alertas_iniciales).execute()
        print("      Alertas operativas iniciales cargadas en Supabase (tabla: alertas_activas).")

def run_silver_to_gold():
    silver_dir = "data/full_dataset/plata_parquet"
    if not os.path.exists(silver_dir):
        raise FileNotFoundError(f"No se encontró {silver_dir}. Ejecuta primero bronze_to_silver.py")

    print("[1/4] Inicializando Apache Spark para procesamiento analítico (Silver -> Gold)...")
    spark = (
        SparkSession.builder
        .appName("IDEAM-Silver-To-Gold-Analytics")
        .master("local[*]")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    df_silver = spark.read.parquet(silver_dir)
    df_silver.createOrReplaceTempView("precipitaciones_plata")

    print("[2/4] Calculando modelo de resiliencia climática (Percentiles P90 y P99 por estación)...")
    df_gold = spark.sql("""
        SELECT
            CAST(codigoestacion AS STRING) AS codigoestacion,
            FIRST(nombreestacion) AS nombreestacion,
            FIRST(departamento) AS departamento,
            FIRST(municipio) AS municipio,
            FIRST(zonahidrografica) AS zonahidrografica,
            ROUND(AVG(latitud), 6) AS latitud,
            ROUND(AVG(longitud), 6) AS longitud,
            COUNT(*) AS total_lecturas,
            ROUND(AVG(valorobservado), 2) AS precipitacion_media,
            ROUND(MAX(valorobservado), 2) AS precipitacion_maxima,
            ROUND(percentile_approx(valorobservado, 0.90), 2) AS umbral_alerta_naranja,
            ROUND(percentile_approx(valorobservado, 0.99), 2) AS umbral_alerta_roja
        FROM precipitaciones_plata
        WHERE valorobservado > 0
        GROUP BY codigoestacion
        HAVING COUNT(*) >= 10
        ORDER BY umbral_alerta_roja DESC
    """)

    df_gold_pd = df_gold.toPandas()
    print(f"      Total de estaciones modeladas en Capa Oro: {len(df_gold_pd)}")

    # Guardar en formato Parquet local y muestra para GitHub (20-100 registros)
    gold_output_dir = "data/full_dataset/oro_parquet"
    os.makedirs(gold_output_dir, exist_ok=True)
    gold_parquet_file = os.path.join(gold_output_dir, "umbrales_estaciones_oro.parquet")
    df_gold_pd.to_parquet(gold_parquet_file, index=False)

    os.makedirs("data/processed_sample", exist_ok=True)
    df_gold_pd.head(50).to_parquet("data/processed_sample/ideam_oro_sample.parquet", index=False)
    df_gold_pd.head(50).to_csv("data/processed_sample/ideam_oro_sample.csv", index=False)

    print("[3/4] Subiendo producto de datos analítico a MinIO (Bucket: oro)...")
    s3 = get_s3_client()
    s3.upload_file(gold_parquet_file, "oro", "umbrales_estaciones_oro.parquet")
    print("      Archivo almacenado en s3://oro/umbrales_estaciones_oro.parquet")

    sync_to_supabase(df_gold_pd)
    spark.stop()

if __name__ == "__main__":
    run_silver_to_gold()