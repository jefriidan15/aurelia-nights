// Aurelia Nights — deterministic RNG, math helpers, shared constants.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function rangeInt(rng, lo, hi) { return Math.floor(range(rng, lo, hi + 1)); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function fmtMoney(n) { return "$" + Math.floor(n).toLocaleString("en-US"); }

export const WORLD = 2600;            // world is WORLD x WORLD units
export const ROAD_STEP = 260;         // grid spacing
export const ROAD_W = 64;             // road width
export const DAY_MINUTES = 8 * 60;    // game starts at 08:00

export const CAR_TYPES = {
  sedan:   { name: "Meridian Sedan",  len: 46, wid: 22, accel: 240, top: 330, grip: 3.4, hp: 100 },
  taxi:    { name: "Harbor Taxi",     len: 46, wid: 22, accel: 230, top: 320, grip: 3.4, hp: 100 },
  truck:   { name: "Dock Hauler",     len: 62, wid: 26, accel: 150, top: 230, grip: 2.6, hp: 160 },
  sports:  { name: "Aurora GT",       len: 48, wid: 22, accel: 380, top: 470, grip: 4.6, hp: 90 },
  van:     { name: "Courier Van",     len: 54, wid: 24, accel: 190, top: 270, grip: 3.0, hp: 130 },
  police:  { name: "APD Interceptor", len: 48, wid: 22, accel: 330, top: 420, grip: 4.2, hp: 140 },
};

export const CAR_COLORS = ["#c0392b", "#2980b9", "#f39c12", "#27ae60", "#8e44ad", "#dfe6e9", "#2d3436", "#e17055", "#00cec9", "#fdcb6e"];
export const PED_COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6", "#e67e22", "#ecf0f1", "#1abc9c"];

export const SAVE_KEY = "aurelia-nights-save-v1";
export const GAME_VERSION = "1.0.0";
