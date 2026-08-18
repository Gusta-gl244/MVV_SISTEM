const A = 6378137.0;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const E2 = 2 * F - F * F;
const E = Math.sqrt(E2);
const E_P2 = E2 / (1 - E2);
const E4 = E2 * E2;
const E6 = E4 * E2;

// Coordenadas de campo em UTM 24S / SIRGAS2000. Os parâmetros de elipsoide
// (A, F) abaixo já são os do WGS84, que coincidem com o GRS80 do SIRGAS2000
// na precisão usada aqui — só a zona precisava ser corrigida.
const UTM_ZONE_24_S = 24;
const UTM_HEM_SOUTH = true;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function utmCentralMeridian(zone: number): number {
  return (zone - 1) * 6 - 180 + 3;
}

export function utmToLatLng(
  easting: number,
  northing: number,
  zone: number = UTM_ZONE_24_S,
  southernHemisphere: boolean = UTM_HEM_SOUTH
): { lat: number; lng: number } {
  const x = easting - 500000.0;
  const y = southernHemisphere ? northing - 10000000.0 : northing;
  const m = y / K0;

  const mu =
    m / (A * (1 - E2 / 4 - (3 * E4) / 64 - (5 * E6) / 256));

  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const j1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
  const j2 = (21 * Math.pow(e1, 2)) / 16 - (55 * Math.pow(e1, 4)) / 32;
  const j3 = (151 * Math.pow(e1, 3)) / 96;
  const j4 = (1097 * Math.pow(e1, 4)) / 512;

  const fp =
    mu +
    j1 * Math.sin(2 * mu) +
    j2 * Math.sin(4 * mu) +
    j3 * Math.sin(6 * mu) +
    j4 * Math.sin(8 * mu);

  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);

  const c1 = E_P2 * cosFp * cosFp;
  const t1 = tanFp * tanFp;
  const n1 = A / Math.sqrt(1 - E2 * sinFp * sinFp);
  const r1 = (A * (1 - E2)) / Math.pow(1 - E2 * sinFp * sinFp, 1.5);
  const d = x / (n1 * K0);

  const q1 = n1 * tanFp / r1;
  const q2 = (d * d) / 2;
  const q3 =
    (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * E_P2) * Math.pow(d, 4) / 24;
  const q4 =
    (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * E_P2 - 3 * c1 * c1) *
    Math.pow(d, 6) / 720;

  const lat =
    fp -
    q1 * (q2 - q3 + q4);

  const q5 = d;
  const q6 = (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6;
  const q7 =
    (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * E_P2 + 24 * t1 * t1) *
    Math.pow(d, 5) / 120;

  const lon =
    toRad(utmCentralMeridian(zone)) +
    (q5 - q6 + q7) / cosFp;

  return {
    lat: toDeg(lat),
    lng: toDeg(lon),
  };
}

export function latLngToUtm(
  lat: number,
  lng: number,
  zone: number = UTM_ZONE_24_S,
  southernHemisphere: boolean = UTM_HEM_SOUTH
): { x: number; y: number; zone: number; hemisphere: 'N' | 'S' } {
  const latRad = toRad(lat);
  const lngRad = toRad(lng);
  const lonOriginRad = toRad(utmCentralMeridian(zone));

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);

  const n = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const t = tanLat * tanLat;
  const c = E_P2 * cosLat * cosLat;
  const a = cosLat * (lngRad - lonOriginRad);

  const m =
    A *
    ((1 - E2 / 4 - (3 * E4) / 64 - (5 * E6) / 256) * latRad -
      ((3 * E2) / 8 + (3 * E4) / 32 + (45 * E6) / 1024) * Math.sin(2 * latRad) +
      ((15 * E4) / 256 + (45 * E6) / 1024) * Math.sin(4 * latRad) -
      ((35 * E6) / 3072) * Math.sin(6 * latRad));

  const x =
    K0 *
      n *
      (a +
        ((1 - t + c) * Math.pow(a, 3)) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * E_P2) * Math.pow(a, 5)) / 120) +
    500000.0;

  let y =
    K0 *
      (m +
        n * tanLat *
          ((Math.pow(a, 2) / 2) +
            ((5 - t + 9 * c + 4 * c * c) * Math.pow(a, 4)) / 24 +
            ((61 - 58 * t + t * t + 600 * c - 330 * E_P2) * Math.pow(a, 6)) / 720));

  if (southernHemisphere) {
    y += 10000000.0;
  }

  return {
    x,
    y,
    zone,
    hemisphere: southernHemisphere ? 'S' : 'N',
  };
}

export function isUtmCoord(x: number, y: number): boolean {
  return x >= 100000 && x <= 900000 && y >= 0 && y <= 10000000;
}

export function getUtmZone(): number {
  return UTM_ZONE_24_S;
}

export function isSouthernHemisphere(): boolean {
  return UTM_HEM_SOUTH;
}
