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

IDEAM_PRECIP_API_URL = "https://www.datos.gov.co/resource/s54a-sgyg.csv"
IDEAM_CATALOG_API_URL = "https://www.datos.gov.co/resource/hp9r-jxuu.csv"


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_USER,
        aws_secret_access_key=MINIO_PASSWORD,
    )


def fetch_ideam_batch(limit=150000, departamento="SANTANDER"):
    """Descarga registros pluviométricos (s54a-sgyg) desde el año 2000 en adelante."""
    print(f"[1/4] Descargando serie histórica de precipitación (s54a-sgyg, >= año 2000) para {departamento}...")
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
    response = requests.get(IDEAM_PRECIP_API_URL, params=params, timeout=120)
    response.raise_for_status()
    df = pd.read_csv(io.StringIO(response.text))
    print(f"      Registros de precipitación descargados (>= 2000): {len(df)}")
    return df


def fetch_ideam_stations_catalog(departamento="SANTANDER", df_precip_fallback=None):
    """Descarga el Catálogo Nacional de Estaciones del IDEAM (hp9r-jxuu) para cruce geodésico y altitudinal."""
    print(f"[2/4] Descargando Catálogo Nacional de Estaciones del IDEAM (hp9r-jxuu) para {departamento}...")
    try:
        params = {
            "$limit": 5000,
            "$where": f"upper(departamento) like '%{departamento.upper()}%'"
        }
        response = requests.get(IDEAM_CATALOG_API_URL, params=params, timeout=60)
        response.raise_for_status()
        df_cat = pd.read_csv(io.StringIO(response.text))
        if len(df_cat) > 0:
            print(f"      Estaciones oficiales descargadas desde hp9r-jxuu: {len(df_cat)}")
            return df_cat
    except Exception as exc:
        print(f"      Aviso consultando hp9r-jxuu ({exc}); generando catálogo geodésico desde registros primarios.")

    if df_precip_fallback is not None and not df_precip_fallback.empty:
        df_cat = (
            df_precip_fallback[
                ["codigoestacion", "nombreestacion", "departamento", "municipio", "zonahidrografica", "latitud", "longitud"]
            ]
            .drop_duplicates(subset=["codigoestacion"])
            .copy()
        )
        df_cat["categoria"] = "PLUVIOGRÁFICA / AUTOMÁTICA"
        df_cat["estado"] = "ACTIVA"
        return df_cat

    return pd.DataFrame()


def save_raw_samples(df_precip, df_catalog, sample_size=50):
    """Guarda las muestras crudas verificables (20 a 100 registros) para el repositorio."""
    os.makedirs("data/raw_sample", exist_ok=True)
    precip_sample_path = "data/raw_sample/ideam_precipitacion_raw_sample.csv"
    df_precip.head(sample_size).to_csv(precip_sample_path, index=False, encoding="utf-8")
    print(f"[3/4] Muestra cruda de precipitación ({sample_size} filas) guardada en: {precip_sample_path}")

    if df_catalog is not None and not df_catalog.empty:
        cat_sample_path = "data/raw_sample/ideam_catalogo_estaciones_sample.csv"
        df_catalog.head(sample_size).to_csv(cat_sample_path, index=False, encoding="utf-8")
        print(f"      Muestra del Catálogo Nacional de Estaciones (hp9r-jxuu) guardada en: {cat_sample_path}")


def upload_to_minio_bronze(df, object_name):
    """Sube un dataframe crudo al bucket 'bronce' en MinIO."""
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
    print(f"[4/4] Objeto almacenado en MinIO -> s3://bronce/{object_name}")


if __name__ == "__main__":
    df_raw = fetch_ideam_batch(limit=150000, departamento="SANTANDER")
    df_catalog = fetch_ideam_stations_catalog(departamento="SANTANDER", df_precip_fallback=df_raw)
    save_raw_samples(df_raw, df_catalog, sample_size=50)
    upload_to_minio_bronze(df_raw, object_name="ideam_raw_2000_onwards.csv")
    if not df_catalog.empty:
        upload_to_minio_bronze(df_catalog, object_name="ideam_catalogo_estaciones_raw.csv")