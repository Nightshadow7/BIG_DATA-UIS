import { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Radio, 
  Database, 
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  MapPin
} from 'lucide-react';
import { filterGoldStations } from '../lib/hydrologyRules';

export default function GoldLayerTable({ 
  stations, 
  onSelectStation, 
  onSimulatePeak,
  selectedStation,
  isCatalogExpanded = false,
  onToggleCatalog
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState('all');
  const [sortField, setSortField] = useState('umbral_alerta_roja');
  const [sortAsc, setSortAsc] = useState(false);

  const activeStation = selectedStation || stations[0];

  // Lista única de Zonas Hidrográficas disponibles
  const hydroZones = useMemo(() => {
    const zones = new Set(stations.map(s => s.zonahidrografica));
    return ['all', ...Array.from(zones)];
  }, [stations]);

  // Filtrado de estaciones mediante pure function
  const filteredStations = useMemo(() => {
    const list = filterGoldStations(stations, searchQuery, selectedZone);
    return list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [stations, searchQuery, selectedZone, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <section id="nivel-2-respaldo" className="glass-panel rounded-3xl p-4 lg:p-6 border-cyan-500/20 shadow-2xl flex flex-col gap-5">
      
      {/* Encabezado Nivel 2: Contexto e Información Histórica Después */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
            NIVEL 2 · CONTEXTO E INFORMACIÓN HISTÓRICA DE RESPALDO (2000–2026)
          </div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white tracking-wide">
              Ficha Técnica de Estación y Parámetros Entrenados en Apache Spark
            </h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
              CRUCE IDEAM s54a-sgyg + CATÁLOGO hp9r-jxuu
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono flex items-center gap-2 flex-wrap">
            <span>Modelo Persistido:</span>
            <code className="text-cyan-300 bg-[#051320] px-2 py-0.5 rounded border border-cyan-500/20">
              s3://oro/umbrales_estaciones_oro.parquet
            </code>
            <span className="text-slate-500">·</span>
            <span>Ventanas deslizantes de 3h, API 24h y transiciones Markovianas</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleCatalog}
          className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold flex items-center gap-2 transition-all active:scale-95"
        >
          <span>{isCatalogExpanded ? 'Ocultar Catálogo Completo (26)' : 'Desplegar Catálogo Completo (26 Estaciones)'}</span>
          {isCatalogExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Ficha de Respaldo de la Estación Seleccionada en el Pronóstico */}
      {activeStation && (
        <div className="rounded-2xl p-4 bg-[#05121f]/90 border border-cyan-500/30 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-white">{activeStation.nombreestacion}</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                  COD: {activeStation.codigoestacion}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                Municipio: <strong className="text-slate-200">{activeStation.municipio}</strong> · Cuenca: <strong className="text-cyan-300">{activeStation.zonahidrografica}</strong> · Altitud: <strong className="text-slate-200">{activeStation.altitud_msnm ?? 950} msnm</strong>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`https://www.windy.com/${activeStation.latitud}/${activeStation.longitud}?rain,${activeStation.latitud},${activeStation.longitud},11`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-cyan-300 text-xs font-mono"
              >
                Radar Satelital Windy ({activeStation.latitud.toFixed(3)}°N, {activeStation.longitud.toFixed(3)}°W)
              </a>
              <button
                type="button"
                onClick={() => onSimulatePeak(activeStation.codigoestacion, true)}
                className="px-3 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/45 border border-rose-500/50 text-rose-200 text-xs font-mono font-semibold flex items-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5 text-rose-300 animate-pulse" />
                <span>Recalcular T+3h</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono text-xs">
            <div className="p-2.5 rounded-xl bg-[#071829] border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Umbral 3h P90 (Vigilancia)</span>
              <span className="text-sm font-bold text-amber-300">{activeStation.umbral_3h_p90 ?? activeStation.umbral_alerta_naranja} mm</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#071829] border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Umbral 3h P99 (Crítico)</span>
              <span className="text-sm font-bold text-rose-300">{activeStation.umbral_3h_p99 ?? activeStation.umbral_alerta_roja} mm</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#071829] border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Saturación Antecedente (API 24h)</span>
              <span className="text-sm font-bold text-cyan-300">{activeStation.api_critico_24h_mm ?? 4.2} mm</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#071829] border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Coef. Escorrentía (Spark)</span>
              <span className="text-sm font-bold text-white">{activeStation.coef_escorrentia ?? 0.72}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#071829] border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Transición Markov P(Exceso|Sat)</span>
              <span className="text-sm font-bold text-emerald-300">{Math.round((activeStation.prob_transicion_exceso ?? 0.42) * 100)}%</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#071829] border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Lecturas Procesadas Spark</span>
              <span className="text-sm font-bold text-slate-200">{activeStation.total_lecturas.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Catálogo Completo Desplegable bajo demanda */}
      {isCatalogExpanded && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar estación o municipio..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#061421]/90 border border-slate-700/80 text-white placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-cyan-400/60"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="py-1.5 px-3 rounded-xl bg-[#061421]/90 border border-slate-700/80 text-cyan-300 text-xs font-mono focus:outline-none focus:border-cyan-400/60"
              >
                <option value="all">Todas las Cuencas ({stations.length})</option>
                {hydroZones.filter(z => z !== 'all').map(zone => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#040e18]/60">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="bg-[#071929]/90 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider select-none">
                  <th className="py-3 px-4">
                    <button 
                      onClick={() => handleSort('nombreestacion')}
                      className="flex items-center gap-1 hover:text-white"
                    >
                      <span>Estación IDEAM</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">Municipio / Cuenca</th>
                  <th className="py-3 px-3">Geodesia (Lat/Lon/Alt)</th>
                  <th className="py-3 px-3 text-right">Coef. Esc / Markov</th>
                  <th className="py-3 px-3 text-right">API 24h / Evac.</th>
                  <th className="py-3 px-3 text-right">
                    <button 
                      onClick={() => handleSort('umbral_alerta_naranja')}
                      className="flex items-center gap-1 ml-auto text-amber-400 hover:text-amber-300"
                    >
                      <span>Umbral 3h P90</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-3 text-right">
                    <button 
                      onClick={() => handleSort('umbral_alerta_roja')}
                      className="flex items-center gap-1 ml-auto text-rose-400 hover:text-rose-300"
                    >
                      <span>Umbral 3h P99</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-center">Inferencia T+3h</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredStations.map((station) => {
                  const isSelected = activeStation?.codigoestacion === station.codigoestacion;

                  return (
                    <tr 
                      key={station.codigoestacion}
                      onClick={() => onSelectStation(station)}
                      className={`group transition-colors duration-150 cursor-pointer ${
                        isSelected ? 'bg-cyan-950/40 text-cyan-200' : 'hover:bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white group-hover:text-cyan-300 transition-colors flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          <span>{station.nombreestacion}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 pl-3.5">
                          COD: {station.codigoestacion} · {station.total_lecturas.toLocaleString()} reg
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-white font-medium">{station.municipio}</div>
                        <div className="text-[11px] text-cyan-400/80">{station.zonahidrografica}</div>
                      </td>

                      <td className="py-3 px-3 text-slate-400 text-[11px] tabular-nums">
                        <a
                          href={`https://www.windy.com/${station.latitud}/${station.longitud}?rain,${station.latitud},${station.longitud},11`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-cyan-300 hover:underline block"
                        >
                          {station.latitud.toFixed(3)}°N, {station.longitud.toFixed(3)}°W
                        </a>
                        <span className="text-[10px] text-slate-500">{station.altitud_msnm ?? 950} msnm</span>
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums">
                        <div className="text-white font-medium">C = {station.coef_escorrentia ?? 0.72}</div>
                        <div className="text-[10px] text-emerald-400">
                          P(Exceso) = {Math.round((station.prob_transicion_exceso ?? 0.42) * 100)}%
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right tabular-nums">
                        <div className="text-cyan-300">{station.api_critico_24h_mm ?? 4.2} mm</div>
                        <div className="text-[10px] text-slate-400">Evac: {station.ventana_evacuacion_min ?? 150} min</div>
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-amber-300 tabular-nums">
                        <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30">
                          {station.umbral_3h_p90 ?? station.umbral_alerta_naranja} mm
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-rose-300 tabular-nums">
                        <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/30">
                          {station.umbral_3h_p99 ?? station.umbral_alerta_roja} mm
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSimulatePeak(station.codigoestacion, true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-rose-600/25 to-amber-600/25 hover:from-rose-600/40 hover:to-amber-600/40 border border-rose-500/40 text-rose-200 hover:text-white text-[11px] font-mono font-semibold transition-all shadow-sm active:scale-95 whitespace-nowrap"
                        >
                          <Radio className="w-3 h-3 text-rose-400 animate-pulse" />
                          <span>Proyectar T+3h</span>
                        </button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

    </section>
  );
}
