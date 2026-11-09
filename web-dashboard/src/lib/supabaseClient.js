import { createClient } from '@supabase/supabase-js';
import { DEFAULT_STATIONS, DEFAULT_ALERTS } from './defaultData.js';
import { computePredictiveVectorFromForecast } from './hydrologyRules.js';

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
  const refDefault =
    DEFAULT_STATIONS.find((d) => String(d.codigoestacion) === String(st.codigoestacion)) || {};
  const merged = { ...refDefault, ...st };

  const p90 = Number(merged.umbral_3h_p90 ?? merged.umbral_alerta_naranja ?? 2.0);
  const p99 = Number(merged.umbral_3h_p99 ?? merged.umbral_alerta_roja ?? 10.0);
  const media = Number(merged.precipitacion_media ?? 1.5);
  const altitud_msnm = Number(
    merged.altitud_msnm ?? Math.max(85, Math.round((Number(merged.longitud) + 74.15) * 1650))
  );
  const coef_escorrentia = Number(
    merged.coef_escorrentia ??
      Math.min(0.92, Math.max(0.48, 0.45 + altitud_msnm / 6500 + (p90 / Math.max(p99, 0.5)) * 0.18)).toFixed(3)
  );
  const api_critico_24h_mm = Number(merged.api_critico_24h_mm ?? Math.max(0.5, Number((p90 * 0.58).toFixed(2))));
  const api_critico_72h_mm = Number(merged.api_critico_72h_mm ?? Math.max(1.2, Number((api_critico_24h_mm * 1.45).toFixed(2))));
  const prob_transicion_exceso = Number(
    merged.prob_transicion_exceso ??
      Math.min(0.86, Math.max(0.08, (p90 / Math.max(p99, 0.5)) * 0.35)).toFixed(4)
  );
  const ventana_evacuacion_min = Number(
    merged.ventana_evacuacion_min ?? Math.max(75, Math.round(210 - altitud_msnm / 28))
  );
  const desviacion_estandar = Number(merged.desviacion_estandar ?? (p90 * 0.42).toFixed(2));
  const media_epoca_lluvias_mm = Number(merged.media_epoca_lluvias_mm ?? (media * 1.42).toFixed(2));
  const media_epoca_seca_mm = Number(merged.media_epoca_seca_mm ?? (media * 0.68).toFixed(2));
  const factor_estacional_bimodal = Number(
    merged.factor_estacional_bimodal ??
      Math.min(2.4, Math.max(1.05, media_epoca_lluvias_mm / Math.max(0.5, media_epoca_seca_mm))).toFixed(2)
  );

  return {
    ...merged,
    altitud_msnm,
    desviacion_estandar,
    media_epoca_lluvias_mm,
    media_epoca_seca_mm,
    factor_estacional_bimodal,
    umbral_3h_p90: p90,
    umbral_3h_p99: p99,
    api_critico_24h_mm,
    api_critico_72h_mm,
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

        async upsert(recordOrArray) {
          const items = Array.isArray(recordOrArray) ? recordOrArray : [recordOrArray];
          try {
            const res = await liveQuery.upsert(items).select();
            if (res.error) {
              const baseCols = [
                'id',
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
                'fecha_evento',
              ];
              const compatItems = items.map((it) => {
                const clean = {};
                baseCols.forEach((k) => {
                  if (it[k] !== undefined) clean[k] = it[k];
                });
                return clean;
              });
              await liveQuery.upsert(compatItems).select();
            }
          } catch (e) {
            console.warn('[Supabase Live Upsert fallback]', e);
          }

          if (table === 'alertas_activas') {
            const alerts = getLocalAlerts();
            items.forEach((item) => {
              const idx = alerts.findIndex(
                (a) => String(a.id) === String(item.id) || String(a.codigoestacion) === String(item.codigoestacion)
              );
              if (idx !== -1) {
                const oldRecord = { ...alerts[idx] };
                alerts[idx] = { ...alerts[idx], ...item };
                broadcastAlertChange('UPDATE', alerts[idx], oldRecord);
              } else {
                alerts.unshift(item);
                broadcastAlertChange('INSERT', item, null);
              }
            });
            saveLocalAlerts(alerts);
            return { data: items, error: null };
          }
          return { data: items, error: null };
        },

        update(updates) {
          return {
            eq: async (column, value) => {
              try {
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

      async upsert(recordOrArray) {
        const items = Array.isArray(recordOrArray) ? recordOrArray : [recordOrArray];
        if (table === 'alertas_activas') {
          const alerts = getLocalAlerts();
          items.forEach((item) => {
            const idx = alerts.findIndex(
              (a) => String(a.id) === String(item.id) || String(a.codigoestacion) === String(item.codigoestacion)
            );
            if (idx !== -1) {
              const oldRecord = { ...alerts[idx] };
              alerts[idx] = { ...alerts[idx], ...item };
              broadcastAlertChange('UPDATE', alerts[idx], oldRecord);
            } else {
              alerts.unshift(item);
              broadcastAlertChange('INSERT', item, null);
            }
          });
          saveLocalAlerts(alerts);
        }
        return { data: items, error: null };
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

// Consulta pronóstico satelital real en Open-Meteo por latitud y longitud exactas (T+1h, T+3h y T+6h)
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
      lluviaAntecedente6hMm: Number(pastPrecip.reduce((a, b) => a + b, 0).toFixed(2)),
      pronostico1hMm: Number(futurePrecip.slice(0, 1).reduce((a, b) => a + b, 0).toFixed(2)),
      pronostico3hMm: Number(futurePrecip.slice(0, 3).reduce((a, b) => a + b, 0).toFixed(2)),
      pronostico6hMm: Number(futurePrecip.slice(0, 6).reduce((a, b) => a + b, 0).toFixed(2)),
      probabilidadPct: futureProb.length ? Math.max(...futureProb.slice(0, 3)) : 35,
      saturacionSueloPct: soilAll.length ? Number((soilAll[soilAll.length - 1] * 100).toFixed(1)) : 48.0,
    };
  } catch {
    return {
      lluviaActualMm: 0.0,
      lluviaAntecedente6hMm: 0.4,
      pronostico1hMm: 0.4,
      pronostico3hMm: 1.4,
      pronostico6hMm: 2.8,
      probabilidadPct: 45,
      saturacionSueloPct: 49.0,
    };
  }
}

// Evaluación determinista en vivo (Open-Meteo + Modelo Estacional Spark via hydrologyRules.js)
// Por defecto (stressTest = false) usa 100% los datos reales de Open-Meteo sin multiplicadores arbitrarios
export async function simulateKafkaPeak(stationCode, stressTest = false, baseStation = null) {
  const stations = getLocalStations().map(enrichStationModel);
  const found = baseStation ? enrichStationModel(baseStation) : stations.find(s => String(s.codigoestacion) === String(stationCode));
  if (!found) return null;

  const forecast = await fetchOpenMeteoForecast(found.latitud, found.longitud);
  const vec = computePredictiveVectorFromForecast(found, forecast, { stressTest });

  const codStr = String(found.codigoestacion);
  const alertId = Number(codStr);
  const zona_id = `${found.zonahidrografica} | ${found.municipio}`;
  const isCritical = vec.status.color === 'red';
  const isSurveillance = vec.status.color === 'orange';

  const payload = {
    id: alertId,
    codigoestacion: codStr,
    nombreestacion: found.nombreestacion,
    municipio: found.municipio,
    latitud: Number(found.latitud),
    longitud: Number(found.longitud),
    zona_id,
    titulo_alerta: `Pronóstico T+3h: ${vec.pronostico3hMm} mm (${vec.probabilidadDesbordamientoPct}% prob. desborde)`,
    tipo_alerta: vec.status.type,
    color_alerta: vec.status.color,
    cuenca_sector: `Cuenca ${found.zonahidrografica} · ${found.municipio}`,
    descripcion: `${vec.contrastBanner}. Tendencia: ${vec.tendencia6h}. Umbral 3h P90=${found.umbral_3h_p90} mm, P99=${found.umbral_3h_p99} mm | Saturación suelo: ${vec.saturacionSueloPct}% | Coef. escorrentía: ${vec.coefEscorrentia} | Factor estacional Spark: ${vec.factorEstacionalBimodal}x | Ventana evacuación: ${vec.ventanaEvacuacionMin} min.`,
    estado_prioridad: isCritical
      ? `Evacuación Preventiva · Ventana ${vec.ventanaEvacuacionMin} min · ${vec.tendencia6h}`
      : isSurveillance
        ? `Vigilancia Predictiva · Ventana ${vec.ventanaEvacuacionMin} min · ${vec.tendencia6h}`
        : `Cuenca dentro de capacidad normal (T+3h: ${vec.pronostico3hMm} mm < P90: ${found.umbral_3h_p90} mm) · ${vec.tendencia6h}`,
    lluvia_actual_mm: vec.lluviaActualMm,
    pronostico_1h_mm: vec.pronostico1hMm,
    pronostico_3h_mm: vec.pronostico3hMm,
    pronostico_6h_mm: vec.pronostico6hMm,
    tendencia_6h: vec.tendencia6h,
    probabilidad_lluvia_pct: vec.probabilidadLluviaPct,
    probabilidad_desbordamiento_pct: vec.probabilidadDesbordamientoPct,
    saturacion_suelo_pct: vec.saturacionSueloPct,
    saturacion_antecedente_mm: vec.saturacionAntecedenteMm,
    ventana_evacuacion_min: vec.ventanaEvacuacionMin,
    precipitacion_registrada: vec.pronostico3hMm,
    volumen_proyectado_3h_mm: vec.pronostico3hMm,
    volumen_proyectado_6h_mm: vec.pronostico6hMm,
    revisado: !isCritical && !isSurveillance,
    fecha_evento: new Date().toISOString()
  };

  const result = await supabase.from('alertas_activas').upsert(payload);
  return { payload, alertId, result, vec };
}

// Reiniciar a valores iniciales
export function resetDefaultAlerts() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_ALERTS_KEY);
  }
  const alerts = DEFAULT_ALERTS;
  saveLocalAlerts(alerts);
  alerts.forEach((a) => broadcastAlertChange('UPDATE', a, null));
  return alerts;
}
