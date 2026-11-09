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

// Wrapper unificado de Supabase que cumple la API oficial
export const supabase = {
  get isLive() {
    return Boolean(realClient);
  },

  get client() {
    return realClient;
  },

  from(table) {
    // Si hay cliente real configurado, intentamos usarlo con fallback automático si la tabla remota no existe aún
    if (realClient) {
      const liveQuery = realClient.from(table);
      return {
        async select(columns = '*') {
          try {
            const res = await liveQuery.select(columns);
            if (!res.error && res.data && res.data.length > 0) {
              return res;
            }
          } catch (e) {
            console.warn(`[Supabase fallback] Error consultando tabla ${table}:`, e);
          }
          // Fallback a capa local
          if (table === 'umbrales_estaciones') {
            return { data: getLocalStations(), error: null };
          }
          if (table === 'alertas_activas') {
            return { data: getLocalAlerts(), error: null };
          }
          return { data: [], error: null };
        },

        update(updates) {
          return {
            eq: async (column, value) => {
              // Actualizar en Supabase real si es posible
              try {
                const liveRes = await liveQuery.update(updates).eq(column, value).select();
                if (!liveRes.error && liveRes.data) {
                  return liveRes;
                }
              } catch (e) {
                console.warn('[Supabase Live Update Error]', e);
              }

              // Fallback y sync local
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

    // Modo local / emulación idéntica a Supabase
    return {
      async select() {
        if (table === 'umbrales_estaciones') {
          return { data: getLocalStations(), error: null };
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
            // También adjuntamos al bus local para picos simulados
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

    // Bus local para tiempo real
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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat).toFixed(5)}&longitude=${Number(lon).toFixed(5)}&hourly=precipitation,precipitation_probability,soil_moisture_0_to_7cm&forecast_days=1&timezone=America%2FBogota`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Open-Meteo HTTP status ' + res.status);
    const data = await res.json();
    const hourly = data.hourly || {};
    const precipList = (hourly.precipitation || [0, 0, 0]).slice(0, 3);
    const probList = (hourly.precipitation_probability || [55, 65, 75]).slice(0, 3);
    const soilList = (hourly.soil_moisture_0_to_7cm || [0.42]).slice(0, 3);

    return {
      pronostico3hMm: Number(precipList.reduce((a, b) => a + b, 0).toFixed(2)),
      probabilidadPct: Math.max(...probList, 70),
      saturacionSueloPct: soilList[0] ? Number((soilList[0] * 100).toFixed(1)) : 48.5,
    };
  } catch {
    return {
      pronostico3hMm: 0.0,
      probabilidadPct: 85,
      saturacionSueloPct: 54.0,
    };
  }
}

// Proyección de vector predictivo T+3h (Kafka + Open-Meteo)
export async function simulateKafkaPeak(stationCode, forceP99 = true) {
  const stations = getLocalStations();
  const station = stations.find(s => s.codigoestacion === stationCode);
  if (!station) return null;

  const forecast = await fetchOpenMeteoForecast(station.latitud, station.longitud);

  // Determinar zona norte o sur según latitud
  const isNorth = station.latitud >= 7.0;
  const alertId = isNorth ? 1 : 2;
  const zona_id = isNorth ? 'north' : 'south';

  // Lluvia actual baja (aún no ocurre el desastre) vs. Proyección acumulada a T+3h (Saturación + Pronóstico 3h)
  const lluviaActual = Number((Math.random() * 1.6 + 0.2).toFixed(1));
  const targetPrecip = forceP99
    ? Number((station.umbral_alerta_roja * 1.12 + forecast.pronostico3hMm * 0.2).toFixed(1))
    : Number(((station.umbral_alerta_naranja + station.umbral_alerta_roja) / 2).toFixed(1));

  const probPct = forceP99
    ? Math.max(88, forecast.probabilidadPct)
    : Math.max(74, forecast.probabilidadPct);

  const alertType = forceP99 ? 'ALERTA CRÍTICA' : 'VIGILANCIA';
  const alertColor = forceP99 ? 'red' : 'orange';
  const priority = forceP99
    ? 'Alerta Temprana Predictiva / Horizonte T+3h'
    : 'Vigilancia Predictiva / Horizonte T+3h';

  const payload = {
    codigoestacion: station.codigoestacion,
    zona_id,
    titulo_alerta: forceP99
      ? `Predicción T+3h: Riesgo de desbordamiento (${probPct}% prob.)`
      : `Predicción T+3h: Lluvia severa entrante (${probPct}% prob.)`,
    tipo_alerta: alertType,
    color_alerta: alertColor,
    cuenca_sector: `Cuenca ${station.zonahidrografica} (${station.municipio})`,
    descripcion: `Estación ${station.nombreestacion} [Lat ${station.latitud.toFixed(4)}, Lon ${station.longitud.toFixed(4)}]: Lluvia actual de ${lluviaActual} mm, pero se proyectan ${targetPrecip} mm acumulados en las próximas 3h (Humedad suelo: ${forecast.saturacionSueloPct}%, supera ${forceP99 ? `P99 histórico de ${station.umbral_alerta_roja} mm` : `P90 histórico de ${station.umbral_alerta_naranja} mm`}).`,
    estado_prioridad: priority,
    precipitacion_registrada: targetPrecip,
    revisado: false,
    fecha_evento: new Date().toISOString()
  };

  // Ejecutamos UPDATE en Supabase
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
