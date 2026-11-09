import { 
  AlertOctagon, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  ChevronRight, 
  ShieldAlert, 
  Waves,
  Zap,
  Info
} from 'lucide-react';

export default function AlertsSidebar({ 
  alerts, 
  stations, 
  selectedAlertId, 
  onSelectAlert, 
  onOpenProtocol 
}) {
  return (
    <aside className="w-full lg:w-96 flex flex-col gap-4">
      {/* Encabezado del Panel */}
      <div className="glass-panel rounded-2xl p-4 flex items-center justify-between border-cyan-500/20">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
            <ShieldAlert className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              Alertas Hidroclimáticas
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-500/30">
                KAFKA BUS
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 font-mono">
              Eventos en tiempo real por cuenca hidrográfica
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-mono font-bold text-cyan-300">
            {alerts.length} Zonas
          </span>
        </div>
      </div>

      {/* Lista de Tarjetas de Alerta */}
      <div className="flex flex-col gap-3.5 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
        {alerts.map((alert) => {
          const station = stations.find(s => s.codigoestacion === alert.codigoestacion);
          const p99 = station?.umbral_alerta_roja || 100;
          const p90 = station?.umbral_alerta_naranja || 70;
          const currentRain = alert.precipitacion_registrada;
          const p99Ratio = Math.min(Math.round((currentRain / p99) * 100), 180);
          const isSelected = selectedAlertId === alert.id;

          // Coloración y estilos según estado
          let borderStyle = 'border-rose-500/40 hover:border-rose-400/70';
          let bgStyle = 'bg-gradient-to-b from-[#190d18]/90 to-[#0c1825]/90';
          let glowStyle = 'shadow-[0_0_20px_rgba(252,98,110,0.18)]';
          let icon = <AlertOctagon className="w-4 h-4 text-[#fc626e] animate-pulse" />;
          let badgeBg = 'bg-[#fc626e]/20 text-[#fc626e] border-[#fc626e]/40';
          let barBg = 'bg-gradient-to-r from-amber-400 via-rose-500 to-rose-600';

          if (alert.revisado) {
            borderStyle = 'border-emerald-500/40 hover:border-emerald-400/70';
            bgStyle = 'bg-gradient-to-b from-[#0b1d1d]/90 to-[#0a1622]/90';
            glowStyle = 'shadow-[0_0_20px_rgba(65,197,155,0.12)]';
            icon = <CheckCircle2 className="w-4 h-4 text-[#41c59b]" />;
            badgeBg = 'bg-[#41c59b]/20 text-[#41c59b] border-[#41c59b]/40';
            barBg = 'bg-emerald-500';
          } else if (alert.tipo_alerta === 'VIGILANCIA') {
            borderStyle = 'border-amber-500/40 hover:border-amber-400/70';
            bgStyle = 'bg-gradient-to-b from-[#1f190e]/90 to-[#0c1825]/90';
            glowStyle = 'shadow-[0_0_20px_rgba(255,180,74,0.15)]';
            icon = <AlertTriangle className="w-4 h-4 text-[#ffb44a]" />;
            badgeBg = 'bg-[#ffb44a]/20 text-[#ffb44a] border-[#ffb44a]/40';
            barBg = 'bg-gradient-to-r from-cyan-400 via-amber-400 to-amber-500';
          }

          return (
            <div
              key={alert.id}
              onClick={() => onSelectAlert(alert)}
              className={`group relative rounded-2xl p-4 transition-all duration-300 cursor-pointer border backdrop-blur-xl ${bgStyle} ${borderStyle} ${
                isSelected ? `${glowStyle} ring-2 ring-cyan-400/50 scale-[1.01]` : 'hover:scale-[1.008]'
              }`}
            >
              {/* Top Row: Zona & Estado */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900/90 text-cyan-300 border border-slate-700">
                    {alert.zona_id === 'north' ? 'SECTOR NORTE (ID:1)' : 'SECTOR SUR (ID:2)'}
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${badgeBg}`}>
                    {alert.tipo_alerta}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>
                    {new Date(alert.fecha_evento).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Título y Cuenca */}
              <div className="mb-3">
                <h3 className="text-sm font-bold text-white group-hover:text-cyan-200 transition-colors flex items-center gap-1.5">
                  {icon}
                  <span>{alert.titulo_alerta}</span>
                </h3>
                <div className="flex items-center gap-1 text-xs text-cyan-300/80 font-mono mt-1">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">{alert.cuenca_sector}</span>
                </div>
              </div>

              {/* Descripción de telemetría */}
              <p className="text-xs text-slate-300 leading-relaxed mb-3 line-clamp-2">
                {alert.descripcion}
              </p>

              {/* Métricas Hidrológicas & Comparación P99 */}
              <div className="rounded-xl bg-[#06121e]/80 border border-slate-700/60 p-3 mb-3.5">
                <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Waves className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Lluvia Registrada</span>
                  </div>
                  <div className="font-bold text-white text-sm tabular-nums">
                    {currentRain} <span className="text-[10px] text-slate-400 font-normal">mm</span>
                  </div>
                </div>

                {/* Barra de progreso frente a Umbral P99 */}
                <div className="space-y-1">
                  <div className="w-full h-2 rounded-full bg-slate-800/90 overflow-hidden relative border border-slate-700/50">
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ${barBg}`}
                      style={{ width: `${Math.min(p99Ratio, 100)}%` }}
                    />
                    {/* Marcador Percentil 90 */}
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400/80 z-10" 
                      style={{ left: `${Math.min(Math.round((p90 / p99) * 100), 95)}%` }}
                      title={`P90: ${p90} mm`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
                    <span>
                      P90: <strong className="text-amber-400">{p90} mm</strong>
                    </span>
                    <span className="text-slate-500">·</span>
                    <span>
                      P99: <strong className="text-rose-400">{p99} mm</strong>
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className={p99Ratio >= 100 ? 'text-rose-400 font-bold' : 'text-cyan-300'}>
                      {p99Ratio}% de P99
                    </span>
                  </div>
                </div>
              </div>

              {/* Prioridad Operativa */}
              <div className="text-[11px] font-mono text-slate-300 mb-3.5 flex items-start gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span className="line-clamp-1">{alert.estado_prioridad}</span>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenProtocol(alert);
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95 ${
                    alert.revisado
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/25 hover:bg-rose-500/35 text-rose-200 border border-rose-500/50 shadow-[0_0_15px_rgba(252,98,110,0.2)]'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{alert.revisado ? 'Ver Protocolo Atendido' : 'Protocolo de Emergencia'}</span>
                </button>

                <div 
                  className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-cyan-300 transition-colors"
                  title="Enfocar en mapa"
                >
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* Tarjeta Informativa del Pipeline IDEAM */}
      <div className="glass-panel rounded-2xl p-3.5 border-cyan-500/20 text-xs text-slate-400 font-mono flex items-start gap-2.5">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="text-cyan-300 font-semibold">Capa Oro Spark:</span> Las alertas se evalúan dinámicamente frente a la distribución gamma de percentiles calculada sobre <span className="text-white font-bold">292M de lecturas</span> del IDEAM.
        </div>
      </div>
    </aside>
  );
}
