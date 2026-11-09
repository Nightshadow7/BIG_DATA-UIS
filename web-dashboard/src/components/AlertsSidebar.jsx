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
  Info,
  Droplets,
  Gauge
} from 'lucide-react';
import { extractAlertMetrics, formatPrecipitation } from '../lib/hydrologyRules';

export default function AlertsSidebar({ 
  alerts, 
  stations, 
  selectedAlertId, 
  onSelectAlert, 
  onOpenProtocol,
  onInspectLevel2
}) {
  return (
    <aside className="w-full flex flex-col gap-4">
      {/* Encabezado Nivel 1: Predicción Primero */}
      <div className="glass-panel rounded-2xl p-4 flex items-center justify-between border-cyan-500/20">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
            <ShieldAlert className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider">
              NIVEL 1 · PREDICCIÓN TEMPRANA (T+1H, T+3H, T+6H)
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              Alertas Multi-Cuenca antes de la Tormenta
            </h2>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-500/30">
            {alerts.length} ESTACIONES EN RIESGO
          </span>
        </div>
      </div>

      {/* Lista de Tarjetas de Pronóstico de Impacto Anticipado */}
      <div className="flex flex-col gap-3.5 overflow-y-auto max-h-[620px] pr-1">
        {alerts.map((alert) => {
          const station = stations.find(s => String(s.codigoestacion) === String(alert.codigoestacion));
          const metrics = extractAlertMetrics(alert, station);
          const p99Ratio = Math.min(Math.round(metrics.ratioP99), 180);
          const isSelected = selectedAlertId === alert.id;
          const muniLabel = alert.municipio || station?.municipio || alert.zona_id;

          let borderStyle = 'border-rose-500/40 hover:border-rose-400/70';
          let bgStyle = 'bg-gradient-to-b from-[#190d18]/90 to-[#0c1825]/90';
          let glowStyle = 'shadow-[0_0_20px_rgba(252,98,110,0.18)]';
          let icon = <AlertOctagon className="w-4 h-4 text-[#fc626e] animate-pulse" />;
          let badgeBg = 'bg-[#fc626e]/20 text-[#fc626e] border-[#fc626e]/40';
          let barBg = 'bg-gradient-to-r from-amber-400 via-rose-500 to-rose-600';

          if (alert.revisado || alert.color_alerta === 'reviewed') {
            borderStyle = 'border-emerald-500/40 hover:border-emerald-400/70';
            bgStyle = 'bg-gradient-to-b from-[#0b1d1d]/90 to-[#0a1622]/90';
            glowStyle = 'shadow-[0_0_20px_rgba(65,197,155,0.12)]';
            icon = <CheckCircle2 className="w-4 h-4 text-[#41c59b]" />;
            badgeBg = 'bg-[#41c59b]/20 text-[#41c59b] border-[#41c59b]/40';
            barBg = 'bg-emerald-500';
          } else if (alert.tipo_alerta === 'VIGILANCIA' || alert.color_alerta === 'orange') {
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
              {/* Top Row: Municipio/Estación Real & Estado */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900/90 text-cyan-300 border border-slate-700">
                    {muniLabel} · ID:{alert.codigoestacion}
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

              {/* Título Predictivo y Cuenca Real */}
              <div className="mb-2.5">
                <h3 className="text-sm font-bold text-white group-hover:text-cyan-200 transition-colors flex items-center gap-1.5">
                  {icon}
                  <span>{alert.titulo_alerta}</span>
                </h3>
                <div className="flex items-center gap-1 text-xs text-cyan-300/80 font-mono mt-1">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">{alert.cuenca_sector}</span>
                </div>
              </div>

              {/* Bloque Principal (Tipografía Grande): Impacto Proyectado a 3h y 6h + Etiqueta Secundaria T0 */}
              <div className="rounded-xl bg-[#040f1a]/95 border border-cyan-500/30 p-3 mb-3 font-mono">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <div>
                    <span className="text-[10px] text-cyan-300 uppercase block">
                      Impacto Proyectado 3h vs Umbral 3h-P99
                    </span>
                    <div className={`text-base font-extrabold tabular-nums leading-tight ${alert.color_alerta === 'red' ? 'text-rose-300' : 'text-amber-300'}`}>
                      {formatPrecipitation(metrics.vol3h)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        / {formatPrecipitation(metrics.p99)} ({metrics.etiquetaImpacto})
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[9px] text-slate-400 uppercase block">Tendencia 6h</span>
                    <span className="text-[10px] font-bold text-cyan-300">
                      {metrics.tendencia6h}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800/90 text-center">
                  <div className="rounded bg-[#071828] py-1 px-1.5 border border-slate-800">
                    <span className="block text-[9px] text-slate-400">Horizonte T+1h</span>
                    <strong className="text-slate-200">{formatPrecipitation(metrics.vol1h)}</strong>
                  </div>
                  <div className="rounded bg-[#071828] py-1 px-1.5 border border-cyan-500/30">
                    <span className="block text-[9px] text-cyan-300">Horizonte T+3h</span>
                    <strong className="text-white">{formatPrecipitation(metrics.vol3h)}</strong>
                  </div>
                  <div className="rounded bg-[#071828] py-1 px-1.5 border border-slate-800">
                    <span className="block text-[9px] text-slate-400">Horizonte T+6h</span>
                    <strong className="text-cyan-300">{formatPrecipitation(metrics.vol6h)}</strong>
                  </div>
                </div>

                {/* Etiqueta secundaria de referencia: Lluvia actual (T0) */}
                <div className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
                  <span>
                    Lluvia actual: <strong className="text-emerald-400">{formatPrecipitation(metrics.lluviaActualMm)} - {metrics.estadoT0}</strong>
                  </span>
                  <span className="text-slate-300">
                    3h-P90: <strong className="text-amber-300">{formatPrecipitation(metrics.p90)}</strong>
                  </span>
                </div>
              </div>

              {/* Cuadrícula de las 4 Métricas Predictivas Principales (Nivel 1) */}
              <div className="grid grid-cols-2 gap-2 mb-3 font-mono">
                <div className="p-2 rounded-xl bg-[#06121e]/90 border border-rose-500/30">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Gauge className="w-3 h-3 text-rose-400" />
                    <span>Prob. Desbordamiento</span>
                  </div>
                  <div className="text-sm font-bold text-rose-300 tabular-nums mt-0.5">
                    {metrics.probDesbordePct}%
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-[#06121e]/90 border border-cyan-500/30">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Waves className="w-3 h-3 text-cyan-400" />
                    <span>Acumulado 3h vs P99</span>
                  </div>
                  <div className="text-sm font-bold text-white tabular-nums mt-0.5">
                    {metrics.vol3h} / {metrics.p99} <span className="text-[10px] font-normal text-slate-400">mm</span>
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-[#06121e]/90 border border-amber-500/25">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Droplets className="w-3 h-3 text-amber-400" />
                    <span>Saturación Suelo (API)</span>
                  </div>
                  <div className="text-sm font-bold text-amber-300 tabular-nums mt-0.5">
                    {metrics.saturacionSueloPct}%
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-[#06121e]/90 border border-emerald-500/30">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3 text-emerald-400" />
                    <span>Ventana Evacuación</span>
                  </div>
                  <div className="text-sm font-bold text-emerald-300 tabular-nums mt-0.5">
                    {metrics.ventanaEvacMin} min
                  </div>
                </div>
              </div>

              {/* Comparación de Proyección T+3h contra Umbrales Acumulados de 3 Horas (10.800s Spark) */}
              <div className="rounded-xl bg-[#06121e]/80 border border-slate-700/60 p-2.5 mb-3">
                <div className="space-y-1">
                  <div className="w-full h-2 rounded-full bg-slate-800/90 overflow-hidden relative border border-slate-700/50">
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ${barBg}`}
                      style={{ width: `${Math.min(p99Ratio, 100)}%` }}
                    />
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400/80 z-10" 
                      style={{ left: `${Math.min(Math.round((metrics.p90 / metrics.p99) * 100), 95)}%` }}
                      title={`Umbral 3h P90: ${metrics.p90} mm`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
                    <span>
                      3h-P90: <strong className="text-amber-400">{metrics.p90} mm</strong>
                    </span>
                    <span className="text-slate-500">·</span>
                    <span>
                      3h-P99: <strong className="text-rose-400">{metrics.p99} mm</strong>
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className={p99Ratio >= 100 ? 'text-rose-400 font-bold' : 'text-cyan-300'}>
                      {p99Ratio}% de 3h-P99
                    </span>
                  </div>
                </div>
              </div>

              {/* Prioridad Operativa */}
              <div className="text-[11px] font-mono text-slate-300 mb-3 flex items-start gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span className="line-clamp-1">{alert.estado_prioridad}</span>
              </div>

              {/* Botones: Activar Protocolo (Nivel 1) e Inspeccionar Contexto Histórico (Nivel 2) */}
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
                  <span>{alert.revisado ? 'Protocolo Atendido' : 'Activar Protocolo'}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAlert(alert);
                    if (onInspectLevel2) onInspectLevel2(alert);
                  }}
                  className="px-2.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-cyan-300 text-[11px] font-mono flex items-center gap-1 transition-colors"
                  title="Ver respaldo histórico 2000-2026 de por qué el modelo predijo el riesgo en esta estación"
                >
                  <span>Por qué (Nivel 2)</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* Tarjeta Explicativa de la Jerarquía Predictiva */}
      <div className="glass-panel rounded-2xl p-3.5 border-cyan-500/20 text-xs text-slate-400 font-mono flex items-start gap-2.5">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="text-cyan-300 font-semibold">Predicción Primero:</span> Cada alerta se asocia a su coordenada y cuenca real sin sobrescribir otras estaciones. Selecciona una alerta para desplegar en el <span className="text-white font-bold">Nivel 2</span> el respaldo histórico y estacional de Spark.
        </div>
      </div>
    </aside>
  );
}
