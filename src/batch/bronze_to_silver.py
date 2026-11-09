import os
import sys
import socket
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

MINIO_USER = os.getenv("MINIO_ROOT_USER", "admin")
MINIO_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin123")


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


def run_bronze_to_silver():
    endpoint = get_minio_endpoint()
    s3 = get_s3_client()
    os.makedirs("data/full_dataset", exist_ok=True)
    local_raw_path = "data/full_dataset/ideam_raw_2000_onwards.csv"
    local_cat_path = "data/full_dataset/ideam_catalogo_estaciones_raw.csv"

    print(f"[1/4] Recuperando series de precipitación (s54a-sgyg) y Catálogo de Estaciones (hp9r-jxuu) desde MinIO ({endpoint})...")
    s3.download_file("bronce", "ideam_raw_2000_onwards.csv", local_raw_path)

    has_catalog = False
    try:
        s3.download_file("bronce", "ideam_catalogo_estaciones_raw.csv", local_cat_path)
        has_catalog = True
        print("      Catálogo Nacional de Estaciones (hp9r-jxuu) recuperado desde s3://bronce/ideam_catalogo_estaciones_raw.csv")
    except Exception:
        print("      Aviso: Catálogo complementario no encontrado en s3://bronce, usando metadatos embebidos.")

    print("[2/4] Inicializando motor distribuido Apache Spark...")
    spark = (
        SparkSession.builder
        .appName("IDEAM-Bronze-To-Silver-Parquet")
        .master("local[*]")
        .config("spark.sql.session.timeZone", "America/Bogota")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    df = (
        spark.read
        .option("header", "true")
        .option("multiLine", "true")
        .option("escape", '"')
        .csv(local_raw_path)
    )

    print("[3/4] Aplicando reglas de Veracidad (Limpieza >= año 2000), normalización de llaves y cruce con hp9r-jxuu...")

    def normalize_code(col_name):
        return F.regexp_replace(
            F.regexp_replace(
                F.regexp_replace(F.trim(F.col(col_name).cast("string")), r"\.0+$", ""),
                r"[^0-9]",
                ""
            ),
            r"^0+(?!$)",
            ""
        )

    def normalize_geo_name(col_name):
        return F.upper(
            F.trim(
                F.translate(F.col(col_name).cast("string"), "ÁÉÍÓÚÜáéíóúü", "AEIOUUAEIOUU")
            )
        )

    df_clean = (
        df
        .withColumn("codigoestacion", normalize_code("codigoestacion"))
        .withColumn("valorobservado", F.expr("try_cast(valorobservado as double)"))
        .withColumn("latitud", F.expr("try_cast(latitud as double)"))
        .withColumn("longitud", F.expr("try_cast(longitud as double)"))
        .withColumn("fecha_ts", F.to_timestamp(F.col("fechaobservacion")))
        .withColumn("anio", F.year(F.col("fecha_ts")))
        .withColumn("mes", F.month(F.col("fecha_ts")))
        .withColumn("trimestre", F.quarter(F.col("fecha_ts")))
        .withColumn(
            "epoca_hidrologica",
            F.when(F.col("mes").isin(4, 5, 10, 11), F.lit("EPOCA_LLUVIAS"))
            .when(F.col("mes").isin(1, 2, 7, 8), F.lit("EPOCA_SECA"))
            .otherwise(F.lit("TRANSICION"))
        )
        .filter(
            (F.col("codigoestacion") != "") &
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
        .withColumn("muni_norm", normalize_geo_name("municipio"))
        .withColumn("zona_norm", normalize_geo_name("zonahidrografica"))
        .dropDuplicates(["codigoestacion", "fechaobservacion"])
    )

    if has_catalog and os.path.exists(local_cat_path):
        df_cat = (
            spark.read
            .option("header", "true")
            .option("multiLine", "true")
            .option("escape", '"')
            .csv(local_cat_path)
        )
        cat_cols = [c.lower() for c in df_cat.columns]
        code_col = "codigo" if "codigo" in cat_cols else ("codigoestacion" if "codigoestacion" in cat_cols else None)
        alt_col = "altitud" if "altitud" in cat_cols else None
        muni_col = "municipio" if "municipio" in cat_cols else None
        zona_col = "zona_hidrografica" if "zona_hidrografica" in cat_cols else ("zonahidrografica" if "zonahidrografica" in cat_cols else None)
        lat_col = "latitud" if "latitud" in cat_cols else None
        lon_col = "longitud" if "longitud" in cat_cols else None

        if code_col and alt_col:
            df_cat_norm = (
                df_cat
                .withColumn("cat_codigoestacion", normalize_code(code_col))
                .withColumn("altitud_catalogo", F.expr(f"try_cast({alt_col} as double)"))
                .withColumn(
                    "cat_latitud",
                    F.expr(f"try_cast({lat_col} as double)") if lat_col else F.lit(None).cast(DoubleType())
                )
                .withColumn(
                    "cat_longitud",
                    F.expr(f"try_cast({lon_col} as double)") if lon_col else F.lit(None).cast(DoubleType())
                )
                .withColumn(
                    "cat_muni_norm",
                    normalize_geo_name(muni_col) if muni_col else F.lit("")
                )
                .withColumn(
                    "cat_zona_norm",
                    normalize_geo_name(zona_col) if zona_col else F.lit("")
                )
                .filter(F.col("cat_codigoestacion") != "")
            )

            # 1. Cruce directo por código de estación normalizado (Left Join)
            df_cat_by_code = (
                df_cat_norm
                .select("cat_codigoestacion", "altitud_catalogo", "cat_latitud", "cat_longitud")
                .dropDuplicates(["cat_codigoestacion"])
            )
            df_clean = (
                df_clean
                .join(df_cat_by_code, df_clean["codigoestacion"] == df_cat_by_code["cat_codigoestacion"], "left")
                .drop("cat_codigoestacion")
            )

            # 2. Regla de imputación nivel 2: Altitud media del municipio en el catálogo oficial
            df_cat_by_muni = (
                df_cat_norm
                .filter(F.col("altitud_catalogo").isNotNull() & (F.col("altitud_catalogo") > 0))
                .groupBy("cat_muni_norm")
                .agg(F.round(F.avg("altitud_catalogo"), 0).alias("altitud_media_municipio"))
            )
            df_clean = (
                df_clean
                .join(df_cat_by_muni, df_clean["muni_norm"] == df_cat_by_muni["cat_muni_norm"], "left")
                .drop("cat_muni_norm")
            )

            # 3. Regla de imputación nivel 3: Altitud media de la zona hidrográfica en el catálogo oficial
            df_cat_by_zona = (
                df_cat_norm
                .filter(F.col("altitud_catalogo").isNotNull() & (F.col("altitud_catalogo") > 0))
                .groupBy("cat_zona_norm")
                .agg(F.round(F.avg("altitud_catalogo"), 0).alias("altitud_media_cuenca"))
            )
            df_clean = (
                df_clean
                .join(df_cat_by_zona, df_clean["zona_norm"] == df_cat_by_zona["cat_zona_norm"], "left")
                .drop("cat_zona_norm")
            )

            # Actualizar coordenadas con las geodésicas oficiales del catálogo cuando estén disponibles
            df_clean = (
                df_clean
                .withColumn(
                    "latitud",
                    F.when(F.col("cat_latitud").between(-4.5, 13.5), F.col("cat_latitud")).otherwise(F.col("latitud"))
                )
                .withColumn(
                    "longitud",
                    F.when(F.col("cat_longitud").between(-82.0, -66.0), F.col("cat_longitud")).otherwise(F.col("longitud"))
                )
                .drop("cat_latitud", "cat_longitud")
            )

    for col_fallback in ("altitud_catalogo", "altitud_media_municipio", "altitud_media_cuenca"):
        if col_fallback not in df_clean.columns:
            df_clean = df_clean.withColumn(col_fallback, F.lit(None).cast(DoubleType()))

    # 4. Imputación jerárquica garantizada (0% nulos): Catálogo Exacto -> Media Municipio -> Media Cuenca -> Gradiente Hipsométrico
    df_clean = (
        df_clean
        .withColumn(
            "altitud_msnm",
            F.coalesce(
                F.when(F.col("altitud_catalogo") > 0, F.col("altitud_catalogo")),
                F.when(F.col("altitud_media_municipio") > 0, F.col("altitud_media_municipio")),
                F.when(F.col("altitud_media_cuenca") > 0, F.col("altitud_media_cuenca")),
                F.round(F.greatest(F.lit(80.0), (F.col("longitud") + F.lit(74.15)) * F.lit(1650.0)), 0)
            )
        )
        .drop("altitud_catalogo", "altitud_media_municipio", "altitud_media_cuenca", "muni_norm", "zona_norm")
    )

    total_in = df.count()
    df_clean_pd = df_clean.toPandas()
    total_out = len(df_clean_pd)
    estaciones_totales = df_clean_pd["codigoestacion"].nunique()
    estaciones_con_altitud = df_clean_pd.dropna(subset=["altitud_msnm"])["codigoestacion"].nunique()
    anios_unicos = sorted(df_clean_pd["anio"].unique().tolist())
    print(
        f"      Registros crudos: {total_in} | Registros limpios (>= 2000): {total_out} | "
        f"Estaciones con altitud válida: {estaciones_con_altitud}/{estaciones_totales} (100%) | "
        f"Años cubiertos: {anios_unicos[0]}..{anios_unicos[-1]} ({len(anios_unicos)} particiones anuales)"
    )

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
    step = max(1, len(df_clean_pd) // 50)
    df_sample_pd = df_clean_pd.iloc[::step].head(50)
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