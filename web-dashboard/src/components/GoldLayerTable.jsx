import React, { useState } from 'react';
import { Search, Zap, Database } from 'lucide-react';

export default function GoldLayerTable({ stations, onTriggerSimulation, onSelectStation }) {
  const [search, setSearch] = useState('');
  const [simulatingCode, setSimulatingCode] = useState(null);

  const filtered = stations.filter(
    (s) =>
      s.nombreestacion?.toLowerCase().includes(search.toLowerCase()) ||
      s.municipio?.toLowerCase().includes(search.toLowerCase()) ||
      String(s.codigoestacion).includes(search)
  );

  const handleSimulate = async (station, level) => {
    setSimulatingCode(station.codigoestacion);
    await onTriggerSimulation(station, level);
    setSimulatingCode(null);
  };

  return (
    <section className="mt-6 p-5 rounded-2xl border border-cyan-500/25 bg-[#081a28]/90 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <h3 className="text-base font-black text-white">
              Capa Oro (Apache Spark): Umbrales Históricos P90 y P99 por Estación
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Fuente: <code className="text-cyan-300">s3://oro/umbrales_estaciones_oro.parquet</code> sincronizado en Supabase ({stations.length} estaciones en Santander)
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filtrar por municipio o estación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>

      <div className="overflow-x-auto max-h-80">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 bg-[#0c2133] text-slate-300 uppercase text-[11px] border-b border-cyan-500/20">
            <tr>
              <th className="py-2.5 px-3">Código</th>
              <th className="py-2.5 px-3">Estación IDEAM</th>
              <th className="py-2.5 px-3">Municipio / Cuenca</th>
              <th className="py-2.5 px-3 text-right">Lecturas (&ge;2000)</th>
              <th className="py-2.5 px-3 text-right">Máx Histórico</th>
              <th className="py-2.5 px-3 text-right">Umbral P90 (Naranja)</th>
              <th className="py-2.5 px-3 text-right">Umbral P99 (Roja)</th>
              <th className="py-2.5 px-3 text-right">Simulador en Vivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filtered.map((st) => (
              <tr
                key={st.codigoestacion}
                onClick={() => onSelectStation(st)}
                className="hover:bg-cyan-500/5 transition cursor-pointer"
              >
                <td className="py-2.5 px-3 font-mono font-bold text-cyan-300">{st.codigoestacion}</td>
                <td className="py-2.5 px-3 font-semibold text-white">{st.nombreestacion}</td>
                <td className="py-2.5 px-3 text-slate-300">
                  {st.municipio} <span className="text-slate-500">({st.zonahidrografica})</span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                  {Number(st.total_lecturas).toLocaleString()}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                  {st.precipitacion_maxima} mm
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-300">
                  {st.umbral_alerta_naranja} mm
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-400">
                  {st.umbral_alerta_roja} mm
                </td>
                <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex gap-1.5">
                    <button
                      type="button"
                      disabled={simulatingCode === st.codigoestacion}
                      onClick={() => handleSimulate(st, 'ROJA')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-500/40 font-bold text-[11px] transition cursor-pointer"
                    >
                      <Zap className="w-3 h-3" />
                      P99 Crítica
                    </button>
                    <button
                      type="button"
                      disabled={simulatingCode === st.codigoestacion}
                      onClick={() => handleSimulate(st, 'NARANJA')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/40 font-bold text-[11px] transition cursor-pointer"
                    >
                      P90 Vigilancia
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}