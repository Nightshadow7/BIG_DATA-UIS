export interface StationData {
  codigoestacion: string;
  nombreestacion: string;
  departamento: string;
  municipio: string;
  zonahidrografica: string;
  latitud: number;
  longitud: number;
  total_lecturas: number;
  precipitacion_media: number;
  precipitacion_maxima: number;
  umbral_alerta_naranja: number; // Percentil 90
  umbral_alerta_roja: number;    // Percentil 99
}

export interface ActiveAlert {
  id: number;
  zona_id: 'north' | 'south';
  codigoestacion: string;
  titulo_alerta: string;
  tipo_alerta: 'ALERTA CRÍTICA' | 'VIGILANCIA' | 'ESCENARIO REVISADO';
  color_alerta: 'red' | 'orange' | 'reviewed';
  cuenca_sector: string;
  descripcion: string;
  estado_prioridad: string;
  precipitacion_registrada: number;
  revisado: boolean;
  fecha_evento: string;
}

export function evaluateAlertStatus(precip: number, p90: number, p99: number) {
  if (precip >= p99) {
    return {
      type: 'ALERTA CRÍTICA' as const,
      color: 'red' as const,
      priority: 'Nivel 1 - Desbordamiento Inminente',
      hex: '#fc626e',
      exceededRatio: Number(((precip / p99) * 100).toFixed(1)),
    };
  }
  if (precip >= p90) {
    return {
      type: 'VIGILANCIA' as const,
      color: 'orange' as const,
      priority: 'Nivel 2 - Superación Percentil 90',
      hex: '#ffb44a',
      exceededRatio: Number(((precip / p90) * 100).toFixed(1)),
    };
  }
  return {
    type: 'ESCENARIO REVISADO' as const,
    color: 'reviewed' as const,
    priority: 'Nivel 3 - Régimen Hidrológico Normal',
    hex: '#41c59b',
    exceededRatio: Number(((precip / p90) * 100).toFixed(1)),
  };
}

export function calculateP99Ratio(precip: number, p99: number): number {
  if (!p99 || p99 <= 0) return 0;
  return Number(((precip / p99) * 100).toFixed(1));
}

export function formatPrecipitation(mm: number): string {
  return `${Number(mm || 0).toFixed(1)} mm`;
}

export function filterGoldStations(
  stations: StationData[],
  searchQuery: string,
  zoneFilter: string
): StationData[] {
  const query = searchQuery.trim().toLowerCase();
  return stations.filter((station) => {
    const matchesZone = !zoneFilter || zoneFilter === 'all' || station.zonahidrografica === zoneFilter;
    if (!matchesZone) return false;
    if (!query) return true;
    return (
      station.nombreestacion.toLowerCase().includes(query) ||
      station.codigoestacion.toLowerCase().includes(query) ||
      station.municipio.toLowerCase().includes(query) ||
      station.zonahidrografica.toLowerCase().includes(query)
    );
  });
}

export function calculateKpis(stations: StationData[], alerts: ActiveAlert[]) {
  const totalStations = stations.length;
  const maxP99 = stations.reduce((max, s) => Math.max(max, s.umbral_alerta_roja || 0), 0);
  const criticalAlerts = alerts.filter(a => a.color_alerta === 'red' && !a.revisado).length;
  const surveillanceAlerts = alerts.filter(a => a.color_alerta === 'orange' && !a.revisado).length;
  const reviewedAlerts = alerts.filter(a => a.revisado).length;

  return {
    totalStations,
    maxP99: Number(maxP99.toFixed(1)),
    criticalAlerts,
    surveillanceAlerts,
    reviewedAlerts,
  };
}
