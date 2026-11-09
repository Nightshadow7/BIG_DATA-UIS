export function evaluateAlertStatus(precip, p90, p99, precip6h = null) {
  const safeP90 = Number(p90 || 1.0);
  const safeP99 = Number(p99 || 5.0);
  const val3h = Number(precip || 0);
  const val6h = precip6h !== null ? Number(precip6h) : val3h;
  const effectiveLoad = Math.max(val3h, Number((val6h * 0.9).toFixed(2)));

  if (val3h >= safeP99 || effectiveLoad >= safeP99) {
    return {
      type: 'ALERTA CRÍTICA',
      color: 'red',
      priority: 'Nivel 1 - Desbordamiento Inminente',
      hex: '#fc626e',
      exceededRatio: Number(((Math.max(val3h, effectiveLoad) / safeP99) * 100).toFixed(1)),
    };
  }
  if (val3h >= safeP90 || val6h >= safeP90) {
    return {
      type: 'VIGILANCIA',
      color: 'orange',
      priority: 'Nivel 2 - Superación Percentil 90',
      hex: '#ffb44a',
      exceededRatio: Number(((Math.max(val3h, val6h) / safeP90) * 100).toFixed(1)),
    };
  }
  return {
    type: 'ESCENARIO REVISADO',
    color: 'reviewed',
    priority: 'Nivel 3 - Régimen Hidrológico Normal',
    hex: '#41c59b',
    exceededRatio: Number(((val3h / safeP90) * 100).toFixed(1)),
  };
}

export function calculateP99Ratio(precip, p99) {
  if (!p99 || p99 <= 0) return 0;
  return Number(((precip / p99) * 100).toFixed(1));
}

export function formatPrecipitation(mm) {
  return `${Number(mm || 0).toFixed(1)} mm`;
}

export function computeSeasonalWeight(monthOneBased, bimodalFactor = 1.25) {
  const m = Number(monthOneBased || new Date().getMonth() + 1);
  if ([4, 5, 10, 11].includes(m)) {
    return Number(Math.min(1.45, Math.max(1.05, Number(bimodalFactor || 1.25) * 0.85)).toFixed(2));
  }
  if ([1, 2, 7, 8].includes(m)) {
    return 0.78;
  }
  return 1.0;
}

export function computePredictiveVectorFromForecast(station, forecast, options = {}) {
  const stressTest = Boolean(options.stressTest);
  const p90 = Number(station.umbral_3h_p90 ?? station.umbral_alerta_naranja ?? 10.0);
  const p99 = Number(station.umbral_3h_p99 ?? station.umbral_alerta_roja ?? 35.0);
  const apiCrit24h = Number(station.api_critico_24h_mm ?? Math.max(1.0, p90 * 0.6));
  const coefEsc = Number(station.coef_escorrentia ?? 0.65);
  const probMarkov = Number(station.prob_transicion_exceso ?? 0.25);
  const ventanaEvacMin = Number(station.ventana_evacuacion_min ?? 160);
  const bimodalFactor = Number(station.factor_estacional_bimodal ?? 1.25);
  const seasonalWeight = computeSeasonalWeight(options.month, bimodalFactor);

  const lluviaActualMm = Number(forecast?.lluviaActualMm ?? 0.0);
  const lluviaAnt6hMm = Number(forecast?.lluviaAntecedente6hMm ?? lluviaActualMm);
  let pron1h = Number(forecast?.pronostico1hMm ?? 0.0);
  let pron3h = Number(forecast?.pronostico3hMm ?? 0.0);
  let pron6h = Number(forecast?.pronostico6hMm ?? 0.0);
  let probSat = Number(forecast?.probabilidadPct ?? 25);
  let satSueloPct = Number(forecast?.saturacionSueloPct ?? 46.0);

  if (stressTest) {
    pron3h = Number((p99 * 1.09).toFixed(2));
    pron1h = Number((pron3h * 0.36).toFixed(2));
    pron6h = Number((p99 * 1.36).toFixed(2));
    probSat = Math.max(probSat, 93);
    satSueloPct = Math.max(satSueloPct, 74.5);
  }

  const factorHumedad = Math.max(0.0, (satSueloPct - 25.0) / 100.0);
  const saturacionAntecedenteMm = Number(
    (lluviaAnt6hMm * coefEsc + apiCrit24h * factorHumedad * coefEsc * 0.45 * seasonalWeight).toFixed(2)
  );

  const volumen1hMm = Number((saturacionAntecedenteMm * 0.5 + pron1h).toFixed(2));
  const volumen3hMm = Number((saturacionAntecedenteMm + pron3h).toFixed(2));
  const volumen6hMm = Number((saturacionAntecedenteMm + pron6h).toFixed(2));

  const ratioCargaP99 = Math.min(1.35, volumen3hMm / Math.max(p99, 0.2));
  const probDesbordamientoPct = Math.round(
    Math.min(99, Math.max(5, probMarkov * 100 * 0.35 + ratioCargaP99 * 100 * 0.45 + probSat * 0.2))
  );

  const status = evaluateAlertStatus(volumen3hMm, p90, p99, volumen6hMm);
  const estadoT0 = lluviaActualMm < 0.5 ? 'Sin lluvia' : 'Lluvia débil';
  const etiquetaImpacto =
    status.color === 'red'
      ? 'Desbordamiento Inminente'
      : status.color === 'orange'
        ? 'Vigilancia por Saturación'
        : 'Capacidad Normal de Cuenca';

  return {
    lluviaActualMm,
    saturacionAntecedenteMm,
    pronostico1hMm: volumen1hMm,
    pronostico3hMm: volumen3hMm,
    pronostico6hMm: volumen6hMm,
    probabilidadLluviaPct: probSat,
    probabilidadDesbordamientoPct: probDesbordamientoPct,
    saturacionSueloPct: satSueloPct,
    ventanaEvacuacionMin: ventanaEvacMin,
    factorEstacionalBimodal: bimodalFactor,
    coefEscorrentia: coefEsc,
    status,
    modoOperacion: stressTest ? 'STRESS_TEST_DETERMINISTA' : 'REAL_OPEN_METEO_SPARK',
    contrastBanner: `Lluvia actual (T0): ${lluviaActualMm.toFixed(1)} mm (${estadoT0}) -> Pronóstico en 3 horas: ${volumen3hMm.toFixed(1)} mm (Probabilidad ${probDesbordamientoPct}% - ${etiquetaImpacto})`,
  };
}

export function extractAlertMetrics(alert, station) {
  const p90 = Number(station?.umbral_3h_p90 ?? station?.umbral_alerta_naranja ?? 15.0);
  const p99 = Number(station?.umbral_3h_p99 ?? station?.umbral_alerta_roja ?? 40.0);
  const vol3h = Number(alert?.pronostico_3h_mm ?? alert?.volumen_proyectado_3h_mm ?? alert?.precipitacion_registrada ?? 0);
  const vol1h = Number(alert?.pronostico_1h_mm ?? (vol3h * 0.36).toFixed(1));
  const vol6h = Number(alert?.pronostico_6h_mm ?? alert?.volumen_proyectado_6h_mm ?? (vol3h * 1.28).toFixed(1));
  const lluviaActualMm = Number(alert?.lluvia_actual_mm ?? 0.0);

  let probDesbordePct = Number(alert?.probabilidad_desbordamiento_pct || 0);
  if (!probDesbordePct) {
    const matchProb = String(alert?.titulo_alerta || alert?.descripcion || '').match(/(\d+)\s*%/);
    probDesbordePct = matchProb
      ? Number(matchProb[1])
      : Math.min(98, Math.max(15, Math.round((vol3h / Math.max(p99, 0.5)) * 78)));
  }

  let saturacionSueloPct = Number(alert?.saturacion_suelo_pct || 0);
  if (!saturacionSueloPct) {
    const matchSoil = String(alert?.descripcion || '').match(/suelo:\s*([\d.]+)%/i);
    saturacionSueloPct = matchSoil ? Number(matchSoil[1]) : alert?.color_alerta === 'red' ? 74.5 : 61.5;
  }

  const ventanaEvacMin = Number(alert?.ventana_evacuacion_min ?? station?.ventana_evacuacion_min ?? 165);
  const status = evaluateAlertStatus(vol3h, p90, p99, vol6h);
  const ratioP99 = calculateP99Ratio(vol3h, p99);
  const estadoT0 = lluviaActualMm < 0.5 ? 'Sin lluvia' : 'En curso';
  const etiquetaImpacto =
    alert?.revisado
      ? 'Protocolo Ejecutado'
      : status.color === 'red' || alert?.color_alerta === 'red'
        ? 'Desbordamiento Inminente'
        : 'Vigilancia Hidrológica';

  return {
    lluviaActualMm,
    vol1h,
    vol3h,
    vol6h,
    p90,
    p99,
    probDesbordePct,
    saturacionSueloPct,
    ventanaEvacMin,
    ratioP99,
    status,
    estadoT0,
    etiquetaImpacto,
    contrastText: `Lluvia actual: ${lluviaActualMm.toFixed(1)} mm (${estadoT0}) -> Pronóstico en 3 horas: ${vol3h.toFixed(1)} mm (Probabilidad ${probDesbordePct}% - ${etiquetaImpacto})`,
  };
}

export function filterGoldStations(stations, searchQuery, zoneFilter) {
  const query = (searchQuery || '').trim().toLowerCase();
  return stations.filter((station) => {
    const matchesZone = !zoneFilter || zoneFilter === 'all' || station.zonahidrografica === zoneFilter;
    if (!matchesZone) return false;
    if (!query) return true;
    return (
      String(station.nombreestacion || '').toLowerCase().includes(query) ||
      String(station.codigoestacion || '').toLowerCase().includes(query) ||
      String(station.municipio || '').toLowerCase().includes(query) ||
      String(station.zonahidrografica || '').toLowerCase().includes(query)
    );
  });
}

export function calculateKpis(stations, alerts) {
  const totalStations = stations.length;
  const maxP99 = stations.reduce((max, s) => Math.max(max, s.umbral_3h_p99 || s.umbral_alerta_roja || 0), 0);
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
