import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from './lib/supabaseClient';
import Navbar from './components/Navbar';
import AlertsSidebar from './components/AlertsSidebar';
import GeospatialMap from './components/GeospatialMap';
import GoldLayerTable from './components/GoldLayerTable';
import ProtocolModal from './components/ProtocolModal';

export default function App() {
  const [alerts, setAlerts] = useState([]);
  const [stations, setStations] = useState([]);
  const [selectedZone, setSelectedZone] = useState('north');
  const [selectedStation, setSelectedStation] = useState(null);
  const [isProtocolOpen, setIsProtocolOpen] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  }, []);

  const fetchInitialData = useCallback(async () => {
    const [{ data: alertsData }, { data: stationsData }] = await Promise.all([
      supabase.from('alertas_activas').select('*').order('id', { ascending: true }),
      supabase.from('umbrales_estaciones').select('*').order('umbral_alerta_roja', { ascending: false }),
    ]);

    if (alertsData) setAlerts(alertsData);
    if (stationsData) setStations(stationsData);
    setLastUpdate(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    fetchInitialData();

    // Suscripción WebSockets a Supabase Realtime (conectado al consumidor de Apache Kafka)
    const channel = supabase
      .channel('centro-mando-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alertas_activas' },
        (payload) => {
          const updated = payload.new;
          if (!updated) return;
          setAlerts((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
          setLastUpdate(new Date().toLocaleTimeString());
          showToast(
            `⚡ Evento Realtime: ${updated.cuenca_sector} (${updated.precipitacion_registrada} mm)`
          );
        }
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitialData, showToast]);

  const handleConfirmReview = async (alertId) => {
    setIsProtocolOpen(false);
    const { error } = await supabase
      .from('alertas_activas')
      .update({ revisado: true, tipo_alerta: 'ESCENARIO REVISADO' })
      .eq('id', alertId);

    if (!error) {
      showToast('✅ Revisión operativa persistida en Supabase');
      fetchInitialData();
    }
  };

  const handleTriggerSimulation = async (station, level) => {
    const isRed = level === 'ROJA';
    const targetId = isRed ? 1 : 2;
    const targetZone = isRed ? 'north' : 'south';
    const baseThreshold = isRed ? Number(station.umbral_alerta_roja) : Number(station.umbral_alerta_naranja);
    const simulatedRain = Number((baseThreshold * 1.12).toFixed(1));

    const payload = {
      zona_id: targetZone,
      codigoestacion: String(station.codigoestacion),
      titulo_alerta: isRed ? 'Desbordamiento inminente en 2 horas' : 'Lluvia intensa persistente',
      tipo_alerta: isRed ? 'ALERTA CRÍTICA' : 'VIGILANCIA',
      color_alerta: isRed ? 'red' : 'orange',
      cuenca_sector: `Cuenca ${station.zonahidrografica} (${station.municipio})`,
      descripcion: `Estación ${station.nombreestacion} registró ${simulatedRain} mm (supera umbral ${
        isRed ? `P99 de ${station.umbral_alerta_roja}` : `P90 de ${station.umbral_alerta_naranja}`
      } mm).`,
      estado_prioridad: isRed ? 'Prioridad crítica / horizonte 2 h' : 'Vigilancia / seguimiento preventivo',
      precipitacion_registrada: simulatedRain,
      revisado: false,
      fecha_evento: new Date().toISOString(),
    };

    await supabase.from('alertas_activas').update(payload).eq('id', targetId);
    setSelectedZone(targetZone);
    setSelectedStation(station);
  };

  const activeAlert = alerts.find((a) => a.zona_id === selectedZone) || alerts[0];

  return (
    <div className="max-w-[1480px] mx-auto p-4 md:p-7">
      <main className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-[#142d3e]/75 to-[#071522]/90 p-5 md:p-7 shadow-[0_28px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
        <Navbar
          totalStations={stations.length}
          activeAlertsCount={alerts.filter((a) => !a.revisado).length}
          isRealtimeConnected={isRealtimeConnected}
          lastUpdate={lastUpdate}
          onRefresh={fetchInitialData}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[370px_1fr] gap-6">
          <AlertsSidebar
            alerts={alerts}
            selectedZone={selectedZone}
            onSelectZone={(zone) => {
              setSelectedZone(zone);
              setSelectedStation(null);
            }}
            onOpenProtocol={() => setIsProtocolOpen(true)}
          />

          <GeospatialMap
            alerts={alerts}
            stations={stations}
            selectedZone={selectedZone}
            onSelectZone={setSelectedZone}
            selectedStation={selectedStation}
            onSelectStation={setSelectedStation}
            onOpenProtocol={() => setIsProtocolOpen(true)}
          />
        </div>

        <GoldLayerTable
          stations={stations}
          onTriggerSimulation={handleTriggerSimulation}
          onSelectStation={setSelectedStation}
        />
      </main>

      <ProtocolModal
        isOpen={isProtocolOpen}
        alert={activeAlert}
        onClose={() => setIsProtocolOpen(false)}
        onConfirmReview={handleConfirmReview}
      />

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-teal-950/95 border border-teal-400/50 text-teal-100 text-xs font-bold shadow-2xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
}