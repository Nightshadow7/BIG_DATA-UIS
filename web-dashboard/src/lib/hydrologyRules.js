export function evaluateAlertStatus(precip, p90, p99) {
  if (precip >= p99) {
    return {
      type: 'ALERTA CRÍTICA',
      color: 'red',
      priority: 'Nivel 1 - Desbordamiento Inminente',
      hex: '#fc626e',
      exceededRatio: Number(((precip / p99) * 100).toFixed(1)),
    };
  }
  if (precip >= p90) {
    return {
      type: 'VIGILANCIA',
      color: 'orange',
      priority: 'Nivel 2 - Superación Percentil 90',
      hex: '#ffb44a',
      exceededRatio: Number(((precip / p90) * 100).toFixed(1)),
    };
  }
  return {
    type: 'ESCENARIO REVISADO',
    color: 'reviewed',
    priority: 'Nivel 3 - Régimen Hidrológico Normal',
    hex: '#41c59b',
    exceededRatio: Number(((precip / p90) * 100).toFixed(1)),
  };
}

export function calculateP99Ratio(precip, p99) {
  if (!p99 || p99 <= 0) return 0;
  return Number(((precip / p99) * 100).toFixed(1));
}

export function formatPrecipitation(mm) {
  return `${Number(mm || 0).toFixed(1)} mm`;
}

export function filterGoldStations(stations, searchQuery, zoneFilter) {
  const query = (searchQuery || '').trim().toLowerCase();
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

export function calculateKpis(stations, alerts) {
  const totalStations = stations.length;
  const maxP99 = stations.reduce((max, s) => Math.max(max, s.umbral_alerta_roja || 0), 0);
  const criticalAlerts = alerts.filter((a) => a.color_alerta === 'red' && !a.revisado).length;
  const surveillanceAlerts = alerts.filter((a) => a.color_alerta === 'orange' && !a.revisado).length;
  const reviewedAlerts = alerts.filter((a) => a.revisado).length;

  return {
    totalStations,
    maxP99: Number(maxP99.toFixed(1)),
    criticalAlerts,
    surveillanceAlerts,
    reviewedAlerts,
  };
}
