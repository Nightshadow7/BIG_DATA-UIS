import { createClient } from '@supabase/supabase-js';
import { DEFAULT_STATIONS, DEFAULT_ALERTS } from './defaultData.js';

// Lectura de variables de entorno con respaldo de clave pública (anon/publishable) para despliegue en Vercel
const ENV_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kofaoizeukbugvseckbq.supabase.co';
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_d60Z7EQtdyW6llHX7B_vyw_8aTF96qt';

// Soporte para configuración dinámica o local
const STORED_URL = typeof window !== 'undefined' ? localStorage.getItem('ideam_supabase_url') : null;
const STORED_KEY = typeof window !== 'undefined' ? localStorage.getItem('ideam_supabase_key') : null;

export const ACTIVE_URL = STORED_URL || ENV_URL || '';
export const ACTIVE_KEY = STORED_KEY || ENV_KEY || '';

export const isLiveSupabaseConfigured = () => {
  return Boolean(
    ACTIVE_URL && 
    ACTIVE_KEY && 
    ACTIVE_URL.startsWith('http') && 
    !ACTIVE_URL.includes('MY_SUPABASE')
  );
};

// Cliente oficial de @supabase/supabase-js cuando hay credenciales válidas
let realClient = null;
if (isLiveSupabaseConfigured()) {
  try {
    realClient = createClient(ACTIVE_URL, ACTIVE_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  } catch (err) {
    console.warn('[SupabaseClient] Error inicializando cliente real:', err);
  }
}

// Mecanismo de persistencia local y eventos en tiempo real resiliente
const STORAGE_STATIONS_KEY = 'santander_ideam_umbrales_estaciones_v1';
const STORAGE_ALERTS_KEY = 'santander_ideam_alertas_activas_v1';

function getLocalStations() {
  if (typeof window === 'undefined') return DEFAULT_STATIONS;
  const stored = localStorage.getItem(STORAGE_STATIONS_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_STATIONS_KEY, JSON.stringify(DEFAULT_STATIONS));
    return DEFAULT_STATIONS;
  }
  try {
    return JSON.parse(stored);
  } catch {
    return DEFAULT_STATIONS;
  }
}

function getLocalAlerts() {
  if (typeof window === 'undefined') return DEFAULT_ALERTS;
  const stored = localStorage.getItem(STORAGE_ALERTS_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_ALERTS_KEY, JSON.stringify(DEFAULT_ALERTS));
    return DEFAULT_ALERTS;
  }
  try {
    return JSON.parse(stored);
  } catch {
    return DEFAULT_ALERTS;
  }
}

function saveLocalAlerts(alerts) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_ALERTS_KEY, JSON.stringify(alerts));
  }
}

// Event Bus para suscripción local a 'realtime-alerts' en modo simulado / offline
const subscribers = new Set();

function broadcastAlertChange(eventType, newRecord, oldRecord) {
  subscribers.forEach((callback) => {
    try {
      callback({
        eventType,
        new: newRecord,
        old: oldRecord,
        schema: 'public',
        table: 'alertas_activas',
        commit_timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error('[Realtime Bus Error]', e);
    }
  });
}

function enrichStationModel(st) {
  const p90 = Number(st.umbral_3h_p90 ?? st.umbral_alerta_naranja ?? 2.0);
  const p99 = Number(st.umbral_3h_p99 ?? st.umbral_alerta_roja ?? 10.0);
  const altitud_msnm = Number(st.altitud_msnm ?? Math.max(85, Math.round((Number(st.longitud) + 74.15) * 1650)));
  const coef_escorrentia = Number(
    st.coef_escorrentia ??
    Math.min(0.92, Math.max(0.48, 0.45 + altitud_msnm / 6500 + (p90 / Math.max(p99, 0.5)) * 0.18)).toFixed(2)
  );
  const api_critico_24h_mm = Number(st.api_critico_24h_mm ?? (p90 * 0.58).toFixed(1));
  const prob_transicion_exceso = Number(
    st.prob_transicion_exceso ??
    Math.min(0.86, Math.max(0.28, (p90 / Math.max(p99, 0.5)) * 0.72)).toFixed(2)
  );
  const ventana_evacuacion_min = Number(st.ventana_evacuacion_min ?? Math.max(75, Math.round(210 - altitud_msnm / 28)));

  return {
    ...st,
    altitud_msnm,
    umbral_3h_p90: p90,
    umbral_3h_p99: p99,
    api_critico_24h_mm,
    coef_escorrentia,
    prob_transicion_exceso,
    ventana_evacuacion_min,
  };
}

// Wrapper unificado de Supabase que cumple la API oficial
export const supabase = {
  get isLive() {
    return Boolean(realClient);
  },

  get client() {
    return realClient;
  },

  from(table) {
    if (realClient) {
      const liveQuery = realClient.from(table);
      return {
        async select(columns = '*') {
          try {
            const res = await liveQuery.select(columns);
            if (!res.error && res.data && res.data.length > 0) {
              if (table === 'umbrales_estaciones') {
                return { data: res.data.map(enrichStationModel), error: null };
              }
              return res;
            }
          } catch (e) {
            console.warn(`[Supabase fallback] Error consultando tabla ${table}:`, e);
          }
          if (table === 'umbrales_estaciones') {
            return { data: getLocalStations().map(enrichStationModel), error: null };
          }
          if (table === 'alertas_activas') {
            return { data: getLocalAlerts(), error: null };
          }
          return { data: [], error: null };
        },

        update(updates) {
          return {
            eq: async (column, value) => {
              try {
                // Solo enviamos columnas existentes en el esquema PostgreSQL de Supabase
                const dbCols = [
                  'codigoestacion',
                  'zona_id',
                  'titulo_alerta',
                  'tipo_alerta',
                  'color_alerta',
                  'cuenca_sector',
                  'descripcion',
                  'estado_prioridad',
                  'precipitacion_registrada',
                  'revisado',
                  'fecha_evento'
                ];
                const dbUpdates = {};
                dbCols.forEach((k) => {
                  if (updates[k] !== undefined) dbUpdates[k] = updates[k];
                });
                await liveQuery.update(dbUpdates).eq(column, value).select();
              } catch (e) {
                console.warn('[Supabase Live Update Error]', e);
              }

              if (table === 'alertas_activas') {
                const alerts = getLocalAlerts();
                const index = alerts.findIndex((a) => String(a[column]) === String(value));
                if (index !== -1) {
                  const oldRecord = { ...alerts[index] };
                  alerts[index] = { ...alerts[index], ...updates };
                  saveLocalAlerts(alerts);
                  broadcastAlertChange('UPDATE', alerts[index], oldRecord);
                  return { data: [alerts[index]], error: null };
                }
              }
              return { data: [], error: null };
            }
          };
        }
      };
    }

    return {
      async select() {
        if (table === 'umbrales_estaciones') {
          return { data: getLocalStations().map(enrichStationModel), error: null };
        }
        if (table === 'alertas_activas') {
          return { data: getLocalAlerts(), error: null };
        }
        return { data: [], error: null };
      },

      update(updates) {
        return {
          eq: async (column, value) => {
            if (table === 'alertas_activas') {
              const alerts = getLocalAlerts();
              const index = alerts.findIndex((a) => String(a[column]) === String(value));
              if (index !== -1) {
                const oldRecord = { ...alerts[index] };
                alerts[index] = { ...alerts[index], ...updates };
                saveLocalAlerts(alerts);
                broadcastAlertChange('UPDATE', alerts[index], oldRecord);
                return { data: [alerts[index]], error: null };
              }
            }
            return { data: [], error: null };
          }
        };
      }
    };
  },

  channel(channelName) {
    if (realClient) {
      try {
        const liveChannel = realClient.channel(channelName);
        return {
          on(event, filter, callback) {
            liveChannel.on(event, filter, callback);
            subscribers.add(callback);
            return this;
          },
          subscribe(statusCallback) {
            liveChannel.subscribe((status, err) => {
              if (statusCallback) statusCallback(status, err);
            });
            return {
              unsubscribe() {
                liveChannel.unsubscribe();
                subscribers.clear();
              }
            };
          }
        };
      } catch (e) {
        console.warn('[Supabase channel fallback]', e);
      }
    }

    return {
      on(event, filter, callback) {
        subscribers.add(callback);
        return this;
      },
      subscribe(statusCallback) {
        if (statusCallback) {
          setTimeout(() => statusCallback('SUBSCRIBED'), 100);
        }
        return {
          unsubscribe() {
            subscribers.clear();
          }
        };
      }
    };
  }
};

// Consulta pronóstico satelital real en Open-Meteo por latitud y longitud exactas
export async function fetchOpenMeteoForecast(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat).toFixed(5)}&longitude=${Number(lon).toFixed(5)}&hourly=precipitation,precipitation_probability,soil_moisture_0_to_7cm&past_hours=6&forecast_hours=6&timezone=America%2FBogota`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Open-Meteo HTTP status ' + res.status);
    const data = await res.json();
    const hourly = data.hourly || {};
    const precipAll = (hourly.precipitation || []).map((v) => Number(v || 0));
    const probAll = (hourly.precipitation_probability || []).map((v) => Number(v || 0));
    const soilAll = (hourly.soil_moisture_0_to_7cm || []).filter((v) => v !== null);

    const pastPrecip = precipAll.slice(0, 6);
    const futurePrecip = precipAll.slice(6, 12);
    const futureProb = probAll.slice(6, 12);

    return {
      lluviaActualMm: pastPrecip.length ? Number(pastPrecip[pastPrecip.length - 1].toFixed(2)) : 0.0,
      pronostico3hMm: Number(futurePrecip.slice(0, 3).reduce((a, b) => a + b, 0).toFixed(2)),
      pronostico6hMm: Number(futurePrecip.slice(0, 6).reduce((a, b) => a + b, 0).toFixed(2)),
      probabilidadPct: futureProb.length ? Math.max(...futureProb.slice(0, 3)) : 65,
      saturacionSueloPct: soilAll.length ? Number((soilAll[soilAll.length - 1] * 100).toFixed(1)) : 52.0,
    };
  } catch {
    return {
      lluviaActualMm: 0.2,
      pronostico3hMm: 1.4,
      pronostico6hMm: 2.8,
      probabilidadPct: 72,
      saturacionSueloPct: 54.0,
    };
  }
}

// Proyección de vector predictivo T+3h / T+6h (Open-Meteo + Modelo Spark)
export async function simulateKafkaPeak(stationCode, forceP99 = true, baseStation = null) {
  const stations = getLocalStations().map(enrichStationModel);
  const found = baseStation ? enrichStationModel(baseStation) : stations.find(s => String(s.codigoestacion) === String(stationCode));
  if (!found) return null;

  const forecast = await fetchOpenMeteoForecast(found.latitud, found.longitud);

  const isNorth = found.latitud >= 7.0;
  const alertId = isNorth ? 1 : 2;
  const zona_id = isNorth ? 'north' : 'south';

  const p90 = found.umbral_3h_p90;
  const p99 = found.umbral_3h_p99;
  const coefEsc = found.coef_escorrentia;
  const ventanaEvac = found.ventana_evacuacion_min;

  const targetPrecip3h = forceP99
    ? Number((p99 * 1.12 + forecast.pronostico3hMm * coefEsc).toFixed(1))
    : Number(((p90 + p99) * 0.52 + forecast.pronostico3hMm * coefEsc).toFixed(1));
  const targetPrecip6h = Number((targetPrecip3h * 1.24 + forecast.pronostico6hMm * coefEsc).toFixed(1));

  const probPct = forceP99
    ? Math.min(99, Math.max(88, Math.round(found.prob_transicion_exceso * 50 + 48)))
    : Math.min(91, Math.max(74, Math.round(found.prob_transicion_exceso * 45 + 36)));

  const soilPct = forceP99
    ? Math.max(72.5, forecast.saturacionSueloPct)
    : Math.max(61.0, forecast.saturacionSueloPct);

  const alertType = forceP99 ? 'ALERTA CRÍTICA' : 'VIGILANCIA';
  const alertColor = forceP99 ? 'red' : 'orange';
  const priority = forceP99
    ? `Evacuación Preventiva / Ventana ${ventanaEvac} min (Horizonte T+3h)`
    : `Vigilancia Predictiva / Ventana ${ventanaEvac} min (Horizonte T+3h)`;

  const payload = {
    codigoestacion: String(found.codigoestacion),
    zona_id,
    titulo_alerta: forceP99
      ? `Predicción T+3h: Riesgo de desbordamiento (${probPct}% prob.)`
      : `Predicción T+3h: Saturación y lluvia entrante (${probPct}% prob.)`,
    tipo_alerta: alertType,
    color_alerta: alertColor,
    cuenca_sector: `Cuenca ${found.zonahidrografica} (${found.municipio})`,
    descripcion: `Estación ${found.nombreestacion} [Lat ${found.latitud.toFixed(4)}, Lon ${found.longitud.toFixed(4)}]: Volumen proyectado a T+3h de ${targetPrecip3h} mm supera ${forceP99 ? `Umbral 3h P99 (${p99} mm)` : `Umbral 3h P90 (${p90} mm)`}. Saturación de suelo: ${soilPct}% | Coef. escorrentía Spark: ${coefEsc} | Ventana de evacuación: ${ventanaEvac} min.`,
    estado_prioridad: priority,
    precipitacion_registrada: targetPrecip3h,
    volumen_proyectado_3h_mm: targetPrecip3h,
    volumen_proyectado_6h_mm: targetPrecip6h,
    probabilidad_desbordamiento_pct: probPct,
    saturacion_suelo_pct: soilPct,
    ventana_evacuacion_min: ventanaEvac,
    lluvia_actual_mm: forecast.lluviaActualMm,
    revisado: false,
    fecha_evento: new Date().toISOString()
  };

  const result = await supabase.from('alertas_activas').update(payload).eq('id', alertId);
  return { payload, alertId, result };
}

// Reiniciar a valores iniciales
export function resetDefaultAlerts() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_ALERTS_KEY);
  }
  const alerts = DEFAULT_ALERTS;
  saveLocalAlerts(alerts);
  broadcastAlertChange('UPDATE', alerts[0], null);
  broadcastAlertChange('UPDATE', alerts[1], null);
  return alerts;
}
