import { useState, useMemo } from 'react';
import { 
  Layers, 
  MapPin, 
  Compass, 
  Sliders, 
  Radio, 
  X
} from 'lucide-react';

// Coordenadas extremas de Santander para proyección geoespacial
const BOUNDS = {
  minLat: 5.75,
  maxLat: 7.60,
  minLon: -74.15,
  maxLon: -72.60,
};

function projectCoordinates(lat, lon) {
  const x = ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * 100;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { 
    x: Math.max(3, Math.min(97, x)), 
    y: Math.max(4, Math.min(96, y)) 
  };
}

export default function GeospatialMap({ 
  stations, 
  alerts, 
  selectedStation, 
  onSelectStation,
  onSimulatePeak
}) {
  // Estados de capas
  const [showRadar, setShowRadar] = useState(true);
  const [showTopography, setShowTopography] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(75);
  const [zoomPreset, setZoomPreset] = useState('all'); // 'all', 'metropolitana', 'magdalena', 'guanenta'
  const [hoveredStation, setHoveredStation] = useState(null);

  // Mapa de alertas activas por código de estación
  const alertsByStation = useMemo(() => {
    const map = new Map();
    alerts.forEach(a => map.set(a.codigoestacion, a));
    return map;
  }, [alerts]);

  // Transformaciones de zoom según preset
  const zoomStyles = useMemo(() => {
    switch (zoomPreset) {
      case 'metropolitana':
        return { transform: 'scale(1.9) translate(-18%, -15%)', transformOrigin: 'center center' };
      case 'magdalena':
        return { transform: 'scale(1.8) translate(20%, -10%)', transformOrigin: 'center center' };
      case 'guanenta':
        return { transform: 'scale(1.8) translate(-10%, 20%)', transformOrigin: 'center center' };
      default:
        return { transform: 'scale(1)', transformOrigin: 'center center' };
    }
  }, [zoomPreset]);

  // Estación activa para el Tooltip flotante (seleccionada o hovered)
  const activeTooltipStation = hoveredStation || selectedStation;

  return (
    <div className="relative w-full h-[520px] lg:h-[620px] glass-panel rounded-3xl overflow-hidden border border-cyan-500/25 flex flex-col shadow-2xl">
      
      {/* Barra de Controles Superior del Mapa */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        
        {/* Selector de Capas */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#081827]/90 backdrop-blur-md border border-cyan-500/30 shadow-xl pointer-events-auto">
          <button
            onClick={() => setShowRadar(!showRadar)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              showRadar 
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-[0_0_10px_rgba(75,241,229,0.3)]' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Radar Predictivo (T+3h)</span>
          </button>

          <button
            onClick={() => setShowTopography(!showTopography)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              showTopography 
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-[0_0_10px_rgba(75,241,229,0.3)]' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Relieve Topográfico</span>
          </button>

          <button
            onClick={() => setShowStations(!showStations)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              showStations 
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-[0_0_10px_rgba(75,241,229,0.3)]' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Red IDEAM (26)</span>
          </button>
        </div>

        {/* Control de Opacidad del Radar y Presets de Región */}
        <div className="flex items-center gap-3 p-1.5 rounded-2xl bg-[#081827]/90 backdrop-blur-md border border-cyan-500/30 shadow-xl pointer-events-auto">
          {showRadar && (
            <div className="flex items-center gap-2 px-3 py-1 text-xs font-mono text-cyan-300">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Opacidad:</span>
              <input
                type="range"
                min="10"
                max="100"
                value={radarOpacity}
                onChange={(e) => setRadarOpacity(Number(e.target.value))}
                className="w-16 sm:w-20 accent-cyan-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
              />
              <span className="w-7 text-right tabular-nums">{radarOpacity}%</span>
            </div>
          )}

          {/* Presets de Cuenca / Región */}
          <div className="hidden md:flex items-center gap-1 border-l border-slate-700 pl-2">
            {[
              { id: 'all', label: 'Todo Santander' },
              { id: 'metropolitana', label: 'Bucaramanga' },
              { id: 'magdalena', label: 'Magdalena' },
              { id: 'guanenta', label: 'Guanentá' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setZoomPreset(p.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all ${
                  zoomPreset === p.id 
                    ? 'bg-cyan-500/40 text-white font-bold border border-cyan-400/40' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Brújula e Indicador de Coordenadas */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none hidden sm:flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[#081827]/85 backdrop-blur-md border border-cyan-500/30 text-cyan-300 font-mono text-[10px] flex items-center gap-2 shadow-lg">
          <Compass className="w-4 h-4 text-cyan-400 animate-[spin_20s_linear_infinite]" />
          <span>SANTANDER GRID: 5.75°N - 7.60°N · 74.15°W - 72.60°W</span>
        </div>
      </div>

      {/* Leyenda de Umbrales */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-none hidden sm:flex items-center gap-2 p-2 rounded-xl bg-[#081827]/85 backdrop-blur-md border border-cyan-500/30 text-[11px] font-mono shadow-lg">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300">
          <span className="w-2 h-2 rounded-full bg-[#fc626e] animate-ping" />
          <span>P99 Predicción Crítica</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300">
          <span className="w-2 h-2 rounded-full bg-[#ffb44a]" />
          <span>P90 Vigilancia T+3h</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
          <span className="w-2 h-2 rounded-full bg-[#4bf1e5]" />
          <span>Estación IDEAM</span>
        </div>
      </div>

      {/* LIENZO PRINCIPAL DEL MAPA (SVG Interactivo) */}
      <div className="relative w-full h-full overflow-hidden bg-[#030d17] cursor-crosshair">
        
        {/* Contenedor con zoom fluido */}
        <div 
          className="relative w-full h-full transition-transform duration-700 ease-out"
          style={zoomStyles}
        >
          {/* Capa 1: Relieve Topográfico, Curvas de Nivel y Red Hidrográfica */}
          {showTopography && (
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none" 
              viewBox="0 0 1000 700" 
              preserveAspectRatio="none"
            >
              <defs>
                {/* Gradiente de terreno montañoso andino */}
                <radialGradient id="cordilleraGlow" cx="60%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#0b283d" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#081e2f" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#030d17" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="magdalenaValley" cx="15%" cy="40%" r="40%">
                  <stop offset="0%" stopColor="#061c28" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#030d17" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="riverStream" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
                </linearGradient>
              </defs>

              {/* Fondo topográfico */}
              <rect width="1000" height="700" fill="#030e1a" />
              <ellipse cx="620" cy="380" rx="320" ry="260" fill="url(#cordilleraGlow)" />
              <ellipse cx="180" cy="350" rx="160" ry="280" fill="url(#magdalenaValley)" />

              {/* Curvas de nivel topográficas (Cañón del Chicamocha, Santurbán, Yariguíes) */}
              <g stroke="rgba(75,241,229,0.07)" strokeWidth="1.2" fill="none">
                <path d="M 550,120 Q 640,180 720,240 T 820,380 T 750,540 T 600,620" />
                <path d="M 500,160 Q 600,220 680,280 T 770,410 T 700,520 T 560,590" />
                <path d="M 450,200 Q 550,260 630,320 T 710,440 T 640,510 T 520,560" />
                <path d="M 400,240 Q 500,300 580,360 T 650,470 T 580,500 T 470,540" />
                {/* Serranía de los Yariguíes */}
                <path d="M 320,320 Q 380,370 410,440 T 360,560 T 300,620" />
                <path d="M 280,360 Q 340,400 370,470 T 320,550 T 260,600" />
              </g>

              {/* Red Hidrográfica Principal (Ríos de Santander) */}
              <g fill="none" stroke="url(#riverStream)" strokeLinecap="round">
                {/* Río Magdalena (Límite Occidental) */}
                <path d="M 120,40 Q 140,180 130,320 T 110,500 T 80,680" strokeWidth="4.5" opacity="0.85" />
                {/* Río Sogamoso (Desembocando al Magdalena) */}
                <path d="M 520,300 Q 380,330 260,320 T 130,330" strokeWidth="3" opacity="0.8" />
                {/* Río Chicamocha (Formando el Cañón) */}
                <path d="M 850,380 Q 750,350 640,320 T 520,300" strokeWidth="2.5" opacity="0.8" />
                {/* Río Suárez (Hacia el Sogamoso) */}
                <path d="M 480,680 Q 500,560 510,440 T 520,300" strokeWidth="2.5" opacity="0.8" />
                {/* Río Fonce (San Gil - Charalá hacia el Suárez) */}
                <path d="M 660,580 Q 640,490 580,450 T 515,410" strokeWidth="2.2" opacity="0.8" />
                {/* Río Lebrija y Rionegro (Norte) */}
                <path d="M 620,90 Q 560,140 440,160 T 280,180 T 140,210" strokeWidth="2.4" opacity="0.8" />
                {/* Río Carare y Opón (Sur-Occidente) */}
                <path d="M 360,680 Q 280,600 220,520 T 115,480" strokeWidth="2.2" opacity="0.8" />
              </g>

              {/* Nombres de Cuencas Hidrográficas */}
              <g className="font-mono text-[9px] fill-cyan-400/50 uppercase tracking-widest pointer-events-none select-none">
                <text x="80" y="240">Valle Río Magdalena</text>
                <text x="440" y="140">Cuenca Río Lebrija</text>
                <text x="590" y="290">Cañón del Chicamocha</text>
                <text x="590" y="520">Cuenca Río Fonce</text>
                <text x="430" y="540">Cuenca Río Suárez</text>
                <text x="220" y="580">Cuenca Río Carare</text>
              </g>
            </svg>
          )}

          {/* Capa 2: Radar Meteorológico de Lluvia en Vivo (Doppler Radar) */}
          {showRadar && (
            <div 
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{ opacity: radarOpacity / 100 }}
            >
              <svg className="w-full h-full" viewBox="0 0 1000 700" preserveAspectRatio="none">
                <defs>
                  {/* Celda de tormenta crítica Norte (El Playón / Lebrija) */}
                  <radialGradient id="stormCellNorth" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fc626e" stopOpacity="0.95" />
                    <stop offset="25%" stopColor="#ffb44a" stopOpacity="0.8" />
                    <stop offset="60%" stopColor="#4bf1e5" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
                  </radialGradient>

                  {/* Celda de lluvia activa Sur (San Gil / Fonce) */}
                  <radialGradient id="stormCellSouth" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffb44a" stopOpacity="0.9" />
                    <stop offset="40%" stopColor="#41c59b" stopOpacity="0.6" />
                    <stop offset="75%" stopColor="#38bdf8" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
                  </radialGradient>

                  {/* Llovizna dispersa Barrancabermeja / Magdalena Medio */}
                  <radialGradient id="rainMiddleMagdalena" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.7" />
                    <stop offset="50%" stopColor="#4bf1e5" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Manchas de Reflectividad Radar (dBZ) */}
                <ellipse cx="530" cy="140" rx="140" ry="90" fill="url(#stormCellNorth)" />
                <ellipse cx="640" cy="460" rx="120" ry="80" fill="url(#stormCellSouth)" />
                <ellipse cx="220" cy="300" rx="110" ry="130" fill="url(#rainMiddleMagdalena)" />
                <ellipse cx="360" cy="560" rx="80" ry="60" fill="url(#rainMiddleMagdalena)" />

                {/* Anillos de alcance de Radar Doppler (Centro Bucaramanga Palonegro) */}
                <g stroke="rgba(75, 241, 229, 0.22)" strokeDasharray="4 4" fill="none">
                  <circle cx="530" cy="220" r="80" />
                  <circle cx="530" cy="220" r="160" />
                  <circle cx="530" cy="220" r="260" />
                </g>
              </svg>

              {/* Línea de barrido de radar animada */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
                <div className="w-full h-full animate-[spin_8s_linear_infinite] origin-[53%_31%]">
                  <div className="w-1/2 h-full bg-gradient-to-r from-transparent via-cyan-400/10 to-cyan-400/30" />
                </div>
              </div>
            </div>
          )}

          {/* Capa 3: Red de 26 Estaciones IDEAM */}
          {showStations && (
            <div className="absolute inset-0">
              {stations.map((st) => {
                const { x, y } = projectCoordinates(st.latitud, st.longitud);
                const alert = alertsByStation.get(st.codigoestacion);
                const isSelected = selectedStation?.codigoestacion === st.codigoestacion;

                let markerColor = 'bg-cyan-400 text-cyan-900 border-cyan-200';
                const isCritical = alert?.color_alerta === 'red' && !alert.revisado;
                const isSurveillance = alert?.color_alerta === 'orange' && !alert.revisado;
                const isReviewed = alert?.revisado;

                if (isCritical) {
                  markerColor = 'bg-[#fc626e] text-white border-rose-200 shadow-[0_0_20px_#fc626e]';
                } else if (isSurveillance) {
                  markerColor = 'bg-[#ffb44a] text-slate-900 border-amber-200 shadow-[0_0_15px_#ffb44a]';
                } else if (isReviewed) {
                  markerColor = 'bg-[#41c59b] text-slate-900 border-emerald-200';
                }

                return (
                  <div
                    key={st.codigoestacion}
                    style={{ left: `${x}%`, top: `${y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 transition-transform duration-200 hover:scale-125"
                    onClick={() => onSelectStation(st)}
                    onMouseEnter={() => setHoveredStation(st)}
                    onMouseLeave={() => setHoveredStation(null)}
                  >
                    {/* Anillos pulsantes para alertas críticas o vigilancia */}
                    {isCritical && (
                      <span className="absolute -inset-3 flex items-center justify-center">
                        <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-[#fc626e] opacity-75"></span>
                        <span className="animate-pulse absolute inline-flex h-6 w-6 rounded-full bg-[#fc626e] opacity-40"></span>
                      </span>
                    )}

                    {isSurveillance && (
                      <span className="absolute -inset-2.5 flex items-center justify-center">
                        <span className="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-[#ffb44a] opacity-60"></span>
                      </span>
                    )}

                    {/* Marcador Principal */}
                    <div className={`relative flex items-center justify-center w-5 h-5 rounded-full border-2 ${markerColor} ${
                      isSelected ? 'ring-4 ring-cyan-300 ring-offset-2 ring-offset-[#030b14] scale-125' : ''
                    }`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>

                    {/* Etiqueta flotante con nombre de municipio */}
                    <div className={`absolute top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-[#030e1a]/95 border border-slate-700/80 text-[10px] font-mono whitespace-nowrap pointer-events-none transition-opacity ${
                      isSelected || hoveredStation?.codigoestacion === st.codigoestacion ? 'opacity-100 z-30' : 'opacity-70 group-hover:opacity-100'
                    }`}>
                      <span className={isCritical ? 'text-rose-400 font-bold' : isSurveillance ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                        {st.municipio}
                      </span>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>

      {/* TOOLTIP / TARJETA FLOTANTE DE LA ESTACIÓN O CUENCA SELECCIONADA */}
      {activeTooltipStation && (
        <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-30 glass-panel rounded-2xl p-4 border border-cyan-400/40 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                  IDEAM COD: {activeTooltipStation.codigoestacion}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                  {activeTooltipStation.municipio}
                </span>
              </div>
              <h4 className="text-sm font-bold text-white leading-tight">
                {activeTooltipStation.nombreestacion}
              </h4>
            </div>

            <button
              onClick={() => onSelectStation(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
            <div className="p-2 rounded-xl bg-[#061421]/90 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 block">Cuenca Hidrográfica</span>
              <span className="text-cyan-300 font-semibold truncate block">{activeTooltipStation.zonahidrografica}</span>
            </div>
            <div className="p-2 rounded-xl bg-[#061421]/90 border border-slate-700/60">
              <span className="text-[10px] text-slate-400 block">Coordenadas Geodésicas</span>
              <a
                href={`https://www.windy.com/${activeTooltipStation.latitud}/${activeTooltipStation.longitud}?rain,${activeTooltipStation.latitud},${activeTooltipStation.longitud},11`}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 hover:underline block"
                title="Verificar radar satelital en vivo en Windy.com"
              >
                {activeTooltipStation.latitud.toFixed(4)}°N, {activeTooltipStation.longitud.toFixed(4)}°W
              </a>
            </div>
            <div className="p-2 rounded-xl bg-[#061421]/90 border border-amber-500/30">
              <span className="text-[10px] text-amber-400 block">Umbral P90 (Vigilancia)</span>
              <span className="text-amber-300 font-bold text-sm">{activeTooltipStation.umbral_alerta_naranja} mm</span>
            </div>
            <div className="p-2 rounded-xl bg-[#061421]/90 border border-rose-500/30">
              <span className="text-[10px] text-rose-400 block">Umbral P99 (Crítico)</span>
              <span className="text-rose-300 font-bold text-sm">{activeTooltipStation.umbral_alerta_roja} mm</span>
            </div>
          </div>

          {/* Estadísticas de la Capa Oro y Verificación Satelital */}
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800 pt-2 mb-3">
            <span>Lecturas Spark: <strong className="text-slate-200">{activeTooltipStation.total_lecturas.toLocaleString()}</strong></span>
            <a
              href={`https://www.windy.com/${activeTooltipStation.latitud}/${activeTooltipStation.longitud}?rain,${activeTooltipStation.latitud},${activeTooltipStation.longitud},11`}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 hover:text-cyan-200 underline"
            >
              Ver Radar Windy
            </a>
          </div>

          {/* Botón rápido para Proyectar Escenario Predictivo T+3h */}
          <button
            onClick={() => onSimulatePeak(activeTooltipStation.codigoestacion, true)}
            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-rose-600/30 to-amber-600/30 hover:from-rose-600/40 hover:to-amber-600/40 border border-rose-500/50 text-white text-xs font-mono font-semibold transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95"
          >
            <Radio className="w-3.5 h-3.5 text-rose-300 animate-pulse" />
            <span>Proyectar Escenario Predictivo (T+3h)</span>
          </button>

        </div>
      )}

    </div>
  );
}
