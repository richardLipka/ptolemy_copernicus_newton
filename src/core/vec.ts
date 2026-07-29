export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const ZERO: Vec3 = vec3(0, 0, 0);

export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);

export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);

export const scale = (a: Vec3, k: number): Vec3 => vec3(a.x * k, a.y * k, a.z * k);

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export const length = (a: Vec3): number => Math.sqrt(dot(a, a));

export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));

export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  return len === 0 ? ZERO : scale(a, 1 / len);
};

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Wrap an angle in degrees into [0, 360). */
export const normalizeDeg = (deg: number): number => {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
};

/** Signed difference a - b in degrees, wrapped into (-180, 180]. */
export const angleDiffDeg = (a: number, b: number): number => {
  const diff = normalizeDeg(a - b);
  return diff > 180 ? diff - 360 : diff;
};
