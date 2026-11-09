import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAlertStatus,
  calculateP99Ratio,
  formatPrecipitation,
  computePredictiveVectorFromForecast,
  extractAlertMetrics,
  filterGoldStations,
  calculateKpis,
} from './hydrologyRules.js';

test('evaluateAlertStatus classifies precipitation exceeding P99 as ALERTA CRÍTICA', () => {
  const result = evaluateAlertStatus(130, 70, 110);
  assert.equal(result.type, 'ALERTA CRÍTICA');
  assert.equal(result.color, 'red');
  assert.equal(result.hex, '#fc626e');
  assert.equal(result.exceededRatio, 118.2);
});

test('evaluateAlertStatus classifies precipitation between P90 and P99 as VIGILANCIA', () => {
  const result = evaluateAlertStatus(85, 70, 110);
  assert.equal(result.type, 'VIGILANCIA');
  assert.equal(result.color, 'orange');
  assert.equal(result.hex, '#ffb44a');
});

test('evaluateAlertStatus classifies normal precipitation as ESCENARIO REVISADO / normal', () => {
  const result = evaluateAlertStatus(35, 70, 110);
  assert.equal(result.type, 'ESCENARIO REVISADO');
  assert.equal(result.color, 'reviewed');
  assert.equal(result.hex, '#41c59b');
});

test('calculateP99Ratio accurately returns percentage against P99 threshold', () => {
  assert.equal(calculateP99Ratio(150, 100), 150);
  assert.equal(calculateP99Ratio(50, 100), 50);
  assert.equal(calculateP99Ratio(0, 100), 0);
  assert.equal(calculateP99Ratio(85.5, 90), 95.0);
});

test('formatPrecipitation formats with mm unit', () => {
  assert.equal(formatPrecipitation(42.34), '42.3 mm');
  assert.equal(formatPrecipitation(0), '0.0 mm');
});

test('computePredictiveVectorFromForecast uses deterministic real Open-Meteo data without arbitrary multiplication by default', () => {
  const station = {
    codigoestacion: '23190130',
    umbral_3h_p90: 10.4,
    umbral_3h_p99: 35.0,
    api_critico_24h_mm: 14.8,
    coef_escorrentia: 0.785,
    prob_transicion_exceso: 0.3402,
    ventana_evacuacion_min: 145,
    factor_estacional_bimodal: 1.35,
  };
  const forecast = {
    lluviaActualMm: 0.0,
    lluviaAntecedente6hMm: 0.0,
    pronostico1hMm: 2.1,
    pronostico3hMm: 6.9,
    pronostico6hMm: 12.0,
    probabilidadPct: 29,
    saturacionSueloPct: 50.6,
  };

  const vecReal = computePredictiveVectorFromForecast(station, forecast, { stressTest: false, month: 10 });
  assert.equal(vecReal.modoOperacion, 'REAL_OPEN_METEO_SPARK');
  assert.ok(vecReal.pronostico3hMm < station.umbral_3h_p99);
  assert.ok(vecReal.pronostico6hMm >= station.umbral_3h_p90);
  assert.equal(vecReal.status.type, 'VIGILANCIA');

  const vecStress = computePredictiveVectorFromForecast(station, forecast, { stressTest: true, month: 10 });
  assert.equal(vecStress.modoOperacion, 'STRESS_TEST_DETERMINISTA');
  assert.ok(vecStress.pronostico3hMm >= station.umbral_3h_p99);
  assert.equal(vecStress.status.type, 'ALERTA CRÍTICA');
});

test('extractAlertMetrics builds T0 -> T+3h contrast string', () => {
  const alert = {
    lluvia_actual_mm: 0.0,
    pronostico_1h_mm: 31.2,
    pronostico_3h_mm: 94.2,
    pronostico_6h_mm: 119.2,
    probabilidad_desbordamiento_pct: 77,
    saturacion_suelo_pct: 74.5,
    ventana_evacuacion_min: 206,
    color_alerta: 'red',
    revisado: false,
  };
  const station = { umbral_3h_p90: 37.4, umbral_3h_p99: 83.2 };
  const metrics = extractAlertMetrics(alert, station);
  assert.equal(metrics.vol1h, 31.2);
  assert.equal(metrics.vol3h, 94.2);
  assert.equal(metrics.probDesbordePct, 77);
  assert.ok(metrics.contrastText.includes('Lluvia actual: 0.0 mm'));
  assert.ok(metrics.contrastText.includes('Pronóstico en 3 horas: 94.2 mm'));
});

test('filterGoldStations filters by search text and hydrological zone', () => {
  const mockStations = [
    {
      codigoestacion: '24015010',
      nombreestacion: 'BUCARAMANGA AEROPUERTO',
      departamento: 'SANTANDER',
      municipio: 'BUCARAMANGA',
      zonahidrografica: 'Río Lebrija',
      latitud: 7.126,
      longitud: -73.184,
      total_lecturas: 124500,
      precipitacion_media: 3.2,
      precipitacion_maxima: 135.0,
      umbral_alerta_naranja: 62.0,
      umbral_alerta_roja: 98.0,
    },
    {
      codigoestacion: '24025020',
      nombreestacion: 'SAN GIL UNIVERSIDAD',
      departamento: 'SANTANDER',
      municipio: 'SAN GIL',
      zonahidrografica: 'Río Fonce',
      latitud: 6.554,
      longitud: -73.134,
      total_lecturas: 98000,
      precipitacion_media: 4.1,
      precipitacion_maxima: 148.0,
      umbral_alerta_naranja: 71.0,
      umbral_alerta_roja: 112.0,
    },
  ];

  const searchSanGil = filterGoldStations(mockStations, 'San Gil', 'all');
  assert.equal(searchSanGil.length, 1);
  assert.equal(searchSanGil[0].codigoestacion, '24025020');

  const filterZone = filterGoldStations(mockStations, '', 'Río Lebrija');
  assert.equal(filterZone.length, 1);
  assert.equal(filterZone[0].municipio, 'BUCARAMANGA');
});

test('calculateKpis computes total stations, maximum P99, and alert distributions', () => {
  const mockStations = [
    {
      codigoestacion: '1',
      nombreestacion: 'Estacion 1',
      departamento: 'SANTANDER',
      municipio: 'BUCARAMANGA',
      zonahidrografica: 'Río Lebrija',
      latitud: 7.1,
      longitud: -73.1,
      total_lecturas: 100000,
      precipitacion_media: 3.5,
      precipitacion_maxima: 150,
      umbral_alerta_naranja: 65,
      umbral_alerta_roja: 105.4,
    },
    {
      codigoestacion: '2',
      nombreestacion: 'Estacion 2',
      departamento: 'SANTANDER',
      municipio: 'BARRANCABERMEJA',
      zonahidrografica: 'Río Sogamoso',
      latitud: 7.0,
      longitud: -73.8,
      total_lecturas: 150000,
      precipitacion_media: 4.2,
      precipitacion_maxima: 190,
      umbral_alerta_naranja: 80,
      umbral_alerta_roja: 132.8,
    },
  ];

  const mockAlerts = [
    {
      id: 1,
      zona_id: 'MEDIO MAGDALENA | BUCARAMANGA',
      codigoestacion: '1',
      titulo_alerta: 'Alerta 1',
      tipo_alerta: 'ALERTA CRÍTICA',
      color_alerta: 'red',
      cuenca_sector: 'Cuenca Lebrija',
      descripcion: 'Lluvia extrema',
      estado_prioridad: 'Nivel 1',
      precipitacion_registrada: 120,
      revisado: false,
      fecha_evento: new Date().toISOString(),
    },
    {
      id: 2,
      zona_id: 'SOGAMOSO | SAN GIL',
      codigoestacion: '2',
      titulo_alerta: 'Alerta 2',
      tipo_alerta: 'ESCENARIO REVISADO',
      color_alerta: 'reviewed',
      cuenca_sector: 'Cuenca Fonce',
      descripcion: 'Atendida',
      estado_prioridad: 'Nivel 3',
      precipitacion_registrada: 40,
      revisado: true,
      fecha_evento: new Date().toISOString(),
    },
  ];

  const kpis = calculateKpis(mockStations, mockAlerts);
  assert.equal(kpis.totalStations, 2);
  assert.equal(kpis.maxP99, 132.8);
  assert.equal(kpis.criticalAlerts, 1);
  assert.equal(kpis.reviewedAlerts, 1);
  assert.equal(kpis.surveillanceAlerts, 0);
});
