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

// Simulación de pico Kafka
export async function simulateKafkaPeak(stationCode, forceP99 = true) {
  const stations = getLocalStations();
  const station = stations.find(s => s.codigoestacion === stationCode);
  if (!station) return null;

  // Determinar zona norte o sur según latitud
  const isNorth = station.latitud >= 7.0;
  const alertId = isNorth ? 1 : 2;
  const zona_id = isNorth ? 'north' : 'south';

  // Si forceP99 es true, superamos el P99 + 15%; de lo contrario superamos P90
  const targetPrecip = forceP99
    ? Number((station.umbral_alerta_roja * 1.15).toFixed(1))
    : Number(((station.umbral_alerta_naranja + station.umbral_alerta_roja) / 2).toFixed(1));

  const alertType = forceP99 ? 'ALERTA CRÍTICA' : 'VIGILANCIA';
  const alertColor = forceP99 ? 'red' : 'orange';
  const priority = forceP99
    ? 'Prioridad 1 - Activación Inmediata de Sirenas y PMR'
    : 'Prioridad 2 - Notificación a Consejos Municipales';

  const payload = {
    codigoestacion: station.codigoestacion,
    zona_id,
    titulo_alerta: forceP99
      ? `Desbordamiento Inminente en ${station.nombreestacion}`
      : `Vigilancia Hidrológica en ${station.nombreestacion}`,
    tipo_alerta: alertType,
    color_alerta: alertColor,
    cuenca_sector: `Cuenca ${station.zonahidrografica} (${station.municipio})`,
    descripcion: `Evento de streaming Kafka ID-${Date.now().toString().slice(-4)}: precipitación registrada ${targetPrecip} mm supera ${forceP99 ? 'Percentil 99 (P99)' : 'Percentil 90 (P90)'}. Modelo de desbordamiento activado.`,
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
