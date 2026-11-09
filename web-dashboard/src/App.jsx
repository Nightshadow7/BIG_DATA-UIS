import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Navbar from './components/Navbar';
import AlertsSidebar from './components/AlertsSidebar';
import GeospatialMap from './components/GeospatialMap';
import GoldLayerTable from './components/GoldLayerTable';
import ProtocolModal from './components/ProtocolModal';
import { 
  supabase, 
  simulateKafkaPeak, 
  resetDefaultAlerts,
  isLiveSupabaseConfigured
} from './lib/supabaseClient';
import { calculateKpis } from './lib/hydrologyRules';
import { DEFAULT_STATIONS, DEFAULT_ALERTS } from './lib/defaultData';
import { 
  AlertOctagon, 
  CheckCircle, 
  Info, 
  Radio, 
  X, 
  ShieldAlert,
  Waves
} from 'lucide-react';

export default function App() {
  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [alerts, setAlerts] = useState(DEFAULT_ALERTS);
  const [selectedStation, setSelectedStation] = useState(null);
  const [selectedAlertId, setSelectedAlertId] = useState(1);
  const [activeProtocolAlert, setActiveProtocolAlert] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingProtocol, setIsSubmittingProtocol] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Adición de Toast con auto-cierre
  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    const newToast = { id, timestamp: new Date(), ...toast };
    setToasts((prev) => [newToast, ...prev.slice(0, 4)]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Carga inicial de datos desde Supabase
  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 1. Cargar umbrales_estaciones (Capa Oro Spark)
      const stationsRes = await supabase.from('umbrales_estaciones').select('*');
      if (stationsRes.data && stationsRes.data.length > 0) {
        setStations(stationsRes.data);
      }

      // 2. Cargar alertas_activas (Kafka Stream)
      const alertsRes = await supabase.from('alertas_activas').select('*');
      if (alertsRes.data && alertsRes.data.length > 0) {
        setAlerts(alertsRes.data);
      }
    } catch (err) {
      console.warn('[App loadData] Usando datos locales de contingencia:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Suscripción Realtime a Supabase Postgres Changes
  useEffect(() => {
    const channel = supabase
      .channel('realtime-alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alertas_activas' },
        (payload) => {
          const newAlert = payload.new;
          if (!newAlert) return;

          // Actualizar estado de alertas
          setAlerts((currentAlerts) => {
            const index = currentAlerts.findIndex((a) => a.id === newAlert.id);
            if (index !== -1) {
              const updated = [...currentAlerts];
              updated[index] = newAlert;
              return updated;
            }
            return [newAlert, ...currentAlerts];
          });

          // Notificación Toast reactiva
          const isReviewed = newAlert.revisado;
          const isCritical = newAlert.color_alerta === 'red';

          addToast({
            title: isReviewed 
              ? 'Protocolo Completado' 
              : isCritical 
                ? '¡Pico Kafka Crítico Inyectado!' 
                : 'Actualización Kafka en Vivo',
            description: `${newAlert.titulo_alerta} (${newAlert.precipitacion_registrada} mm) · ${newAlert.cuenca_sector}`,
            type: isReviewed ? 'success' : isCritical ? 'danger' : 'warning',
            zona: newAlert.zona_id,
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Supabase Realtime] Conectado al canal realtime-alerts');
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [addToast]);

  // Cálculo de KPIs mediante la función pura desacoplada
  const kpis = useMemo(() => {
    return calculateKpis(stations, alerts);
  }, [stations, alerts]);

  // Seleccionar alerta desde la barra lateral y enfocar estación en el mapa
  const handleSelectAlert = (alert) => {
    setSelectedAlertId(alert.id);
    const station = stations.find((s) => s.codigoestacion === alert.codigoestacion);
    if (station) {
      setSelectedStation(station);
    }
  };

  // Simulación de Pico Kafka
  const handleSimulatePeak = async (stationCode, forceP99 = true) => {
    const station = stations.find((s) => s.codigoestacion === stationCode);
    if (!station) return;

    try {
      const result = await simulateKafkaPeak(stationCode, forceP99);
      if (result) {
        setSelectedStation(station);
        setSelectedAlertId(result.alertId);
        addToast({
          title: 'Mensaje Kafka Inyectado',
          description: `Estación ${station.nombreestacion} alcanzó ${result.payload.precipitacion_registrada} mm superando ${forceP99 ? 'P99' : 'P90'}.`,
          type: forceP99 ? 'danger' : 'warning',
          zona: result.payload.zona_id,
        });
      }
    } catch (err) {
      console.error('[SimulatePeak Error]', err);
    }
  };

  // Confirmar y marcar como revisado (UPDATE en Supabase)
  const handleConfirmReview = async (alertId) => {
    setIsSubmittingProtocol(true);
    try {
      const updatePayload = {
        revisado: true,
        tipo_alerta: 'ESCENARIO REVISADO',
        color_alerta: 'reviewed',
        estado_prioridad: 'Nivel 3 - Protocolo UGRD Ejecutado y Cerrado',
      };

      await supabase.from('alertas_activas').update(updatePayload).eq('id', alertId);

      setActiveProtocolAlert(null);
      addToast({
        title: 'Escenario Marcado como Revisado',
        description: 'Se registró la verificación en Supabase y se cerró la fase crítica.',
        type: 'success',
      });
    } catch (err) {
      console.error('[ConfirmReview Error]', err);
    } finally {
      setIsSubmittingProtocol(false);
    }
  };

  // Resetear alertas
  const handleResetAlerts = () => {
    const res = resetDefaultAlerts();
    setAlerts(res);
    addToast({
      title: 'Alertas Restablecidas',
      description: 'Se reiniciaron los escenarios de alerta iniciales del sistema.',
      type: 'info',
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#030b14] text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* 1. Navbar con KPIs, WebSocket Status y Acciones */}
      <Navbar
        kpis={kpis}
        onRefresh={loadData}
        isRefreshing={isRefreshing}
        onResetAlerts={handleResetAlerts}
        isLiveDb={isLiveSupabaseConfigured()}
      />

      {/* 2. Cuerpo Principal del Centro de Mando */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        
        {/* Banner Superior de Estado de Misión Crítica */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-[#0c2336]/90 via-[#0a1b2a]/90 to-[#081522]/90 border border-cyan-500/25 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
              <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-wider text-cyan-300 uppercase">
                  SISTEMA DE ALERTA TEMPRANA Y RESILIENCIA
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
                  RED OPERATIVA
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Monitoreo continuo de 26 estaciones pluviométricas del IDEAM en cuencas de Santander conectadas a Supabase Realtime y Apache Kafka.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>Latencia Bus: <strong className="text-cyan-300">14 ms</strong></span>
            <span>·</span>
            <span>Micro-batch: <strong className="text-slate-200">500ms</strong></span>
          </div>
        </div>

        {/* Zona Central: Sidebar de Alertas + Mapa Geoespacial de Santander */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Panel Izquierdo: Alertas Activas (4 columnas en pantallas grandes) */}
          <div className="lg:col-span-4 w-full">
            <AlertsSidebar
              alerts={alerts}
              stations={stations}
              selectedAlertId={selectedAlertId}
              onSelectAlert={handleSelectAlert}
              onOpenProtocol={(alert) => setActiveProtocolAlert(alert)}
            />
          </div>

          {/* Panel Derecho: Mapa Geoespacial Topográfico e Hidroclimático (8 columnas) */}
          <div className="lg:col-span-8 w-full">
            <GeospatialMap
              stations={stations}
              alerts={alerts}
              selectedStation={selectedStation}
              onSelectStation={(st) => setSelectedStation(st)}
              onSimulatePeak={handleSimulatePeak}
            />
          </div>

        </div>

        {/* Zona Inferior: Tabla de Capa Oro Parquet Spark */}
        <div className="w-full">
          <GoldLayerTable
            stations={stations}
            onSelectStation={(st) => {
              setSelectedStation(st);
              // Si la estación tiene alerta, seleccionarla también
              const matchingAlert = alerts.find((a) => a.codigoestacion === st.codigoestacion);
              if (matchingAlert) setSelectedAlertId(matchingAlert.id);
            }}
            onSimulatePeak={handleSimulatePeak}
            selectedStation={selectedStation}
          />
        </div>

      </main>

      {/* 3. Modal de Protocolo de Emergencia */}
      {activeProtocolAlert && (
        <ProtocolModal
          alert={activeProtocolAlert}
          onClose={() => setActiveProtocolAlert(null)}
          onConfirmReview={handleConfirmReview}
          isSubmitting={isSubmittingProtocol}
        />
      )}

      {/* 4. Sistema de Notificaciones Toast en Tiempo Real (Kafka Stream Feed) */}
      <div 
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          let borderCol = 'border-cyan-500/40';
          let bgCol = 'bg-[#091b2c]/95';
          let icon = <Info className="w-4 h-4 text-cyan-400" />;

          if (toast.type === 'danger') {
            borderCol = 'border-rose-500/60 shadow-[0_0_20px_rgba(252,98,110,0.3)]';
            bgCol = 'bg-[#1e0a13]/95';
            icon = <AlertOctagon className="w-4 h-4 text-[#fc626e] animate-bounce" />;
          } else if (toast.type === 'warning') {
            borderCol = 'border-amber-500/60 shadow-[0_0_20px_rgba(255,180,74,0.25)]';
            bgCol = 'bg-[#1b1409]/95';
            icon = <ShieldAlert className="w-4 h-4 text-[#ffb44a]" />;
          } else if (toast.type === 'success') {
            borderCol = 'border-emerald-500/60 shadow-[0_0_20px_rgba(65,197,155,0.25)]';
            bgCol = 'bg-[#091d17]/95';
            icon = <CheckCircle className="w-4 h-4 text-[#41c59b]" />;
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-2xl p-4 border backdrop-blur-2xl text-xs font-mono shadow-2xl transition-all duration-300 animate-in slide-in-from-right-4 ${bgCol} ${borderCol}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 mt-0.5">{icon}</div>
                  <div>
                    <div className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span>{toast.title}</span>
                      {toast.zona && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/50 text-cyan-300 border border-slate-700">
                          {toast.zona === 'north' ? 'NORTE' : 'SUR'}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 text-[11px] font-sans mt-0.5 leading-relaxed">
                      {toast.description}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Minimalista Institucional */}
      <footer className="w-full border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500 font-mono">
        <p>
          Centro de Mando Hidroclimático y Resiliencia en Santander · Gobernación de Santander & IDEAM Big Data Pipeline
        </p>
      </footer>

    </div>
  );
}
