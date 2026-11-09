import os
import sys
import shutil
import boto3
import pyarrow as pa
import pyarrow.parquet as pq
from dotenv import load_dotenv
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import DoubleType

load_dotenv(override=False)

os.environ["PYSPARK_PYTHON"] = sys.executable
os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
MINIO_USER = os.getenv("MINIO_ROOT_USER", "admin")
MINIO_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin123")

def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_USER,
        aws_secret_access_key=MINIO_PASSWORD,
    )

def run_bronze_to_silver():
    s3 = get_s3_client()
    os.makedirs("data/full_dataset", exist_ok=True)
    local_raw_path = "data/full_dataset/ideam_raw_2000_onwards.csv"

    print("[1/4] Recuperando datos crudos (>= 2000) desde MinIO (Bucket: bronce)...")
    s3.download_file("bronce", "ideam_raw_2000_onwards.csv", local_raw_path)

    print("[2/4] Inicializando motor distribuido Apache Spark...")
    spark = (
        SparkSession.builder
        .appName("IDEAM-Bronze-To-Silver-Parquet")
        .master("local[*]")
        .config("spark.sql.session.timeZone", "America/Bogota")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    df = spark.read.option("header", "true").option("inferSchema", "true").csv(local_raw_path)

    print("[3/4] Aplicando reglas de Veracidad (Limpieza >= año 2000) y Esquema Formal...")
    df_clean = (
        df
        .withColumn("valorobservado", F.col("valorobservado").cast(DoubleType()))
        .withColumn("latitud", F.col("latitud").cast(DoubleType()))
        .withColumn("longitud", F.col("longitud").cast(DoubleType()))
        .withColumn("fecha_ts", F.to_timestamp(F.col("fechaobservacion")))
        .withColumn("anio", F.year(F.col("fecha_ts")))
        .withColumn("mes", F.month(F.col("fecha_ts")))
        .filter(
            (F.col("fecha_ts").isNotNull()) &
            (F.col("anio") >= 2000) &
            (F.col("valorobservado").isNotNull()) &
            (F.col("valorobservado") >= 0.0) &
            (F.col("valorobservado") <= 500.0) &
            (F.col("latitud").between(-4.5, 13.5)) &
            (F.col("longitud").between(-82.0, -66.0))
        )
        .withColumn("departamento", F.upper(F.trim(F.col("departamento"))))
        .withColumn("municipio", F.upper(F.trim(F.col("municipio"))))
        .withColumn("zonahidrografica", F.upper(F.trim(F.col("zonahidrografica"))))
        .dropDuplicates(["codigoestacion", "fechaobservacion"])
    )

    total_in = df.count()
    df_clean_pd = df_clean.toPandas()
    total_out = len(df_clean_pd)
    print(f"      Registros crudos: {total_in} | Registros limpios (>= 2000): {total_out}")

    silver_output_dir = "data/full_dataset/plata_parquet"
    if os.path.exists(silver_output_dir):
        shutil.rmtree(silver_output_dir)

    table = pa.Table.from_pandas(df_clean_pd)
    pq.write_to_dataset(
        table,
        root_path=silver_output_dir,
        partition_cols=["departamento", "anio"]
    )

    os.makedirs("data/processed_sample", exist_ok=True)
    df_sample_pd = df_clean_pd.head(50)
    df_sample_pd.to_parquet("data/processed_sample/ideam_plata_sample.parquet", index=False)
    df_sample_pd.to_csv("data/processed_sample/ideam_plata_sample.csv", index=False)

    print("[4/4] Sincronizando particiones Parquet hacia MinIO (Bucket: plata)...")
    for root, _, files in os.walk(silver_output_dir):
        for file in files:
            if file.endswith(".parquet"):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, silver_output_dir).replace("\\", "/")
                s3.upload_file(full_path, "plata", rel_path)

    print("      Particionamiento lógico en Parquet completado en s3://plata/")
    spark.stop()

if __name__ == "__main__":
    run_bronze_to_silver()