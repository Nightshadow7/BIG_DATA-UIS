import React from 'react';
import { CloudRain, Activity, Database, Radio, RefreshCw } from 'lucide-react';

export default function Navbar({ totalStations, activeAlertsCount, isRealtimeConnected, lastUpdate, onRefresh }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-6 border-b border-cyan-500/20">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 shadow-[0_0_20px_rgba(75,241,229,0.2)]">
          <CloudRain className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg md:text-xl font-black tracking-wider text-white uppercase">
            Monitoreo Hidroclimático • Santander
          </h1>
          <p className="text-xs text-slate-400">
            Unidad de Gestión del Riesgo | Pipeline Distribuido: MinIO (S3) • PySpark • Apache Kafka
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs">
          <Database className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Capa Oro:</span>
          <strong className="text-white">{totalStations} estaciones</strong>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs">
          <Activity className="w-3.5 h-3.5 text-rose-400" />
          <span className="text-slate-400">Escenarios:</span>
          <strong className="text-rose-300">{activeAlertsCount} activos</strong>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide bg-emerald-950/60 border border-emerald-400/40 text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRealtimeConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isRealtimeConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
          </span>
          <Radio className="w-3.5 h-3.5" />
          <span>{isRealtimeConnected ? 'SUPABASE REALTIME • EN VIVO' : 'SINCRONIZANDO...'}</span>
        </div>

        <button
          onClick={onRefresh}
          title={`Última sincronización: ${lastUpdate}`}
          className="p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700/80 border border-slate-600/50 text-slate-300 transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}