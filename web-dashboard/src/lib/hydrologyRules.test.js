import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAlertStatus,
  calculateP99Ratio,
  formatPrecipitation,
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
      zona_id: 'north',
      codigoestacion: '1',
      titulo_alerta: 'Alerta Norte',
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
      zona_id: 'south',
      codigoestacion: '2',
      titulo_alerta: 'Alerta Sur',
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
