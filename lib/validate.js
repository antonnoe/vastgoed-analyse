// Validatie van coördinaten: numeriek en binnen Frankrijk (metropool, Corsica, DOM).

const BOXES = [
  { naam: 'metropool', latMin: 41.0, latMax: 51.6, lonMin: -5.6, lonMax: 9.9 },
  { naam: 'Guadeloupe/Martinique', latMin: 14.2, latMax: 18.2, lonMin: -63.2, lonMax: -60.7 },
  { naam: 'Guyane', latMin: 2.0, latMax: 5.9, lonMin: -54.7, lonMax: -51.5 },
  { naam: 'Réunion', latMin: -21.5, latMax: -20.8, lonMin: 55.1, lonMax: 55.9 },
  { naam: 'Mayotte', latMin: -13.1, latMax: -12.5, lonMin: 44.9, lonMax: 45.4 },
];

function num(v) {
  if (v === null || v === undefined || String(v).trim() === '') return NaN;
  return Number(v);
}

// Geeft { lat, lon } of { error }.
export function parseCoords(searchParams) {
  const lat = num(searchParams.get('lat'));
  const lon = num(searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { error: 'lat en lon zijn verplicht en moeten numeriek zijn' };
  }
  if (!BOXES.some((b) => lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax)) {
    return { error: 'lat/lon liggen buiten Frankrijk' };
  }
  return { lat, lon };
}

export function validInsee(code) {
  return typeof code === 'string' && /^(\d{5}|2[AB]\d{3})$/i.test(code) ? code.toUpperCase() : null;
}

// Departementscode uit INSEE-gemeentecode.
export function deptFromInsee(code) {
  const c = validInsee(code);
  if (!c) return null;
  if (c.startsWith('2A') || c.startsWith('2B')) return c.slice(0, 2);
  if (c.startsWith('97')) return c.slice(0, 3);
  return c.slice(0, 2);
}

// Departementscode uit postcode (Corsica: 200-201xx = 2A, 202-206xx = 2B).
export function deptFromPostcode(pc) {
  if (typeof pc !== 'string' || !/^\d{5}$/.test(pc)) return null;
  if (pc.startsWith('97')) return pc.slice(0, 3);
  if (pc.startsWith('20')) return Number(pc) < 20200 ? '2A' : '2B';
  return pc.slice(0, 2);
}

export function validDept(d) {
  return typeof d === 'string' && /^(0[1-9]|[1-8]\d|9[0-5]|2[AB]|97[1-6])$/i.test(d) ? d.toUpperCase() : null;
}
