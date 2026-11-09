import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Radio, 
  MapPin, 
  Database, 
  ArrowUpDown, 
  ChevronRight, 
  ExternalLink,
  Layers,
  Sparkles
} from 'lucide-react';
import { filterGoldStations } from '../lib/hydrologyRules';

export default function GoldLayerTable({ 
  stations, 
  onSelectStation, 
  onSimulatePeak,
  selectedStation 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState('all');
  const [sortField, setSortField] = useState('umbral_alerta_roja');
  const [sortAsc, setSortAsc] = useState(false);

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
    <section className="glass-panel rounded-3xl p-4 lg:p-6 border-cyan-500/20 shadow-2xl flex flex-col gap-4">
      
      {/* Encabezado del explorador de Capa Oro Parquet */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white tracking-wide">
              Explorador de Capa Oro (IDEAM Spark Engine)
            </h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
              26 ESTACIONES MODELADAS
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
            <span>Parquet Source:</span>
            <code className="text-cyan-300 bg-[#051320] px-2 py-0.5 rounded border border-cyan-500/20">
              s3://oro/umbrales_estaciones_oro.parquet
            </code>
            <span className="text-slate-500">·</span>
            <span>292M de registros procesados</span>
          </p>
        </div>

        {/* Buscador y Filtro por Cuenca */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Input de búsqueda */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar estación o municipio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#061421]/90 border border-slate-700/80 text-white placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30 transition-all"
            />
          </div>

          {/* Selector de Cuenca */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="py-1.5 px-3 rounded-xl bg-[#061421]/90 border border-slate-700/80 text-cyan-300 text-xs font-mono focus:outline-none focus:border-cyan-400/60 transition-all"
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
      </div>

      {/* Tabla con scroll horizontal optimizado */}
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
              <th className="py-3 px-3">GPS (Lat/Lon)</th>
              <th className="py-3 px-3 text-right">
                <button 
                  onClick={() => handleSort('total_lecturas')}
                  className="flex items-center gap-1 ml-auto hover:text-white"
                >
                  <span>Lecturas Spark</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-3 px-3 text-right">Media Hist.</th>
              <th className="py-3 px-3 text-right">Máx Hist.</th>
              <th className="py-3 px-3 text-right">
                <button 
                  onClick={() => handleSort('umbral_alerta_naranja')}
                  className="flex items-center gap-1 ml-auto text-amber-400 hover:text-amber-300"
                >
                  <span>P90 (Vigilancia)</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-3 px-3 text-right">
                <button 
                  onClick={() => handleSort('umbral_alerta_roja')}
                  className="flex items-center gap-1 ml-auto text-rose-400 hover:text-rose-300"
                >
                  <span>P99 (Crítico)</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="py-3 px-4 text-center">Inyección Kafka</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filteredStations.map((station) => {
              const isSelected = selectedStation?.codigoestacion === station.codigoestacion;

              return (
                <tr 
                  key={station.codigoestacion}
                  onClick={() => onSelectStation(station)}
                  className={`group transition-colors duration-150 cursor-pointer ${
                    isSelected ? 'bg-cyan-950/40 text-cyan-200' : 'hover:bg-slate-800/40 text-slate-300'
                  }`}
                >
                  {/* Estación y Código */}
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white group-hover:text-cyan-300 transition-colors flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <span>{station.nombreestacion}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 pl-3.5">
                      COD: {station.codigoestacion}
                    </div>
                  </td>

                  {/* Municipio y Cuenca */}
                  <td className="py-3 px-4">
                    <div className="text-white font-medium">{station.municipio}</div>
                    <div className="text-[11px] text-cyan-400/80">{station.zonahidrografica}</div>
                  </td>

                  {/* GPS */}
                  <td className="py-3 px-3 text-slate-400 text-[11px] tabular-nums">
                    {station.latitud.toFixed(3)}°N <br />
                    {station.longitud.toFixed(3)}°W
                  </td>

                  {/* Total Lecturas Spark */}
                  <td className="py-3 px-3 text-right font-medium text-slate-200 tabular-nums">
                    {station.total_lecturas.toLocaleString()}
                  </td>

                  {/* Media Histórica */}
                  <td className="py-3 px-3 text-right text-slate-400 tabular-nums">
                    {station.precipitacion_media} mm
                  </td>

                  {/* Máx Histórica */}
                  <td className="py-3 px-3 text-right text-slate-300 tabular-nums">
                    {station.precipitacion_maxima} mm
                  </td>

                  {/* Umbral Naranja P90 */}
                  <td className="py-3 px-3 text-right font-bold text-amber-300 tabular-nums">
                    <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30">
                      {station.umbral_alerta_naranja} mm
                    </span>
                  </td>

                  {/* Umbral Rojo P99 */}
                  <td className="py-3 px-3 text-right font-bold text-rose-300 tabular-nums">
                    <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/30">
                      {station.umbral_alerta_roja} mm
                    </span>
                  </td>

                  {/* Botón Simular Pico Kafka */}
                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSimulatePeak(station.codigoestacion, true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-rose-600/25 to-amber-600/25 hover:from-rose-600/40 hover:to-amber-600/40 border border-rose-500/40 text-rose-200 hover:text-white text-[11px] font-mono font-semibold transition-all shadow-sm active:scale-95 whitespace-nowrap"
                      title="Genera un evento en Apache Kafka superando el umbral P99 de esta estación"
                    >
                      <Radio className="w-3 h-3 text-rose-400 animate-pulse" />
                      <span>Simular Pico Kafka</span>
                    </button>
                  </td>

                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredStations.length === 0 && (
          <div className="py-12 text-center text-slate-400 font-mono text-xs">
            No se encontraron estaciones para el criterio de búsqueda "{searchQuery}".
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
        <span>Mostrando {filteredStations.length} de {stations.length} estaciones</span>
        <span className="text-cyan-400">Spark Batch Window: 2000-2026 · Modelo Gamma Ajustado</span>
      </div>

    </section>
  );
}
