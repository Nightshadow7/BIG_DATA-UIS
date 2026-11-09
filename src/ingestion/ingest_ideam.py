import os
import io
import requests
import pandas as pd
import boto3
from dotenv import load_dotenv

load_dotenv(override=False)

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
MINIO_USER = os.getenv("MINIO_ROOT_USER", "admin")
MINIO_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin123")

IDEAM_API_URL = "https://www.datos.gov.co/resource/s54a-sgyg.csv"

def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_USER,
        aws_secret_access_key=MINIO_PASSWORD,
    )

def fetch_ideam_batch(limit=150000, departamento="SANTANDER"):
    """Descarga registros del IDEAM exclusivamente desde el año 2000 en adelante."""
    print(f"[1/3] Descargando registros (>= año 2000) del IDEAM para {departamento}...")
    where_clause = (
        f"fechaobservacion >= '2000-01-01T00:00:00.000' "
        f"AND valorobservado IS NOT NULL "
        f"AND upper(departamento) = '{departamento.upper()}'"
    )
    params = {
        "$limit": limit,
        "$where": where_clause,
        "$order": "fechaobservacion DESC"
    }
    response = requests.get(IDEAM_API_URL, params=params, timeout=120)
    response.raise_for_status()
    df = pd.read_csv(io.StringIO(response.text))
    print(f"      Registros descargados exitosamente (>= 2000): {len(df)}")
    return df

def save_raw_sample(df, sample_size=50):
    """Guarda la muestra cruda de 20 a 100 registros para el repositorio de GitHub."""
    os.makedirs("data/raw_sample", exist_ok=True)
    sample_path = "data/raw_sample/ideam_precipitacion_raw_sample.csv"
    df.head(sample_size).to_csv(sample_path, index=False, encoding="utf-8")
    print(f"[2/3] Muestra cruda ({sample_size} filas) guardada en: {sample_path}")

def upload_to_minio_bronze(df, object_name="ideam_raw_2000_onwards.csv"):
    """Sube el lote crudo al bucket 'bronce' en MinIO."""
    s3 = get_s3_client()
    csv_buffer = io.BytesIO()
    df.to_csv(csv_buffer, index=False, encoding="utf-8")
    csv_buffer.seek(0)

    s3.put_object(
        Bucket="bronce",
        Key=object_name,
        Body=csv_buffer.getvalue(),
        ContentType="text/csv"
    )
    print(f"[3/3] Archivo almacenado en MinIO -> s3://bronce/{object_name}")

if __name__ == "__main__":
    df_raw = fetch_ideam_batch(limit=150000, departamento="SANTANDER")
    save_raw_sample(df_raw, sample_size=50)
    upload_to_minio_bronze(df_raw)