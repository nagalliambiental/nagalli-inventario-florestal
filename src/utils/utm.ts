// Conversão de coordenadas geográficas (WGS84) para UTM.
export interface UtmCoord {
  zone: number;
  hemisphere: "N" | "S";
  easting: number;
  northing: number;
}

const A = 6378137.0; // semi-eixo maior do elipsoide WGS84
const F = 1 / 298.257223563; // achatamento WGS84
const K0 = 0.9996; // fator de escala no meridiano central

export function toUtm(latitude: number, longitude: number): UtmCoord | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -80 || latitude > 84) return null; // limite de validade do UTM

  const zone = Math.floor((longitude + 180) / 6) + 1;
  const lon0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;

  const lat = (latitude * Math.PI) / 180;
  const lon = (longitude * Math.PI) / 180;

  const e2 = 2 * F - F * F;
  const ePrimeSq = e2 / (1 - e2);

  const N = A / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const T = Math.tan(lat) ** 2;
  const C = ePrimeSq * Math.cos(lat) ** 2;
  const A_ = Math.cos(lat) * (lon - lon0);

  const M =
    A *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * lat -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) *
        Math.sin(2 * lat) +
      ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * lat));

  const easting =
    K0 *
      N *
      (A_ +
        ((1 - T + C) * A_ ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ePrimeSq) * A_ ** 5) / 120) +
    500000;

  let northing =
    K0 *
    (M +
      N *
        Math.tan(lat) *
        ((A_ * A_) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A_ ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ePrimeSq) * A_ ** 6) / 720));

  const hemisphere: "N" | "S" = latitude >= 0 ? "N" : "S";
  if (hemisphere === "S") northing += 10000000;

  return { zone, hemisphere, easting, northing };
}

/** Ex.: "22S 634512E 7265432N" */
export function formatUtm(latitude: number, longitude: number): string {
  const u = toUtm(latitude, longitude);
  if (!u) return "";
  return `${u.zone}${u.hemisphere} ${Math.round(u.easting)}E ${Math.round(u.northing)}N`;
}
