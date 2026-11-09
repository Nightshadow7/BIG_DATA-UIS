export function evaluateAlertStatus(precip3h, p90_3h, p99_3h) {
  const safeP90 = Number(p90_3h || 1.0);
  const safeP99 = Number(p99_3h || 5.0);
  const val3h = Number(precip3h || 0);

  // Consistencia dimensional estricta: la lluvia efectiva a 3h se contrasta contra los umbrales de 3h (P90 y P99)
  if (val3h >= safeP99) {
    return {
      type: 'ALERTA CRÍTICA',
      color: 'red',
      priority: 'Nivel 1 - Desbordamiento Inminente',
      hex: '#fc626e',
      exceededRatio: Number(((val3h / safeP99) * 100).toFixed(1)),
    };
  }
  if (val3h >= safeP90) {
    return {
      type: 'VIGILANCIA',
      color: 'orange',
      priority: 'Nivel 2 - Superación Percentil 90 (3h)',
      hex: '#ffb44a',
      exceededRatio: Number(((val3h / safeP90) * 100).toFixed(1)),
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

export function classifyTrend6h(vol3h, vol6h) {
  const v3 = Number(vol3h || 0);
  const v6 = Number(vol6h ?? v3);
  const delta3a6 = Math.max(0, v6 - v3);
  if (delta3a6 > v3 * 0.45 && v6 > v3 + 0.8) {
    return 'ESCALAMIENTO SOSTENIDO (T+6h)';
  }
  if (delta3a6 > v3 * 0.15) {
    return 'PERSISTENCIA MODERADA (T+6h)';
  }
  return 'DESACELERACIÓN POST-PICO (T+6h)';
}

export function calculateP99Ratio(precip, p99) {
  if (!p99 || p99 <= 0) return 0;
  return Number(((precip / p99) * 100).toFixed(1));
}

export function formatPrecipitation(mm) {
  return `${Number(mm || 0).toFixed(1)} mm`;
}

export function computeSeasonalWeight(monthOneBased, bimodalFactor = 1.25) {
  const m = Number(monthOneBased || new Date().getUTCMonth() + 1);
  if ([4, 5, 10, 11].includes(m)) {
    return Number(Math.min(1.45, Math.max(1.05, Number(bimodalFactor || 1.25) * 0.85)).toFixed(4));
  }
  if ([1, 2, 7, 8].includes(m)) {
    return 0.78;
  }
  return 1.0;
}

export function computePredictiveVectorFromForecast(station, forecast, options = {}) {
  const stressTest = Boolean(options.stressTest);
  const codStr = String(station.codigoestacion || '24025501');
  const p90 = Number(station.umbral_3h_p90 ?? station.umbral_alerta_naranja ?? 10.0);
  const p99 = Number(station.umbral_3h_p99 ?? station.umbral_alerta_roja ?? 35.0);
  const apiCrit24h = Number(station.api_critico_24h_mm ?? Math.max(1.0, p90 * 0.6));
  const coefEsc = Number(station.coef_escorrentia ?? 0.65);
  const probMarkov = Number(station.prob_transicion_exceso ?? 0.35);
  const ventanaEvacMin = Number(station.ventana_evacuacion_min ?? 150);
  const bimodalFactor = Number(station.factor_estacional_bimodal ?? 1.25);
  const seasonalWeight = computeSeasonalWeight(options.month, bimodalFactor);

  let lluviaActualMm = Number(forecast?.lluviaActualMm ?? 0.0);
  let lluviaAnt6hMm = Number(forecast?.lluviaAntecedente6hMm ?? lluviaActualMm);
  let pron1h = Number(forecast?.pronostico1hMm ?? 0.0);
  let pron3h = Number(forecast?.pronostico3hMm ?? 0.0);
  let pron6h = Number(forecast?.pronostico6hMm ?? 0.0);
  let probSat = Number(forecast?.probabilidadPct ?? 25);
  let satSueloPct = Number(forecast?.saturacionSueloPct ?? 46.0);

  // Formulación determinista de Stress-Test idéntica a compute_spark_predictive_vector en kafka_producer.py
  if (stressTest) {
    const esCriticaStress = Number(codStr) % 2 === 0;
    lluviaActualMm = 0.0;
    if (esCriticaStress) {
      pron3h = Number((p99 * 0.96).toFixed(2));
      pron1h = Number((pron3h * 0.36).toFixed(2));
      pron6h = Number((p99 * 1.28).toFixed(2));
      probSat = 92;
      satSueloPct = 74.5;
      lluviaAnt6hMm = Number(Math.max(1.2, p99 * 0.16).toFixed(2));
    } else {
      pron3h = Number(((p90 + (p99 - p90) * 0.38) * 0.88).toFixed(2));
      pron1h = Number((pron3h * 0.35).toFixed(2));
      pron6h = Number(((p90 + (p99 - p90) * 0.68) * 0.95).toFixed(2));
      probSat = 78;
      satSueloPct = 62.5;
      lluviaAnt6hMm = Number(Math.max(0.8, p90 * 0.14).toFixed(2));
    }
  }

  // 1. Grado de saturación previa del suelo (alphaSat) y lámina antecedente equivalente a 3h
  const factorHumedad = Math.max(0.0, (satSueloPct - 25.0) / 100.0);
  const ratioAnt = Math.min(1.0, lluviaAnt6hMm / Math.max(apiCrit24h, 1.0));
  const alphaSat = Math.min(
    0.65,
    Number((coefEsc * factorHumedad * seasonalWeight * 0.45 + coefEsc * ratioAnt * 0.15).toFixed(4))
  );
  const saturacionAntecedenteMm = Number((lluviaAnt6hMm * 0.35 * coefEsc).toFixed(2));

  // 2. Lluvia efectiva proyectada a T+1h, T+3h y T+6h (amplificación proporcional por escorrentía y saturación)
  const volumen1hMm = Number((pron1h * (1.0 + alphaSat) + saturacionAntecedenteMm * 0.33).toFixed(2));
  const volumen3hMm = Number((pron3h * (1.0 + alphaSat) + saturacionAntecedenteMm).toFixed(2));
  const volumen6hMm = Number((pron6h * (1.0 + alphaSat) + saturacionAntecedenteMm).toFixed(2));

  // 3. Tendencia a T+6h y probabilidad posterior de desbordamiento
  const tendencia6h = classifyTrend6h(volumen3hMm, volumen6hMm);
  const ratioCargaP99 = Math.min(1.35, volumen3hMm / Math.max(p99, 0.2));
  const probDesbordamientoPct = Math.round(
    Math.min(99, Math.max(5, probMarkov * 100 * 0.35 + ratioCargaP99 * 100 * 0.45 + probSat * 0.2))
  );

  // 4. Evaluación dimensionalmente consistente: lluvia efectiva a 3h vs umbrales 3h de la Capa Oro
  const status = evaluateAlertStatus(volumen3hMm, p90, p99);
  const estadoT0 = lluviaActualMm < 0.5 ? 'Sin lluvia' : 'En curso';
  const etiquetaImpacto =
    status.color === 'red'
      ? 'Desbordamiento Inminente'
      : status.color === 'orange'
        ? 'Vigilancia Activa'
        : 'Capacidad Normal de Cuenca';

  return {
    lluviaActualMm,
    saturacionAntecedenteMm,
    pronostico1hMm: volumen1hMm,
    pronostico3hMm: volumen3hMm,
    pronostico6hMm: volumen6hMm,
    p90,
    p99,
    tendencia6h,
    probabilidadLluviaPct: probSat,
    probabilidadDesbordamientoPct: probDesbordamientoPct,
    probabilidadDesbordePct: probDesbordamientoPct,
    saturacionSueloPct: satSueloPct,
    ventanaEvacuacionMin: ventanaEvacMin,
    factorEstacionalBimodal: bimodalFactor,
    coefEscorrentia: coefEsc,
    status,
    modoOperacion: stressTest ? 'STRESS_TEST_DETERMINISTA' : 'REAL_OPEN_METEO_SPARK',
    contrastBanner: `Lluvia actual (T0): ${lluviaActualMm.toFixed(1)} mm (${estadoT0}) -> Pronóstico T+1h: ${volumen1hMm.toFixed(2)} mm | T+3h: ${volumen3hMm.toFixed(2)} mm | T+6h: ${volumen6hMm.toFixed(2)} mm (Probabilidad ${probDesbordamientoPct}% - ${etiquetaImpacto})`,
  };
}

export function extractAlertMetrics(alert, station) {
  const desc = String(alert?.descripcion || '');
  const title = String(alert?.titulo_alerta || '');
  const p90 = Number(station?.umbral_3h_p90 ?? station?.umbral_alerta_naranja ?? 15.0);
  const p99 = Number(station?.umbral_3h_p99 ?? station?.umbral_alerta_roja ?? 40.0);

  let vol3h =
    alert?.pronostico_3h_mm ??
    alert?.volumen_proyectado_3h_mm ??
    alert?.precipitacion_registrada;
  if (vol3h === undefined || vol3h === null) {
    const m3 = desc.match(/T\+3h[=:]\s*([\d.]+)\s*mm/i);
    vol3h = m3 ? Number(m3[1]) : 0;
  } else {
    vol3h = Number(vol3h);
  }

  let vol1h = alert?.pronostico_1h_mm;
  if (vol1h === undefined || vol1h === null) {
    const m1 = desc.match(/T\+1h[=:]\s*([\d.]+)\s*mm/i);
    vol1h = m1 ? Number(m1[1]) : Number((vol3h * 0.36).toFixed(2));
  } else {
    vol1h = Number(vol1h);
  }

  let vol6h = alert?.pronostico_6h_mm ?? alert?.volumen_proyectado_6h_mm;
  if (vol6h === undefined || vol6h === null) {
    const m6 = desc.match(/T\+6h[=:]\s*([\d.]+)\s*mm/i);
    vol6h = m6 ? Number(m6[1]) : Number((vol3h * 1.28).toFixed(2));
  } else {
    vol6h = Number(vol6h);
  }

  let lluviaActualMm = alert?.lluvia_actual_mm;
  if (lluviaActualMm === undefined || lluviaActualMm === null) {
    const m0 = desc.match(/Lluvia actual(?:\s*\(T0\))?:\s*([\d.]+)\s*mm/i);
    lluviaActualMm = m0 ? Number(m0[1]) : 0.0;
  } else {
    lluviaActualMm = Number(lluviaActualMm);
  }

  let probDesbordePct = Number(alert?.probabilidad_desbordamiento_pct || 0);
  if (!probDesbordePct) {
    const matchProb =
      desc.match(/Probabilidad\s*(\d+)\s*%/i) ||
      title.match(/(\d+)\s*%\s*prob/i) ||
      title.match(/(\d+)\s*%/);
    probDesbordePct = matchProb
      ? Number(matchProb[1])
      : Math.min(98, Math.max(15, Math.round((vol3h / Math.max(p99, 0.5)) * 78)));
  }

  let saturacionSueloPct = Number(alert?.saturacion_suelo_pct || 0);
  if (!saturacionSueloPct) {
    const matchSoil = desc.match(/suelo:\s*([\d.]+)%/i);
    saturacionSueloPct = matchSoil ? Number(matchSoil[1]) : alert?.color_alerta === 'red' ? 74.0 : 62.0;
  }

  let ventanaEvacMin = Number(alert?.ventana_evacuacion_min || 0);
  if (!ventanaEvacMin) {
    const matchEvac =
      desc.match(/Ventana(?:\s*evacuación)?:\s*(\d+)\s*min/i) ||
      String(alert?.estado_prioridad || '').match(/Ventana\s*(\d+)\s*min/i);
    ventanaEvacMin = matchEvac ? Number(matchEvac[1]) : Number(station?.ventana_evacuacion_min ?? 165);
  }

  const matchTend = desc.match(/Tendencia:\s*([^|.]+)/i);
  const tendencia6h = alert?.tendencia_6h || (matchTend ? matchTend[1].trim() : classifyTrend6h(vol3h, vol6h));

  const status = evaluateAlertStatus(vol3h, p90, p99);
  const ratioP99 = calculateP99Ratio(vol3h, p99);
  const estadoT0 = lluviaActualMm < 0.5 ? 'Sin lluvia' : 'En curso';
  const etiquetaImpacto =
    alert?.revisado
      ? 'Protocolo Ejecutado'
      : status.color === 'red' || alert?.color_alerta === 'red'
        ? 'Desbordamiento Inminente'
        : 'Vigilancia Activa';

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
    tendencia6h,
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
