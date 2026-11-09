import React from 'react';
import { X, CheckCircle, ShieldAlert } from 'lucide-react';

export default function ProtocolModal({ isOpen, alert, onClose, onConfirmReview }) {
  if (!isOpen || !alert) return null;

  const steps = [
    'Verificar la telemetría de la estación IDEAM y validar la superación del percentil histórico (P90 / P99) calculado en la Capa Oro.',
    'Notificar a la Unidad Municipal de Gestión del Riesgo de Desastres (UMGRD) y alertar a los productores agropecuarios de la cuenca.',
    'Registrar la confirmación operativa en Supabase para actualizar el estado en todos los terminales conectados.',
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md grid place-items-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-[#0c2234] border border-cyan-400/40 p-6 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 pb-4 border-b border-cyan-500/20">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-teal-300">
              <ShieldAlert className="w-3.5 h-3.5" />
              Protocolo de Respuesta Hidroclimática
            </span>
            <h2 className="text-xl font-black text-white mt-1">{alert.cuenca_sector}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="my-5 p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/70 text-xs text-slate-300">
          <strong className="text-white block mb-1">{alert.titulo_alerta} ({alert.precipitacion_registrada} mm)</strong>
          {alert.descripcion}
        </div>

        <div className="space-y-3 mb-6">
          {steps.map((text, idx) => (
            <div key={idx} className="flex items-start gap-3 text-sm text-slate-200">
              <span className="font-mono font-black text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded">
                0{idx + 1}
              </span>
              <span className="leading-relaxed text-xs">{text}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onConfirmReview(alert.id)}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-lg transition cursor-pointer"
        >
          <CheckCircle className="w-4 h-4" />
          Marcar Escenario como Revisado en Supabase
        </button>
      </div>
    </div>
  );
}