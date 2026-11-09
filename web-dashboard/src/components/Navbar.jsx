import { 
  Activity, 
  RotateCw, 
  AlertTriangle, 
  Database, 
  Layers, 
  Radio, 
  ShieldCheck 
} from 'lucide-react';

export default function Navbar({ 
  kpis, 
  onRefresh, 
  isRefreshing, 
  onResetAlerts,
  isLiveDb
}) {
  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-cyan-500/20 px-4 lg:px-6 py-3">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
        
        {/* Zona 1: Logo & Identidad Institucional */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(75,241,229,0.3)]">
              <Activity className="w-5 h-5 text-cyan-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base lg:text-lg font-bold tracking-tight text-white whitespace-nowrap">
                  Centro de Mando Hidroclimático
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
                  SANTANDER
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono tracking-wide">
                IDEAM Big Data Pipeline · Apache Spark & Kafka
              </p>
            </div>
          </div>

          {/* Estado de streaming para móviles */}
          <div className="lg:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-[11px] font-mono text-cyan-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
            </span>
            <span>LIVE</span>
          </div>
        </div>

        {/* Zona 2: Telemetría en Vivo & KPIs de Misión Crítica */}
        <div className="flex items-center flex-wrap gap-3 sm:gap-6 text-xs w-full lg:w-auto justify-center">
          
          {/* Badge Realtime WebSocket & Kafka */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#071624] border border-cyan-500/30 shadow-inner">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="font-mono text-cyan-300 tracking-wider text-[11px] font-semibold whitespace-nowrap">
              {isLiveDb ? 'SUPABASE REALTIME • KAFKA STREAM ACTIVE' : 'LOCAL CONTINGENCY • KAFKA STREAM READY'}
            </span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
            </span>
          </div>

          {/* KPI 1: Estaciones Modeladas (Capa Oro) */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#081b2c]/80 border border-slate-700/60">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <div className="text-left">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Estaciones Oro</div>
              <div className="text-sm font-bold font-mono text-cyan-300 tabular-nums">
                {kpis.totalStations} <span className="text-[10px] text-slate-400 font-normal">/ 292M reg</span>
              </div>
            </div>
          </div>

          {/* KPI 2: Umbral Máximo P99 */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#081b2c]/80 border border-slate-700/60">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <div className="text-left">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Umbral Máx P99</div>
              <div className="text-sm font-bold font-mono text-amber-300 tabular-nums">
                {kpis.maxP99} <span className="text-[10px] text-slate-400 font-normal">mm</span>
              </div>
            </div>
          </div>

          {/* KPI 3: Alertas Críticas */}
          <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${
            kpis.criticalAlerts > 0 
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-300 shadow-[0_0_15px_rgba(252,98,110,0.2)]' 
              : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
          }`}>
            {kpis.criticalAlerts > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <div className="text-left">
              <div className="text-[10px] font-mono uppercase">Alertas Críticas</div>
              <div className="text-sm font-bold font-mono tabular-nums">
                {kpis.criticalAlerts} <span className="text-[10px] opacity-80 font-normal">{kpis.criticalAlerts === 1 ? 'activa' : 'activas'}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Zona 3: Acciones Operativas */}
        <div className="flex items-center gap-2.5 w-full lg:w-auto justify-end">
          <button
            onClick={onResetAlerts}
            title="Reiniciar alertas a valores iniciales"
            className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/50 text-slate-300 hover:text-white text-xs font-mono transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95"
          >
            <span>Reset Alertas</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-300 hover:text-cyan-200 text-xs font-mono font-semibold transition-all flex items-center gap-2 shadow-[0_0_12px_rgba(75,241,229,0.2)] active:scale-95 disabled:opacity-50 whitespace-nowrap"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Sincronizando...' : 'Recargar Datos'}</span>
          </button>
        </div>

      </div>
    </header>
  );
}
