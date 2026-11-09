import React, { useEffect } from 'react';
import { 
  X, 
  ShieldAlert, 
  CheckCircle2, 
  Radio, 
  Volume2, 
  Users, 
  Building2, 
  Clock, 
  MapPin, 
  AlertTriangle 
} from 'lucide-react';

export default function ProtocolModal({ 
  alert, 
  onClose, 
  onConfirmReview, 
  isSubmitting 
}) {
  // Manejo de tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!alert) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="protocol-modal-title"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-2xl glass-panel rounded-3xl p-6 sm:p-8 border border-cyan-500/30 shadow-2xl overflow-hidden flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Glow de acento superior */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-400 to-cyan-400" />

        {/* Encabezado del Modal */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-3 rounded-2xl border ${
              alert.revisado 
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
            }`}>
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300">
                  {alert.zona_id === 'north' ? 'ZONA NORTE (ID: 1)' : 'ZONA SUR (ID: 2)'}
                </span>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded border font-semibold ${
                  alert.revisado 
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40' 
                    : 'bg-rose-950 text-rose-300 border-rose-500/40'
                }`}>
                  {alert.tipo_alerta}
                </span>
              </div>
              <h3 id="protocol-modal-title" className="text-lg font-bold text-white tracking-wide">
                Protocolo Operativo de Respuesta Inmediata
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Unidad de Gestión del Riesgo · CDGRD Santander
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Cerrar modal de protocolo"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contexto del Evento de Alerta */}
        <div className="rounded-2xl bg-[#061423]/90 border border-slate-700/80 p-4 font-mono text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-400" />
              <strong className="text-white">{alert.titulo_alerta}</strong>
            </div>
            <span className="text-cyan-300 font-bold text-sm">
              {alert.precipitacion_registrada} mm
            </span>
          </div>
          <div className="text-slate-400 text-[11px]">
            {alert.cuenca_sector} · Estación IDEAM: {alert.codigoestacion}
          </div>
          <p className="text-slate-300 font-sans text-xs pt-1 border-t border-slate-800/80 leading-relaxed">
            {alert.descripcion}
          </p>
        </div>

        {/* Los 3 Pasos Operativos de la Gestión del Riesgo */}
        <div className="space-y-3">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <span>Pasos Operativos Mandatorios</span>
            <span className="text-slate-500">· 3 Fases</span>
          </h4>

          {/* Paso 1 */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-[#091d30]/70 border border-cyan-500/20">
            <div className="w-7 h-7 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 flex items-center justify-center font-mono font-bold text-xs shrink-0 mt-0.5">
              1
            </div>
            <div className="space-y-1">
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Activación SAT y Sirenas Comunitarias</span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                Difusión de alarma temprana por la red de sirenas locales y radiodifusión VHF. Enlace prioritario con Cuerpos de Bomberos, Defensa Civil Seccional Santander y Cruz Roja.
              </p>
            </div>
          </div>

          {/* Paso 2 */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-[#091d30]/70 border border-cyan-500/20">
            <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center font-mono font-bold text-xs shrink-0 mt-0.5">
              2
            </div>
            <div className="space-y-1">
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>Evacuación Preventiva a Puntos de Encuentro (PMR)</span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                Despliegue de cuadrillas hacia zonas ribereñas vulnerables. Cierre preventivo de vados y pasos viales críticos. Adecuación de albergues temporales en polideportivos municipales.
              </p>
            </div>
          </div>

          {/* Paso 3 */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-[#091d30]/70 border border-cyan-500/20">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center font-mono font-bold text-xs shrink-0 mt-0.5">
              3
            </div>
            <div className="space-y-1">
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Enlace con Sala de Crisis Departamental (CDGRD)</span>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                Reporte de telemetría continua al puesto de mando unificado (PMU). Monitoreo de onda de crecida aguas abajo hacia el embalse de Hidrosogamoso y el Río Magdalena.
              </p>
            </div>
          </div>
        </div>

        {/* Footer con Acciones */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="text-[11px] font-mono text-slate-400">
            {alert.revisado ? (
              <span className="text-emerald-400 flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Protocolo completado y confirmado en Supabase
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Respuesta operativa pendiente de confirmación oficial
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-mono text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cerrar
            </button>

            {!alert.revisado ? (
              <button
                type="button"
                onClick={() => onConfirmReview(alert.id)}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition-all shadow-[0_0_20px_rgba(65,197,155,0.35)] active:scale-95 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Actualizando...' : 'Confirmar y Marcar como Revisado'}</span>
              </button>
            ) : (
              <div className="px-4 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Revisión Registrada</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
