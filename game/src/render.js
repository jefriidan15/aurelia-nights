// Aurelia Nights — all drawing: the city, entities, HUD, minimap and menus.
// Canvas 2D only, everything drawn in code, no images.
import { CAR_TYPES, WORLD, ROAD_STEP, ROAD_W, clamp, fmtMoney } from "./util.js";
import { shopById } from "./world.js";
import { currentObjective, missionDef, MISSIONS } from "./missions.js";

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function nightAlpha(G) {
  const h = (G.clockMin / 60) % 24;
  if (h >= 20 || h < 6) return 0.30;
  if (h >= 18) return 0.15;
  if (h < 8) return 0.12;
  return 0;
}

// The city itself never changes during a game, so it is painted once to an
// offscreen canvas and blitted each frame; only actors and effects redraw.
let staticCanvas = null;
let staticSeed = null;
function ensureStatic(G) {
  if (staticCanvas && staticSeed === G.seed) return;
  staticSeed = G.seed;
  staticCanvas = document.createElement("canvas");
  staticCanvas.width = WORLD;
  staticCanvas.height = WORLD;
  const s = staticCanvas.getContext("2d");
  s.fillStyle = "#39463c";
  s.fillRect(0, 0, WORLD, WORLD);
  s.fillStyle = "#e8d28a";
  s.fillRect(0, 2380, WORLD, 130);
  s.fillStyle = "#0984e3";
  s.fillRect(0, 2510, WORLD, WORLD - 2510);
  drawRoads(G, s, -80, -80, WORLD + 80, WORLD + 80);
  drawParksLots(G, s, () => true);
  drawBuildings(G, s, () => true);
}

export function render(G, ctx, W, H, input) {
  G.ui.buttons = [];
  ctx.clearRect(0, 0, W, H);
  const p = G.player;
  // camera follows the player, clamped to the world
  const shX = (Math.random() - 0.5) * (G.shake || 0);
  const shY = (Math.random() - 0.5) * (G.shake || 0);
  G.camX = clamp(p.x - W / 2 + shX, 0, Math.max(0, WORLD - W));
  G.camY = clamp(p.y - H / 2 + shY, 0, Math.max(0, WORLD - H));
  const vx0 = G.camX - 80, vy0 = G.camY - 80, vx1 = G.camX + W + 80, vy1 = G.camY + H + 80;
  const inView = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

  ctx.save();
  ctx.translate(-G.camX, -G.camY);

  // static city blit (ground, beach, roads, parks, buildings)
  ensureStatic(G);
  ctx.drawImage(staticCanvas, 0, 0);
  // animated wave lines on the water
  if (vy1 > 2500) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    for (let x = Math.floor(vx0 / 90) * 90; x < vx1; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, 2512 + Math.sin(G.time * 1.4 + x * 0.02) * 3);
      ctx.lineTo(x + 46, 2512 + Math.sin(G.time * 1.4 + x * 0.02) * 3);
      ctx.stroke();
    }
  }

  drawShops(G, ctx, inView);
  drawPickups(G, ctx, inView);
  drawObjective(G, ctx, W, H);

  for (const car of G.cars) if (inView(car.x, car.y, 60)) drawCar(G, ctx, car);
  for (const ped of G.peds) if (inView(ped.x, ped.y, 30)) drawPed(G, ctx, ped);
  for (const cop of G.cops) if (inView(cop.x, cop.y, 40)) drawCop(G, ctx, cop);
  drawBullets(G, ctx);
  drawParticles(G, ctx);
  if (G.mode === "playing" || G.mode === "paused") drawPlayer(G, ctx, p);

  // night tint
  const na = nightAlpha(G);
  if (na > 0) {
    ctx.fillStyle = "rgba(8,10,38," + na + ")";
    ctx.fillRect(G.camX, G.camY, W, H);
    // headlight pools
    ctx.fillStyle = "rgba(255,244,180,0.10)";
    for (const car of G.cars) {
      if (!inView(car.x, car.y, 60) || Math.abs(car.speed) < 5) continue;
      ctx.beginPath();
      ctx.arc(car.x + Math.cos(car.angle) * 60, car.y + Math.sin(car.angle) * 60, 46, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  drawHUD(G, ctx, W, H);
  drawMinimap(G, ctx, W, H);
  drawFeed(G, ctx, W, H);
  if (G.missionCard) drawMissionCard(G, ctx, W, H);

  if (G.mode === "title") drawTitle(G, ctx, W, H, input);
  else if (G.mode === "howto") drawHowTo(G, ctx, W, H);
  else if (G.mode === "paused") drawPause(G, ctx, W, H);
  else if (G.mode === "busted" || G.mode === "wasted") drawEnd(G, ctx, W, H);
  else if (G.mode === "complete") drawComplete(G, ctx, W, H);
}

function drawRoads(G, ctx, vx0, vy0, vx1, vy1) {
  ctx.fillStyle = "#2d3436";
  for (const l of G.city.lines) {
    if (l > vy0 - 40 && l < vy1 + 40) ctx.fillRect(Math.max(vx0, 0), l - ROAD_W / 2, Math.min(vx1, WORLD) - Math.max(vx0, 0), ROAD_W);
    if (l > vx0 - 40 && l < vx1 + 40) ctx.fillRect(l - ROAD_W / 2, Math.max(vy0, 0), ROAD_W, Math.min(vy1, WORLD) - Math.max(vy0, 0));
  }
  // centre dashes
  ctx.fillStyle = "#f5f6fa";
  for (const l of G.city.lines) {
    for (let d = 0; d < WORLD; d += 80) {
      if (l > vy0 - 40 && l < vy1 + 40 && d > vx0 && d < vx1) ctx.fillRect(d, l - 2, 34, 4);
      if (l > vx0 - 40 && l < vx1 + 40 && d > vy0 && d < vy1) ctx.fillRect(l - 2, d, 4, 34);
    }
  }
  // crosswalks at intersections
  ctx.fillStyle = "rgba(245,246,250,0.75)";
  for (const lx of G.city.lines) {
    for (const ly of G.city.lines) {
      if (lx < vx0 - 60 || lx > vx1 + 60 || ly < vy0 - 60 || ly > vy1 + 60) continue;
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(lx + i * 9 - 3, ly - ROAD_W / 2 + 4, 5, 10);
        ctx.fillRect(lx + i * 9 - 3, ly + ROAD_W / 2 - 14, 5, 10);
      }
    }
  }
}

function drawParksLots(G, ctx, inView) {
  for (const pk of G.city.parks) {
    if (!inView(pk.x + pk.w / 2, pk.y + pk.h / 2, 120)) continue;
    ctx.fillStyle = "#27ae60";
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    ctx.fillStyle = "#1e8449";
    for (let i = 0; i < pk.trees; i++) {
      const tx = pk.x + 18 + ((i * 37) % (pk.w - 36));
      const ty = pk.y + 18 + ((i * 53) % (pk.h - 36));
      ctx.beginPath(); ctx.arc(tx, ty, 12, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const lot of G.city.lots) {
    if (!inView(lot.x + lot.w / 2, lot.y + lot.h / 2, 120)) continue;
    ctx.fillStyle = "#636e72";
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    for (let x = lot.x + 14; x < lot.x + lot.w - 10; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, lot.y + 10); ctx.lineTo(x, lot.y + 34); ctx.stroke();
    }
  }
}

function drawBuildings(G, ctx, inView) {
  for (const b of G.city.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, 140)) continue;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    // windows: deterministic speckle from the building seed
    ctx.fillStyle = b.kind === "tower" ? "rgba(255,214,90,0.85)" : "rgba(223,230,233,0.55)";
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.min(b.stories, Math.floor(b.h / 26)));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (((b.seed + i * 7 + j * 13) % 5) < 2) continue;
        ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 8 + j * ((b.h - 16) / rows), 9, 11);
      }
    }
    if (b.kind === "warehouse") {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(b.x + 10, b.y + b.h / 2 - 6, b.w - 20, 12);
    }
  }
}

function drawShops(G, ctx, inView) {
  ctx.textAlign = "center";
  for (const s of G.city.shops) {
    if (!inView(s.x, s.y, 80)) continue;
    const pulse = 1 + Math.sin(G.time * 3) * 0.12;
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, 16 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2d3436";
    ctx.beginPath(); ctx.arc(s.x, s.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.fillText(s.name[0], s.x, s.y + 4);
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(s.name, s.x, s.y - 24);
  }
  ctx.textAlign = "left";
}

function drawPickups(G, ctx, inView) {
  for (const pk of G.pickups) {
    if (!inView(pk.x, pk.y, 30)) continue;
    const bob = Math.sin(pk.t * 4) * 3;
    if (pk.kind === "cash") {
      ctx.fillStyle = "#2ecc71";
      ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("$", pk.x, pk.y + bob + 4);
      ctx.textAlign = "left";
    } else if (pk.kind === "health") {
      ctx.fillStyle = "#ecf0f1";
      ctx.fillRect(pk.x - 10, pk.y - 10 + bob, 20, 20);
      ctx.fillStyle = "#e74c3c";
      ctx.fillRect(pk.x - 2, pk.y - 7 + bob, 4, 14);
      ctx.fillRect(pk.x - 7, pk.y - 2 + bob, 14, 4);
    } else {
      ctx.fillStyle = "#f1c40f";
      ctx.fillRect(pk.x - 9, pk.y - 5 + bob, 18, 10);
    }
  }
}

function drawObjective(G, ctx, W, H) {
  if (G.mode !== "playing") return;
  const obj = currentObjective(G);
  if (!obj) return;
  const pulse = 1 + Math.sin(G.time * 4) * 0.2;
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#f1c40f";
  ctx.fillRect(-11 * pulse, -11 * pulse, 22 * pulse, 22 * pulse);
  ctx.fillStyle = "#e67e22";
  ctx.fillRect(-6 * pulse, -6 * pulse, 12 * pulse, 12 * pulse);
  ctx.restore();
  // edge arrow when the objective is off-screen
  const sx = obj.x - G.camX, sy = obj.y - G.camY;
  if (sx < 0 || sx > W || sy < 0 || sy > H) {
    const cx = clamp(sx, 40, W - 40), cy = clamp(sy, 90, H - 60);
    const a = Math.atan2(sy - H / 2, sx - W / 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = "#f1c40f";
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#f1c40f";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(Math.round(Math.hypot(obj.x - G.player.x, obj.y - G.player.y)) + "m", cx, cy + 26);
    ctx.textAlign = "left";
  }
}

function drawCar(G, ctx, car) {
  const t = CAR_TYPES[car.type];
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  rr(ctx, -t.len / 2 + 3, -t.wid / 2 + 4, t.len, t.wid, 7);
  ctx.fill();
  // wheels
  ctx.fillStyle = "#111";
  const wy = t.wid / 2 - 2;
  ctx.fillRect(-t.len / 2 + 6, -wy - 3, 12, 6);
  ctx.fillRect(t.len / 2 - 18, -wy - 3, 12, 6);
  ctx.fillRect(-t.len / 2 + 6, wy - 3, 12, 6);
  ctx.fillRect(t.len / 2 - 18, wy - 3, 12, 6);
  // body
  ctx.fillStyle = car.health <= 0 ? "#2d3436" : car.color;
  rr(ctx, -t.len / 2, -t.wid / 2, t.len, t.wid, 7);
  ctx.fill();
  if (car.type === "police") {
    ctx.fillStyle = "#dfe6e9";
    ctx.fillRect(-6, -t.wid / 2, 16, t.wid);
    const flash = Math.floor(G.time * 6) % 2 === 0;
    ctx.fillStyle = flash ? "#e74c3c" : "#3498db";
    ctx.fillRect(-4, -t.wid / 2 - 2, 8, 5);
    ctx.fillStyle = flash ? "#3498db" : "#e74c3c";
    ctx.fillRect(-4, t.wid / 2 - 3, 8, 5);
  }
  if (car.type === "taxi") {
    ctx.fillStyle = "#2d3436";
    for (let i = 0; i < 5; i++) ctx.fillRect(-t.len / 2 + 6 + i * 8, -2, 4, 4);
  }
  // cabin + glass
  ctx.fillStyle = "rgba(20,26,34,0.85)";
  rr(ctx, -t.len / 2 + 12, -t.wid / 2 + 4, t.len - 26, t.wid - 8, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(178,223,255,0.75)";
  ctx.fillRect(t.len / 2 - 14, -t.wid / 2 + 5, 5, t.wid - 10);
  // damage smoke is particles; wreck mark
  if (car.health <= 0) {
    ctx.strokeStyle = "#636e72";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke();
  }
  ctx.restore();
}

function drawPed(G, ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.kind === "down") {
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = ped.kind === "goon" ? "#2d3436" : ped.color;
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f5cba7";
  ctx.beginPath(); ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3, 5.5, 0, Math.PI * 2); ctx.fill();
  if (ped.kind === "goon") {
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ped.angle) * 20, Math.sin(ped.angle) * 20); ctx.stroke();
  }
  ctx.restore();
}

function drawCop(G, ctx, cop) {
  if (!cop.onFoot) return; // cop cars are drawn as cars
  if (cop.hp <= 0) {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.fillStyle = "#1e3799";
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(cop.x, cop.y);
  ctx.fillStyle = "#1e3799";
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f5cba7";
  ctx.beginPath(); ctx.arc(Math.cos(cop.angle) * 3, Math.sin(cop.angle) * 3, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0c2461";
  ctx.fillRect(-6, -11, 12, 5);
  ctx.restore();
}

function drawPlayer(G, ctx, p) {
  if (p.inCar) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(2, 3, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#00cec9";
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f5cba7";
  ctx.beginPath(); ctx.arc(3, 0, 6, 0, Math.PI * 2); ctx.fill();
  if (p.hasPistol) {
    ctx.strokeStyle = "#2d3436";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.stroke();
  }
  ctx.restore();
  // aim tick
  if (p.hasPistol) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.aim) * 26, p.y + Math.sin(p.aim) * 26);
    ctx.lineTo(p.x + Math.cos(p.aim) * 40, p.y + Math.sin(p.aim) * 40);
    ctx.stroke();
  }
}

function drawBullets(G, ctx) {
  ctx.strokeStyle = "#ffd32a";
  ctx.lineWidth = 2;
  for (const b of G.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - Math.cos(b.angle) * 12, b.y - Math.sin(b.angle) * 12);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawParticles(G, ctx) {
  for (const pt of G.particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function panel(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill || "rgba(10,14,24,0.82)";
  rr(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawHUD(G, ctx, W, H) {
  if (G.mode === "title" || G.mode === "howto") return;
  // cash + health
  panel(ctx, 12, 12, 218, 64, "rgba(10,14,24,0.72)");
  ctx.fillStyle = "#2ecc71";
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillText(fmtMoney(G.money), 24, 40);
  ctx.fillStyle = "#636e72";
  rr(ctx, 24, 50, 194, 12, 6); ctx.fill();
  ctx.fillStyle = G.health > 35 ? "#2ecc71" : "#e74c3c";
  rr(ctx, 24, 50, 194 * clamp(G.health / 100, 0, 1), 12, 6); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.fillText("HEALTH " + Math.round(G.health), 26, 59);
  // wanted stars
  panel(ctx, W - 212, 12, 200, 46, "rgba(10,14,24,0.72)");
  ctx.font = "bold 26px system-ui, sans-serif";
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < G.wanted ? "#f1c40f" : "rgba(255,255,255,0.22)";
    ctx.fillText("★", W - 196 + i * 34, 44);
  }
  // clock
  const hh = Math.floor(G.clockMin / 60) % 24;
  const mm = Math.floor(G.clockMin % 60);
  ctx.fillStyle = "#dfe6e9";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"), W - 24, 76);
  ctx.textAlign = "left";
  // mission banner
  const def = missionDef(G);
  if (def && G.mode === "playing") {
    const obj = currentObjective(G);
    const text = "JOB " + (G.mission.index + 1) + "/" + MISSIONS.length + " — " + def.name;
    ctx.font = "bold 15px system-ui, sans-serif";
    const tw = ctx.measureText(text).width;
    let sub = obj ? obj.label : def.brief;
    while (sub.length > 64) sub = sub.slice(0, 61) + "…";
    ctx.font = "13px system-ui, sans-serif";
    const sw = ctx.measureText(sub).width;
    const pw = Math.max(tw, sw) + 32;
    panel(ctx, W / 2 - pw / 2, 12, pw, 54, "rgba(10,14,24,0.72)");
    ctx.fillStyle = "#f1c40f";
    ctx.textAlign = "center";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText(text, W / 2, 33);
    ctx.fillStyle = "#fff";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(sub, W / 2, 53);
    ctx.textAlign = "left";
    const step = def.steps[G.mission.step];
    if (step && step.timer) {
      ctx.fillStyle = G.mission.timer < 15 ? "#e74c3c" : "#fff";
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(Math.ceil(G.mission.timer) + "s", W / 2, 86);
      ctx.textAlign = "left";
    }
    if (step && step.type === "grab" && G.mission.grabT > 0) {
      const frac = clamp(G.mission.grabT / (step.hold || 3), 0, 1);
      ctx.fillStyle = "#636e72";
      rr(ctx, W / 2 - 90, 92, 180, 10, 5); ctx.fill();
      ctx.fillStyle = "#f1c40f";
      rr(ctx, W / 2 - 90, 92, 180 * frac, 10, 5); ctx.fill();
    }
  }
  // driving readout
  const car = G.player.inCar ? G.cars.find((c) => c.id === G.player.inCar) : null;
  if (car) {
    panel(ctx, W - 212, H - 76, 200, 64, "rgba(10,14,24,0.72)");
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.fillText(Math.round(Math.abs(car.speed) * 0.36) + " km/h", W - 198, H - 46);
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#dfe6e9";
    ctx.fillText(CAR_TYPES[car.type].name, W - 198, H - 28);
    ctx.fillStyle = "#636e72";
    rr(ctx, W - 198, H - 22, 172, 8, 4); ctx.fill();
    ctx.fillStyle = car.health > 35 ? "#2ecc71" : "#e74c3c";
    rr(ctx, W - 198, H - 22, 172 * clamp(car.health / car.maxHealth, 0, 1), 8, 4); ctx.fill();
  }
  // contextual hint
  const hint = contextHint(G);
  if (hint && G.mode === "playing") {
    ctx.font = "13px system-ui, sans-serif";
    const tw = ctx.measureText(hint).width;
    panel(ctx, W / 2 - tw / 2 - 12, H - 40, tw + 24, 28, "rgba(10,14,24,0.72)");
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(hint, W / 2, H - 21);
    ctx.textAlign = "left";
  }
}

function contextHint(G) {
  const p = G.player;
  if (!p.inCar) {
    const car = G.cars.find((c) => c.health > 0 && Math.hypot(c.x - p.x, c.y - p.y) < 58);
    if (car) return "Press E to take the " + CAR_TYPES[car.type].name;
    for (const s of G.city.shops) {
      if (Math.hypot(s.x - p.x, s.y - p.y) < 70) {
        if (s.kind === "gun") return "Press E — Ironworks: AP-9 pistol $300";
        if (s.kind === "diner") return "Press E — Burger Barn: full meal $20 (heals)";
        if (s.kind === "safehouse") return "Press E — Safehouse: save your progress";
      }
    }
    if (G.time < 40) return "WASD move · E enter car · F / click attack · P pause · M mute";
  } else {
    for (const s of G.city.shops) {
      if (s.kind === "spray" && Math.hypot(s.x - p.x, s.y - p.y) < 70 && G.wanted > 0) return "Press E — Spray Shop: respray $100, lose the heat";
    }
    if (G.time < 40) return "WASD drive · Space handbrake · E exit car";
  }
  return null;
}

function drawMinimap(G, ctx, W, H) {
  if (G.mode === "title" || G.mode === "howto") return;
  const S = 168, scale = S / WORLD;
  const x0 = 12, y0 = H - S - 12;
  panel(ctx, x0 - 6, y0 - 6, S + 12, S + 12, "rgba(10,14,24,0.78)");
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, S, S); ctx.clip();
  ctx.fillStyle = "#2f3a2e";
  ctx.fillRect(x0, y0, S, S);
  ctx.fillStyle = "#0984e3";
  ctx.fillRect(x0, y0 + 2380 * scale, S, S - 2380 * scale);
  ctx.strokeStyle = "#636e72";
  ctx.lineWidth = 2;
  for (const l of G.city.lines) {
    ctx.beginPath(); ctx.moveTo(x0 + l * scale, y0); ctx.lineTo(x0 + l * scale, y0 + S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, y0 + l * scale); ctx.lineTo(x0 + S, y0 + l * scale); ctx.stroke();
  }
  for (const s of G.city.shops) {
    ctx.fillStyle = s.color;
    ctx.fillRect(x0 + s.x * scale - 2, y0 + s.y * scale - 2, 4, 4);
  }
  const obj = currentObjective(G);
  if (obj && G.mode === "playing") {
    ctx.fillStyle = "#f1c40f";
    ctx.beginPath(); ctx.arc(x0 + obj.x * scale, y0 + obj.y * scale, 4, 0, Math.PI * 2); ctx.fill();
  }
  for (const cop of G.cops) {
    if (cop.hp <= 0) continue;
    ctx.fillStyle = "#e74c3c";
    ctx.beginPath(); ctx.arc(x0 + cop.x * scale, y0 + cop.y * scale, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#00cec9";
  ctx.save();
  ctx.translate(x0 + G.player.x * scale, y0 + G.player.y * scale);
  ctx.rotate(G.player.angle);
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = "#dfe6e9";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillText("PORT AURELIA", x0 + 2, y0 + S + 22 < H ? y0 - 10 + 0 : y0 - 10);
}

function drawFeed(G, ctx, W, H) {
  if (G.mode === "title" || G.mode === "howto") return;
  ctx.font = "13px system-ui, sans-serif";
  let y = H - 96;
  let shown = 0;
  for (let i = 0; i < G.msg.length && shown < 3; i++) {
    const m = G.msg[i];
    const a = clamp(1 - m.t / 9, 0, 1);
    if (a <= 0) continue;
    // keep feed chips short so they never run off the right edge
    let text = m.text;
    while (text.length > 72) text = text.slice(0, 69) + "…";
    while (ctx.measureText(text).width > 520 && text.length > 10) text = text.slice(0, -2) + "…";
    const tw = ctx.measureText(text).width;
    ctx.globalAlpha = a;
    panel(ctx, W - tw - 36, y - 18, tw + 24, 24, "rgba(10,14,24,0.85)");
    ctx.fillStyle = "#fff";
    ctx.fillText(text, W - tw - 24, y);
    ctx.globalAlpha = 1;
    y -= 30;
    shown++;
  }
}

function drawMissionCard(G, ctx, W, H) {
  const c = G.missionCard;
  const a = clamp(1 - Math.max(0, c.t - 2.6) / 0.9, 0, 1);
  ctx.globalAlpha = a;
  panel(ctx, W / 2 - 210, H / 2 - 66, 420, 110, "rgba(10,14,24,0.88)");
  ctx.fillStyle = "#f1c40f";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("JOB COMPLETE", W / 2, H / 2 - 26);
  ctx.fillStyle = "#fff";
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText(c.name + "   +" + fmtMoney(c.reward), W / 2, H / 2 + 8);
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

function button(G, ctx, x, y, w, h, label, id, disabled) {
  const mx = G._mx || 0, my = G._my || 0;
  const hover = !disabled && mx >= x && mx <= x + w && my >= y && my <= y + h;
  ctx.fillStyle = disabled ? "rgba(255,255,255,0.05)" : hover ? "#f1c40f" : "rgba(255,255,255,0.12)";
  rr(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = disabled ? "rgba(255,255,255,0.15)" : hover ? "#f1c40f" : "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = disabled ? "rgba(255,255,255,0.45)" : hover ? "#111" : "#fff";
  ctx.font = "bold 17px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y + h / 2 + 6);
  ctx.textAlign = "left";
  if (!disabled) G.ui.buttons.push({ id, x, y, w, h });
}

function drawTitle(G, ctx, W, H, input) {
  G._mx = input.mouseX; G._my = input.mouseY;
  ctx.fillStyle = "rgba(8,10,24,0.62)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f1c40f";
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.fillText("AURELIA", W / 2, H / 2 - 96);
  ctx.fillStyle = "#00cec9";
  ctx.fillText("NIGHTS", W / 2, H / 2 - 32);
  ctx.fillStyle = "#dfe6e9";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText("Port Aurelia, 2026. Rae Vega is out of prison — and Mama Luz has six jobs.", W / 2, H / 2 + 2);
  ctx.fillText("Steal cars. Outrun the APD. Become the King of Aurelia.", W / 2, H / 2 + 26);
  const bw = 300, bx = W / 2 - bw / 2;
  let by = H / 2 + 56;
  button(G, ctx, bx, by, bw, 46, "NEW GAME", "new");
  by += 58;
  button(G, ctx, bx, by, bw, 46, "CONTINUE", "continue", !G.saveAvailable);
  by += 58;
  button(G, ctx, bx, by, bw, 46, "HOW TO PLAY", "howto");
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("WASD move / drive · E enter car · F or click attack · Space handbrake · P pause · M mute", W / 2, H - 24);
  ctx.textAlign = "left";
}

function drawHowTo(G, ctx, W, H) {
  ctx.fillStyle = "rgba(8,10,24,0.78)";
  ctx.fillRect(0, 0, W, H);
  panel(ctx, W / 2 - 320, H / 2 - 230, 640, 460);
  ctx.fillStyle = "#f1c40f";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("HOW TO PLAY", W / 2, H / 2 - 192);
  ctx.fillStyle = "#fff";
  ctx.font = "15px system-ui, sans-serif";
  const lines = [
    "You are Rae Vega, getaway driver. Six jobs stand between you",
    "and the crown of Port Aurelia. Follow the yellow marker.",
    "",
    "WASD / arrows — move on foot, drive in a car",
    "Mouse — aim   ·   Click / F — punch or fire the pistol",
    "E — enter / exit a car, use a shop, grab a package",
    "Space — handbrake   ·   Shift — sprint",
    "P / Esc — pause   ·   M — mute",
    "",
    "Stealing an occupied car, hitting a pedestrian or hurting",
    "a cop raises your wanted level (1-5 stars). Lose the heat",
    "by hiding until it cools off, or pay $100 at a spray shop.",
    "Busted or wasted: you wake up at the hospital, -$200.",
    "",
    "Ironworks sells the AP-9 pistol ($300). Burger Barn heals",
    "you ($20). The safehouse saves your game.",
  ];
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, H / 2 - 158 + i * 24));
  ctx.textAlign = "left";
  button(G, ctx, W / 2 - 110, H / 2 + 168, 220, 44, "BACK", "back");
}

function drawPause(G, ctx, W, H) {
  ctx.fillStyle = "rgba(8,10,24,0.6)";
  ctx.fillRect(0, 0, W, H);
  panel(ctx, W / 2 - 220, H / 2 - 170, 440, 340);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PAUSED", W / 2, H / 2 - 126);
  ctx.font = "15px system-ui, sans-serif";
  ctx.fillStyle = "#dfe6e9";
  const def = missionDef(G);
  ctx.fillText("Cash " + fmtMoney(G.money) + "   ·   Jobs done " + G.stats.missionsDone + "/" + MISSIONS.length, W / 2, H / 2 - 92);
  ctx.fillText(def ? "Current job: " + def.name : "Free roam", W / 2, H / 2 - 66);
  ctx.textAlign = "left";
  const bw = 280, bx = W / 2 - bw / 2;
  let by = H / 2 - 44;
  button(G, ctx, bx, by, bw, 44, "RESUME", "resume");
  by += 54;
  button(G, ctx, bx, by, bw, 44, "SAVE GAME", "save");
  by += 54;
  button(G, ctx, bx, by, bw, 44, "RESTART DAY", "restart");
  by += 54;
  button(G, ctx, bx, by, bw, 44, "QUIT TO TITLE", "quit");
  if (G.saveMsg) {
    ctx.fillStyle = "#2ecc71";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(G.saveMsg, W / 2, H / 2 + 196);
    ctx.textAlign = "left";
  }
}

function drawEnd(G, ctx, W, H) {
  ctx.fillStyle = G.mode === "busted" ? "rgba(20,20,80,0.72)" : "rgba(60,10,10,0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = G.mode === "busted" ? "#74b9ff" : "#e74c3c";
  ctx.font = "bold 72px system-ui, sans-serif";
  ctx.fillText(G.mode === "busted" ? "BUSTED" : "WASTED", W / 2, H / 2 - 20);
  ctx.fillStyle = "#fff";
  ctx.font = "17px system-ui, sans-serif";
  ctx.fillText("You wake up at St. Anselm Hospital. -$200. The jobs are still waiting.", W / 2, H / 2 + 20);
  ctx.fillStyle = "#f1c40f";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.fillText("Press Enter to continue", W / 2, H / 2 + 64);
  ctx.textAlign = "left";
}

function drawComplete(G, ctx, W, H) {
  ctx.fillStyle = "rgba(8,10,24,0.7)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f1c40f";
  ctx.font = "bold 58px system-ui, sans-serif";
  ctx.fillText("KING OF AURELIA", W / 2, H / 2 - 80);
  ctx.fillStyle = "#fff";
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText("All six jobs done. The Marina crowd chants your name. Port Aurelia is yours.", W / 2, H / 2 - 36);
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText("Cash " + fmtMoney(G.money) + "   ·   Cars stolen " + G.stats.carsStolen + "   ·   Cops down " + G.stats.copsDown + "   ·   Time " + Math.round(G.time) + "s", W / 2, H / 2 + 4);
  ctx.fillStyle = "#00cec9";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.fillText("Press Enter to keep playing (free roam)", W / 2, H / 2 + 48);
  ctx.textAlign = "left";
}
