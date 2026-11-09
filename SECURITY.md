# Politica de Seguridad y Gobernanza de Credenciales (Security Policy)

Este documento describe las medidas de seguridad implementadas en el **Sistema Predictivo de Alerta Temprana y Resiliencia Hidroclimatica en Santander** para proteger las credenciales del Data Lake, la base de datos en tiempo real y el entorno de ejecucion local en Windows.

---

## 1. Separacion de Credenciales entre Backend y Frontend

El proyecto separa estrictamente las llaves de administracion del pipeline de datos respecto a las llaves publicas del navegador:

* **Backend (PySpark y Consumidor de Apache Kafka):** Utiliza la variable `SUPABASE_KEY` (`service_role` / `sb_secret_...`) y las credenciales de MinIO (`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`) leidas exclusivamente desde el archivo `.env` local o desde las variables de entorno del contenedor Docker. El archivo `.env` esta excluido del control de versiones en `.gitignore` y nunca se sube al repositorio.
* **Frontend (`web-dashboard` en React + Vite):** Utiliza unicamente variables con el prefijo `VITE_` (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` de tipo `anon` / `sb_publishable_...`), las cuales estan disenadas para operar en el navegador bajo las restricciones de Row Level Security (RLS) de PostgreSQL.

---

## 2. Politicas de Seguridad a Nivel de Fila (Row Level Security - RLS) en Supabase

El esquema relacional definido en `src/batch/supabase_schema.sql` habilita `ENABLE ROW LEVEL SECURITY` sobre las dos tablas del sistema:

1. **Tabla `public.umbrales_estaciones` (Capa Oro):**
   * **Politica de lectura (`SELECT`):** Abierta a los roles `anon` y `authenticated` para que el Centro de Mando pueda consultar los percentiles $P_{90}$ y $P_{99}$ de las 26 estaciones de Santander.
   * **Politica de escritura (`INSERT / UPDATE / DELETE`):** Restringida exclusivamente al rol `service_role` utilizado por el job distribuido `src/batch/silver_to_gold.py`. Ningun cliente web externo puede alterar ni borrar los umbrales historicos calculados por Apache Spark.
2. **Tabla `public.alertas_activas` (Alertas Predictivas $T+3\text{ h}$):**
   * **Politica de lectura (`SELECT`):** Abierta para difusion en tiempo real mediante la publicacion `supabase_realtime`.
   * **Politica de actualizacion (`UPDATE` e `INSERT`):** Habilitada para permitir que el motor de inferencia de Kafka (`src/streaming/kafka_consumer.py`) publique nuevas alertas tempranas y que los operadores del Centro de Mando confirmen la ejecucion del protocolo preventivo de la UNGRD (`revisado = true`).

---

## 3. Politica de Ejecucion de Scripts en Windows PowerShell (`ExecutionPolicy`)

En sistemas Windows 10 y Windows 11, PowerShell aplica por defecto la directiva `Restricted`, que bloquea la ejecucion del script de activacion del entorno virtual de Python (`.\venv\Scripts\Activate.ps1`) arrojando el error `PSSecurityException`.

Para mantener la seguridad del sistema operativo sin desactivar globalmente la proteccion de scripts:
* Se utiliza el alcance de usuario (`-Scope CurrentUser`) y la politica `RemoteSigned`:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
  ```
* Esta directiva permite ejecutar scripts creados localmente en la maquina (como `Activate.ps1` del entorno virtual `venv`), pero exige firma digital verificada para cualquier script descargado de Internet, evitando la necesidad de abrir PowerShell como Administrador o de usar la directiva insegura `Unrestricted`.

---

## 4. Aislamiento de Red en Contenedores Docker

El archivo `compose.yaml` define una red bridge privada (`spark-net`) donde se comunican los servicios internos:
* El trafico interno entre el contenedor `spark-processor` y el broker de Kafka viaja por el listener interno `PLAINTEXT://kafka:29092`, separado del listener de host `PLAINTEXT_HOST://localhost:9092`.
* El contenedor `spark-processor` monta el directorio de trabajo de forma controlada y se ejecuta de manera efimera (`docker compose run --rm`), liberando recursos y cerrando sesiones S3/Kafka al finalizar cada tarea.
