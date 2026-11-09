import React from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, MapPin, FileText } from 'lucide-react';

export default function AlertsSidebar({ alerts, selectedZone, onSelectZone, onOpenProtocol }) {
  return (
    <aside className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-white tracking-wide">Alertas en Tiempo Real</h2>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-cyan-500/20">
          Topic: telemetria-precipitacion
        </span>
      </div>

      {alerts.map((alert) => {
        const isSelected = selectedZone === alert.zona_id;
        const isRed = alert.color_alerta === 'red' && !alert.revisado;
        const isReviewed = Boolean(alert.revisado);

        let cardStyles = 'border-amber-500/40 bg-gradient-to-br from-amber-950/40 to-slate-900/90';
        let badgeColor = 'text-amber-300';
        let Icon = AlertTriangle;

        if (isReviewed) {
          cardStyles = 'border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-slate-900/90';
          badgeColor = 'text-emerald-300';
          Icon = CheckCircle2;
        } else if (isRed) {
          cardStyles = 'border-rose-500/50 bg-gradient-to-br from-rose-950/50 to-slate-900/90';
          badgeColor = 'text-rose-300';
          Icon = ShieldAlert;
        }

        return (
          <div
            key={alert.id}
            onClick={() => onSelectZone(alert.zona_id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelectZone(alert.zona_id)}
            className={`group text-left p-5 rounded-2xl border transition-all duration-200 cursor-pointer ${cardStyles} ${
              isSelected ? 'ring-2 ring-cyan-400 shadow-[0_0_25px_rgba(75,241,229,0.2)] -translate-y-0.5' : 'hover:-translate-y-0.5 opacity-90 hover:opacity-100'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className={`flex items-center gap-2 text-xs font-black tracking-widest uppercase ${badgeColor}`}>
                <Icon className="w-4 h-4" />
                {isReviewed ? 'ESCENARIO REVISADO' : alert.tipo_alerta}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/40 text-white border border-white/10">
                {alert.precipitacion_registrada} mm
              </span>
            </div>

            <h3 className="text-xl font-black text-white leading-snug mb-1.5">
              {alert.titulo_alerta}
            </h3>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              {alert.descripcion}
            </p>

            <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs text-cyan-200">
              <span className="flex items-center gap-1.5 font-medium truncate">
                <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                {alert.cuenca_sector}
              </span>
              <span className="text-[11px] text-cyan-300 font-bold group-hover:underline shrink-0 ml-2">
                Ver en mapa →
              </span>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onOpenProtocol}
        className="mt-1 flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-xl font-black text-sm bg-teal-900/60 hover:bg-teal-800/80 text-teal-100 border border-teal-400/40 shadow-lg transition cursor-pointer"
      >
        <FileText className="w-4 h-4 text-teal-300" />
        Consultar Protocolo de Respuesta
      </button>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Las alertas se actualizan automáticamente vía WebSockets cuando el consumidor de <strong>Apache Kafka</strong> detecta lecturas que superan los percentiles P90 o P99 de la Capa Oro.
      </p>
    </aside>
  );
}