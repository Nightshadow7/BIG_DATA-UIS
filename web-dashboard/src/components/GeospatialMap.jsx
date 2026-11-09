import React, { useState } from 'react';
import { Layers, Compass, Radio, ShieldCheck } from 'lucide-react';

// Bounding Box geográfico de Santander para proyectar Latitud/Longitud reales
const BOUNDS = {
  minLat: 5.70,
  maxLat: 8.15,
  minLon: -74.55,
  maxLon: -72.45,
};

function projectCoords(lat, lon) {
  const clampedLat = Math.max(BOUNDS.minLat, Math.min(BOUNDS.maxLat, Number(lat) || 7.0));
  const clampedLon = Math.max(BOUNDS.minLon, Math.min(BOUNDS.maxLon, Number(lon) || -73.2));
  const x = ((clampedLon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * 84 + 8;
  const y = ((BOUNDS.maxLat - clampedLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 82 + 9;
  return { left: `${x.toFixed(1)}%`, top: `${y.toFixed(1)}%` };
}

export default function GeospatialMap({
  alerts,
  stations,
  selectedZone,
  onSelectZone,
  selectedStation,
  onSelectStation,
  onOpenProtocol,
}) {
  const [layer, setLayer] = useState('rain'); // 'rain' | 'relief' | 'stations'
  const [rainOpacity, setRainOpacity] = useState(90);

  const activeAlert = alerts.find((a) => a.zona_id === selectedZone) || alerts[0];

  return (
    <section className="rounded-2xl overflow-hidden border border-cyan-500/25 bg-[#081a28] flex flex-col justify-between shadow-2xl">
      {/* Barra de Herramientas del Mapa */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#10283d]/90 border-b border-cyan-500/20">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-cyan-400" />
          <span className="font-black text-sm text-cyan-50">
             Malla Geoespacial de Estaciones IDEAM • Santander
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-lg border border-slate-700/60">
          {[
            { id: 'rain', label: 'Radar Lluvia' },
            { id: 'stations', label: `Estaciones (${stations.length})` },
            { id: 'relief', label: 'Relieve Base' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLayer(tab.id)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                layer === tab.id
                  ? 'bg-teal-500/25 text-teal-200 border border-teal-400/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lienzo Topográfico y Proyección de Coordenadas */}
      <div className="relative h-[420px] w-full overflow-hidden bg-[#061320] select-none">
        {/* Retícula Topográfica SVG */}
        <svg className="absolute inset-0 w-full h-full opacity-25 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="topo-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#38bdf8" strokeWidth="0.4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#topo-grid)" />
          {/* Curvas de nivel hidrográficas estilizadas (Cuencas Magdalena / Sogamoso / Suárez) */}
          <path d="M 80 390 Q 220 260 350 220 T 620 60" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" />
          <path d="M 180 410 Q 340 300 490 250 T 760 110" fill="none" stroke="#14b8a6" strokeWidth="1.5" opacity="0.4" />
        </svg>

        {/* Capa de Calor de Precipitación (Heatmap Dinámico) */}
        {layer !== 'relief' && (
          <div
            style={{ opacity: rainOpacity / 100 }}
            className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          >
            <div className="absolute left-[38%] top-[12%] w-64 h-64 rounded-full bg-rose-500/35 blur-3xl animate-pulse" />
            <div className="absolute left-[58%] top-[52%] w-72 h-72 rounded-full bg-amber-500/30 blur-3xl" />
            <div className="absolute left-[25%] top-[40%] w-56 h-56 rounded-full bg-emerald-500/20 blur-3xl" />
          </div>
        )}

        {/* Pines de las 26 Estaciones Reales de la Capa Oro (Latitud / Longitud reales) */}
        {stations.map((st) => {
          const pos = projectCoords(st.latitud, st.longitud);
          const isAlertStation = alerts.some((a) => String(a.codigoestacion) === String(st.codigoestacion));
          const isSelectedSt = selectedStation?.codigoestacion === st.codigoestacion;

          return (
            <button
              key={st.codigoestacion}
              type="button"
              onClick={() => onSelectStation(st)}
              style={pos}
              title={`${st.nombreestacion} (${st.municipio}) | P99: ${st.umbral_alerta_roja} mm`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all cursor-pointer ${
                isAlertStation
                  ? 'z-20 w-5 h-5 bg-rose-500 border-2 border-white shadow-[0_0_20px_#f43f5e]'
                  : isSelectedSt
                  ? 'z-20 w-4 h-4 bg-cyan-300 border-2 border-white shadow-[0_0_15px_#22d3ee]'
                  : 'z-10 w-2.5 h-2.5 bg-cyan-400/70 hover:bg-cyan-300 hover:scale-150 border border-cyan-200/50'
              }`}
            >
              {isAlertStation && (
                <span className="absolute -inset-2 rounded-full bg-rose-500/40 animate-ping" />
              )}
            </button>
          );
        })}

        {/* Marcadores Principales de Escenarios Activos (Norte / Sur) */}
        {alerts.map((al) => {
          const matchedStation = stations.find((s) => String(s.codigoestacion) === String(al.codigoestacion));
          const pos = matchedStation
            ? projectCoords(matchedStation.latitud, matchedStation.longitud)
            : al.zona_id === 'north'
            ? { left: '49%', top: '22%' }
            : { left: '72%', top: '68%' };

          const isRed = al.color_alerta === 'red' && !al.revisado;
          const isActive = selectedZone === al.zona_id;

          return (
            <div key={al.id} style={pos} className="absolute z-30 -translate-x-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={() => {
                  onSelectZone(al.zona_id);
                  if (matchedStation) onSelectStation(matchedStation);
                }}
                className={`relative w-6 h-6 rounded-full border-2 border-white transition cursor-pointer ${
                  al.revisado
                    ? 'bg-emerald-500 shadow-[0_0_20px_#10b981]'
                    : isRed
                    ? 'bg-rose-500 shadow-[0_0_25px_#f43f5e]'
                    : 'bg-amber-400 shadow-[0_0_20px_#f59e0b]'
                } ${isActive ? 'scale-125 ring-4 ring-cyan-300/50' : ''}`}
              />
              <span className="absolute left-7 -top-1 whitespace-nowrap px-2.5 py-1 rounded-md text-[11px] font-black bg-slate-950/90 text-white border border-cyan-500/30 shadow-lg">
                {al.cuenca_sector.split('(')[0].trim()} • {al.precipitacion_registrada} mm
              </span>
            </div>
          );
        })}

        {/* Tarjeta Flotante de Inspección (Tooltip Operativo) */}
        {activeAlert && (
          <aside className="absolute right-4 top-4 z-30 w-72 p-4 rounded-xl bg-[#0c1e30]/95 border border-cyan-400/40 backdrop-blur-md shadow-2xl">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-cyan-300 mb-1">
              <span>{selectedStation ? `Estación #${selectedStation.codigoestacion}` : 'Zona Seleccionada'}</span>
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            </div>

            <h3 className="text-base font-black text-white mb-1">
              {selectedStation ? selectedStation.nombreestacion : activeAlert.cuenca_sector}
            </h3>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              {selectedStation
                ? `Municipio de ${selectedStation.municipio} (${selectedStation.zonahidrografica}). Umbral P90: ${selectedStation.umbral_alerta_naranja} mm | P99: ${selectedStation.umbral_alerta_roja} mm.`
                : activeAlert.descripcion}
            </p>

            <div className="flex items-center justify-between text-xs font-bold pt-2.5 border-t border-cyan-500/20">
              <span className={activeAlert.revisado ? 'text-emerald-300' : 'text-rose-300'}>
                {activeAlert.estado_prioridad}
              </span>
              <button
                type="button"
                onClick={onOpenProtocol}
                className="flex items-center gap-1 text-cyan-300 hover:text-cyan-100 underline cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Protocolo
              </button>
            </div>
          </aside>
        )}

        <span className="absolute bottom-3 left-3 z-20 text-[10px] font-mono text-slate-300 bg-slate-950/80 px-2.5 py-1 rounded border border-slate-700/60">
          PROYECCIÓN GEOESPACIAL SANTANDER (LAT 5.7°N - 8.1°N / LON 74.5°W - 72.4°W)
        </span>
      </div>

      {/* Leyenda y Control de Opacidad */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-[#0c2133] border-t border-cyan-500/20 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-300 font-medium">Intensidad Pluviométrica:</span>
          <div className="w-28 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500" />
          <span className="text-[11px] text-slate-400">Normal → P90 → P99</span>
        </div>

        <label className="flex items-center gap-2 text-slate-300">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>Opacidad Radar:</span>
          <input
            type="range"
            min="20"
            max="100"
            value={rainOpacity}
            onChange={(e) => setRainOpacity(Number(e.target.value))}
            className="w-24 accent-teal-400 cursor-pointer"
          />
          <span className="font-mono text-cyan-200 w-9">{rainOpacity}%</span>
        </label>
      </div>
    </section>
  );
}