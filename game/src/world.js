// Aurelia Nights — Port Aurelia: a procedural coastal grid city.
// Roads every ROAD_STEP units; blocks hold buildings, parks and lots.
// The south edge is a beach; the east edge is the dockyard.
import { mulberry32, pick, rangeInt, ROAD_STEP, ROAD_W, WORLD } from "./util.js";

const ROOFS = ["#7f8c8d", "#95a5a6", "#b03a2e", "#6c3483", "#1a5276", "#7d6608", "#5d6d7e", "#935116"];
const TOWER_ROOFS = ["#2c3e50", "#34495e", "#1b4f72", "#4a235a", "#145a32"];

export const SHOPS = [
  { id: "safehouse", name: "Safehouse", kind: "safehouse", x: 520, y: 520, color: "#2ecc71" },
  { id: "garage", name: "Luz's Garage", kind: "garage", x: 780, y: 520, color: "#f1c40f" },
  { id: "spray", name: "Spray Shop", kind: "spray", x: 2080, y: 650, color: "#e67e22" },
  { id: "gun", name: "Ironworks", kind: "gun", x: 910, y: 1560, color: "#e74c3c" },
  { id: "diner", name: "Burger Barn", kind: "diner", x: 1560, y: 910, color: "#f39c12" },
  { id: "bank", name: "Meridian Bank", kind: "bank", x: 1300, y: 1300, color: "#3498db" },
  { id: "hospital", name: "St. Anselm Hospital", kind: "hospital", x: 650, y: 1820, color: "#ecf0f1" },
  { id: "docks", name: "Dockyard 7", kind: "docks", x: 2340, y: 1300, color: "#95a5a6" },
  { id: "motel", name: "Palm Court Motel", kind: "motel", x: 1300, y: 2080, color: "#1abc9c" },
  { id: "marina", name: "Marina", kind: "marina", x: 2080, y: 2340, color: "#00cec9" },
];

export function shopById(id) { return SHOPS.find((s) => s.id === id); }

export function generateCity(seed) {
  const rng = mulberry32(seed);
  const lines = [];
  for (let v = 0; v <= WORLD; v += ROAD_STEP) lines.push(v);
  const buildings = [];
  const parks = [];
  const lots = [];
  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      const bx = lines[i] + ROAD_W / 2 + 14;
      const by = lines[j] + ROAD_W / 2 + 14;
      const bw = ROAD_STEP - ROAD_W - 28;
      const bh = ROAD_STEP - ROAD_W - 28;
      const cx = bx + bw / 2, cy = by + bh / 2;
      if (by + bh > 2380) continue; // south beach strip: no buildings
      const docks = bx > 2280;
      const downtown = Math.hypot(cx - 1300, cy - 1300) < 720;
      const roll = rng();
      if (!docks && roll < 0.10) { parks.push({ x: bx, y: by, w: bw, h: bh, trees: rangeInt(rng, 4, 9) }); continue; }
      if (!docks && !downtown && roll < 0.18) { lots.push({ x: bx, y: by, w: bw, h: bh }); continue; }
      if (docks) {
        buildings.push({ x: bx + 10, y: by + 20, w: bw - 20, h: bh - 40, roof: "#7f8c8d", stories: 1, kind: "warehouse", seed: rangeInt(rng, 1, 9999) });
        continue;
      }
      if (downtown && rng() < 0.55) {
        buildings.push({ x: bx + 18, y: by + 18, w: bw - 36, h: bh - 36, roof: pick(rng, TOWER_ROOFS), stories: rangeInt(rng, 6, 14), kind: "tower", seed: rangeInt(rng, 1, 9999) });
        continue;
      }
      const n = rng() < 0.5 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const w = n === 1 ? bw - 24 : (bw - 34) / 2;
        const h = n === 1 ? bh - 24 : (bh - 34) / 2;
        const x = n === 1 ? bx + 12 : bx + 10 + (k % 2) * (w + 14);
        const y = n === 1 ? by + 12 : by + 10 + Math.floor(k / 2) * (h + 14);
        buildings.push({ x, y, w, h, roof: pick(rng, ROOFS), stories: rangeInt(rng, 1, 3), kind: "house", seed: rangeInt(rng, 1, 9999) });
      }
    }
  }
  // spatial index: buildings live inside one block cell each, so collision
  // checks only look at the cells the query circle overlaps.
  const spatial = new Map();
  for (const b of buildings) {
    const key = Math.floor(b.x / ROAD_STEP) + "," + Math.floor(b.y / ROAD_STEP);
    if (!spatial.has(key)) spatial.set(key, []);
    spatial.get(key).push(b);
  }
  return { seed, lines, buildings, parks, lots, shops: SHOPS, spatial };
}

export function onRoad(x, y) {
  const near = (v) => {
    const m = ((v % ROAD_STEP) + ROAD_STEP) % ROAD_STEP;
    return Math.min(m, ROAD_STEP - m) <= ROAD_W / 2 + 4;
  };
  return near(x) || near(y);
}

export function nearestRoadPoint(x, y) {
  const snap = (v) => Math.round(v / ROAD_STEP) * ROAD_STEP;
  const dx = Math.abs(x - snap(x));
  const dy = Math.abs(y - snap(y));
  if (dx <= dy) return { x: snap(x), y };
  return { x, y: snap(y) };
}

export function randomIntersection(rng, city) {
  const l = city.lines;
  return { x: pick(rng, l), y: pick(rng, l) };
}

// Circle vs buildings / world edge / water. Returns the blocker or null.
export function collideCircle(city, x, y, r) {
  if (x < r || y < r || x > WORLD - r || y > WORLD - r) return "edge";
  if (y > 2508 - r) return "water";
  const i0 = Math.floor((x - r) / ROAD_STEP), i1 = Math.floor((x + r) / ROAD_STEP);
  const j0 = Math.floor((y - r) / ROAD_STEP), j1 = Math.floor((y + r) / ROAD_STEP);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const cell = city.spatial.get(i + "," + j);
      if (!cell) continue;
      for (const b of cell) {
        const nx = Math.max(b.x, Math.min(x, b.x + b.w));
        const ny = Math.max(b.y, Math.min(y, b.y + b.h));
        const dx = x - nx, dy = y - ny;
        if (dx * dx + dy * dy < r * r) return b;
      }
    }
  }
  return null;
}

// Move a circle with axis-separated sliding. Returns {x, y, hit}.
export function moveCircle(city, x, y, r, dx, dy) {
  let hit = false;
  if (!collideCircle(city, x + dx, y, r)) x += dx; else hit = true;
  if (!collideCircle(city, x, y + dy, r)) y += dy; else hit = true;
  return { x, y, hit };
}

export function buildingAt(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}
