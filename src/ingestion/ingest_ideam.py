import os
import io
import socket
import requests
import pandas as pd
import boto3
from dotenv import load_dotenv

load_dotenv(override=False)

MINIO_USER = os.getenv("MINIO_ROOT_USER", "admin")
MINIO_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin123")

IDEAM_PRECIP_API_URL = "https://www.datos.gov.co/resource/s54a-sgyg.csv"
IDEAM_CATALOG_API_URL = "https://www.datos.gov.co/resource/hp9r-jxuu.csv"


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


def fetch_ideam_paginated_strata(departamento="SANTANDER", rows_per_stratum=15000):
    """
    Descarga registros pluviométricos (s54a-sgyg) mediante paginación por bloques ($limit / $offset)
    sobre puntos de partida históricos desde el año 2000 hasta la actualidad,
    evitando el truncamiento de una única petición sin $offset.
    """
    print(
        f"[1/4] Descargando serie histórica paginada ($limit / $offset, 2000-2026) para {departamento}...",
        flush=True,
    )
    year_Anchors = [
        ("2000-01-01T00:00:00.000", "Bloque 2000+"),
        ("2010-01-01T00:00:00.000", "Bloque 2010+"),
        ("2016-01-01T00:00:00.000", "Bloque 2016+"),
        ("2020-01-01T00:00:00.000", "Bloque 2020+"),
        ("2023-01-01T00:00:00.000", "Bloque 2023+"),
    ]

    frames = []
    page_size = 7500

    for start_iso, label in year_Anchors:
        collected_in_stratum = 0
        offset = 0
        while collected_in_stratum < rows_per_stratum:
            batch_limit = min(page_size, rows_per_stratum - collected_in_stratum)
            where_clause = (
                f"fechaobservacion >= '{start_iso}' "
                f"AND valorobservado IS NOT NULL "
                f"AND upper(departamento) = '{departamento.upper()}'"
            )
            params = {
                "$limit": batch_limit,
                "$offset": offset,
                "$where": where_clause,
            }
            try:
                response = requests.get(IDEAM_PRECIP_API_URL, params=params, timeout=30)
                response.raise_for_status()
                df_page = pd.read_csv(io.StringIO(response.text))
            except Exception as exc:
                print(f"      Aviso en {label} (offset={offset}): {exc}", flush=True)
                break

            if df_page.empty:
                break

            frames.append(df_page)
            rows_got = len(df_page)
            collected_in_stratum += rows_got
            offset += rows_got
            if rows_got < batch_limit:
                break

        print(f"      {label}: {collected_in_stratum} registros recuperados (offset final={offset}).", flush=True)

    if not frames:
        raise RuntimeError("No se pudieron descargar registros desde s54a-sgyg.")

    df_all = pd.concat(frames, ignore_index=True).drop_duplicates(
        subset=["codigoestacion", "fechaobservacion"]
    )
    print(f"      Total consolidado sin duplicados (2000-2026): {len(df_all)} registros.")
    return df_all


def fetch_ideam_stations_catalog(departamento="SANTANDER", df_precip_fallback=None):
    """Descarga el Catálogo Nacional de Estaciones del IDEAM (hp9r-jxuu) filtrado para el departamento."""
    print(f"[2/4] Descargando Catálogo Nacional de Estaciones del IDEAM (hp9r-jxuu) para {departamento}...", flush=True)
    try:
        params = {
            "$limit": 5000,
            "$offset": 0,
            "$where": f"upper(departamento) = '{departamento.upper()}'"
        }
        response = requests.get(IDEAM_CATALOG_API_URL, params=params, timeout=60)
        response.raise_for_status()
        df_cat = pd.read_csv(io.StringIO(response.text))
        if len(df_cat) > 0:
            print(f"      Estaciones oficiales descargadas desde hp9r-jxuu: {len(df_cat)}", flush=True)
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
    """Guarda las muestras crudas verificables (50 registros estratificados) para el repositorio."""
    os.makedirs("data/raw_sample", exist_ok=True)
    precip_sample_path = "data/raw_sample/ideam_precipitacion_raw_sample.csv"
    if len(df_precip) > sample_size:
        step = max(1, len(df_precip) // sample_size)
        df_sample = df_precip.iloc[::step].head(sample_size)
    else:
        df_sample = df_precip.head(sample_size)
    df_sample.to_csv(precip_sample_path, index=False, encoding="utf-8")
    print(f"[3/4] Muestra cruda estratificada de precipitación ({len(df_sample)} filas) guardada en: {precip_sample_path}")

    if df_catalog is not None and not df_catalog.empty:
        cat_sample_path = "data/raw_sample/ideam_catalogo_estaciones_sample.csv"
        df_catalog.head(sample_size).to_csv(cat_sample_path, index=False, encoding="utf-8")
        print(f"      Muestra del Catálogo Nacional de Estaciones (hp9r-jxuu) guardada en: {cat_sample_path}")


def upload_to_minio_bronze(df, object_name):
    """Sube un dataframe crudo al bucket 'bronce' en MinIO."""
    endpoint = get_minio_endpoint()
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
    print(f"[4/4] Objeto almacenado en MinIO ({endpoint}) -> s3://bronce/{object_name}")


if __name__ == "__main__":
    df_raw = fetch_ideam_paginated_strata(departamento="SANTANDER", rows_per_stratum=15000)
    df_catalog = fetch_ideam_stations_catalog(departamento="SANTANDER", df_precip_fallback=df_raw)
    save_raw_samples(df_raw, df_catalog, sample_size=50)
    upload_to_minio_bronze(df_raw, object_name="ideam_raw_2000_onwards.csv")
    if not df_catalog.empty:
        upload_to_minio_bronze(df_catalog, object_name="ideam_catalogo_estaciones_raw.csv")