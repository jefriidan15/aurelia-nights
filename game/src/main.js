// Aurelia Nights — entry point: game loop, modes, menus, save wiring.
// Static files only, no network. Open game/index.html in desktop Chrome.
import { mulberry32, clamp, DAY_MINUTES, GAME_VERSION } from "./util.js";
import { generateCity } from "./world.js";
import { Input } from "./input.js";
import { Sound } from "./audio.js";
import {
  spawnTraffic, spawnPeds, spawnParked, updatePlayer, updateTraffic,
  updatePeds, updatePolice, updateBullets, updatePickups, updateParticles,
  pushMsg,
} from "./entities.js";
import { newMissionState, startMission, updateMission, resetMission, currentObjective, MISSIONS } from "./missions.js";
import { saveGame, loadGame, hasSave, clearSave } from "./save.js";
import { render } from "./render.js";
import { applyShot } from "./shots.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const input = new Input(canvas);
const sound = new Sound();

let G = null;
let lastT = 0;
let fpsEma = 60;
let frameCount = 0;
const errors = [];
addEventListener("error", (e) => { errors.push(String(e.message || e.error)); });

function resize() {
  canvas.width = Math.floor(innerWidth);
  canvas.height = Math.floor(innerHeight);
}
addEventListener("resize", resize);
resize();

function createGame(seed, save) {
  const rng = mulberry32(seed);
  const city = generateCity(seed);
  const g = {
    version: GAME_VERSION,
    seed, rng, city,
    mode: "title",
    time: 0, clockMin: DAY_MINUTES,
    money: 200, health: 100, wanted: 0, wantedTimer: 0,
    player: {
      x: 520, y: 520, angle: -Math.PI / 2, aim: 0, speed: 0,
      inCar: null, hasPistol: false, ammo: 0,
      punchCd: 0, fireCd: 0, hurtCd: 0, moving: false,
    },
    cars: [], peds: [], cops: [], bullets: [], particles: [], pickups: [],
    msg: [], mission: newMissionState(), missionCard: null,
    stats: { carsStolen: 0, pedsHit: 0, goonsDown: 0, copsDown: 0, missionsDone: 0, shotsFired: 0 },
    muted: false, shake: 0, camX: 0, camY: 0, saveMsg: null,
    saveAvailable: hasSave(),
    ui: { buttons: [] },
    _mx: 0, _my: 0,
    onSave: null, onMissionComplete: null, onBusted: null,
  };
  g.onSave = () => { if (saveGame(g)) g.saveMsg = "Saved " + new Date().toLocaleTimeString() + "."; };
  g.onMissionComplete = () => { sound.jingle(); saveGame(g); };
  g.onBusted = () => { sound.busted(); };
  spawnTraffic(g, 26);
  spawnPeds(g, 42);
  spawnParked(g, 14);
  if (save) {
    g.money = save.money;
    g.health = save.health;
    g.clockMin = save.clockMin;
    g.player.hasPistol = save.hasPistol;
    g.player.ammo = save.ammo;
    g.player.x = save.px;
    g.player.y = save.py;
    g.stats = { ...g.stats, ...save.stats };
    startMission(g, Math.min(save.missionIndex, MISSIONS.length - 1));
  } else {
    startMission(g, 0);
  }
  return g;
}

function newGame() {
  const seed = (Math.random() * 1e9) | 0;
  clearSave();
  G = createGame(seed, null);
  G.mode = "playing";
  pushMsg(G, "Welcome back to Port Aurelia, Rae.");
  sound.ensure();
}

function continueGame() {
  const save = loadGame();
  if (!save) { newGame(); return; }
  G = createGame(save.seed, save);
  G.mode = "playing";
  pushMsg(G, "Welcome back, Rae. Job " + (G.mission.index + 1) + " is waiting.");
  sound.ensure();
}

function respawn() {
  const g = G;
  g.money = Math.max(0, g.money - 200);
  g.health = 100;
  g.wanted = 0;
  g.wantedTimer = 0;
  g.cops = [];
  g.bullets = [];
  if (g.player.inCar) {
    const car = g.cars.find((c) => c.id === g.player.inCar);
    if (car) { car.kind = "parked"; car.speed = 0; }
    g.player.inCar = null;
  }
  g.player.x = 650; g.player.y = 1820; // outside St. Anselm Hospital
  g.player.angle = -Math.PI / 2;
  g.mode = "playing";
  resetMission(g);
  pushMsg(g, "St. Anselm Hospital patched you up. -$200.");
}

function clickButton(id) {
  if (id === "new") newGame();
  else if (id === "continue") continueGame();
  else if (id === "howto") G.mode = "howto";
  else if (id === "back") G.mode = "title";
  else if (id === "resume") { G.mode = "playing"; G.saveMsg = null; }
  else if (id === "save") { if (saveGame(G)) G.saveMsg = "Saved " + new Date().toLocaleTimeString() + "."; }
  else if (id === "restart") { const seed = G.seed; G = createGame(seed, null); G.mode = "playing"; }
  else if (id === "quit") { G = createGame(G.seed, null); G.mode = "title"; G.saveAvailable = hasSave(); }
}

function handleClick() {
  sound.ensure();
  const b = G.ui.buttons.find((x) => input.mouseX >= x.x && input.mouseX <= x.x + x.w && input.mouseY >= yOf(x) && input.mouseY <= x.y + x.h);
  function yOf(x) { return x.y; }
  if (b) clickButton(b.id);
}

function handleKeys() {
  if (input.wasPressed("KeyM")) {
    G.muted = !G.muted;
    sound.setMuted(G.muted);
  }
  if (G.mode === "title") {
    if (input.wasPressed("Enter")) newGame();
    return;
  }
  if (G.mode === "howto") {
    if (input.wasPressed("Escape") || input.wasPressed("Enter")) G.mode = "title";
    return;
  }
  if (G.mode === "playing") {
    if (input.wasPressed("KeyP") || input.wasPressed("Escape")) { G.mode = "paused"; G.saveMsg = null; }
    return;
  }
  if (G.mode === "paused") {
    if (input.wasPressed("KeyP") || input.wasPressed("Escape")) G.mode = "playing";
    return;
  }
  if (G.mode === "busted" || G.mode === "wasted") {
    if (input.wasPressed("Enter")) respawn();
    return;
  }
  if (G.mode === "complete") {
    if (input.wasPressed("Enter")) G.mode = "playing";
  }
}

function update(dt) {
  G.time += dt;
  G.clockMin += dt * 0.5; // one game hour per 120 real seconds
  G.shake = Math.max(0, G.shake - dt * 26);
  for (const m of G.msg) m.t += dt;
  G.msg = G.msg.filter((m) => m.t < 10);
  if (G.missionCard) {
    G.missionCard.t += dt;
    if (G.missionCard.t > 3.5) G.missionCard = null;
  }
  if (G.mode === "title") {
    // slow orbit around downtown for the title backdrop
    const a = G.time * 0.05;
    G.player.x = 1300 + Math.cos(a) * 320;
    G.player.y = 1300 + Math.sin(a) * 320;
    updateTraffic(G, dt);
    updatePeds(G, dt);
    updateParticles(G, dt);
    return;
  }
  if (G.mode !== "playing") return;
  sound.ensure();
  updatePlayer(G, input, sound, dt, { x: G.camX, y: G.camY });
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt, sound);
  updateBullets(G, dt);
  updatePickups(G, dt, sound);
  updateParticles(G, dt);
  updateMission(G, dt);
  const car = G.player.inCar ? G.cars.find((c) => c.id === G.player.inCar) : null;
  sound.setEngine(car ? Math.abs(car.speed) / 470 : 0, !!car);
  sound.music(dt, true);
}

function frame(t) {
  requestAnimationFrame(frame);
  const dt = clamp((t - lastT) / 1000 || 0.016, 0.001, 0.05);
  lastT = t;
  if (dt > 0) fpsEma = fpsEma * 0.95 + (1 / dt) * 0.05;
  frameCount++;
  if (input.clicked) handleClick();
  handleKeys();
  update(dt);
  render(G, ctx, canvas.width, canvas.height, input);
  input.endFrame();
}

// debug / playtest handle (read-only state snapshot)
window.__AURELIA__ = {
  version: GAME_VERSION,
  state() {
    if (!G) return { mode: "boot", errors };
    const obj = G.mode === "playing" ? currentObjective(G) : null;
    let nearest = null;
    let carSpeed = 0, carHealth = 0;
    if (G.player.inCar) {
      const car = G.cars.find((c) => c.id === G.player.inCar);
      if (car) { carSpeed = Math.round(Math.abs(car.speed)); carHealth = Math.round(car.health); }
    }
    if (G.mode === "playing" && !G.player.inCar) {
      let bd = 1e9;
      for (const c of G.cars) {
        if (c.health <= 0) continue;
        const d = Math.hypot(c.x - G.player.x, c.y - G.player.y);
        if (d < bd) { bd = d; nearest = { x: Math.round(c.x), y: Math.round(c.y), dist: Math.round(d), kind: c.kind, type: c.type }; }
      }
    }
    return {
      mode: G.mode, errors: errors.slice(),
      fps: Math.round(fpsEma), frames: frameCount,
      player: { x: Math.round(G.player.x), y: Math.round(G.player.y), angle: +G.player.angle.toFixed(3), inCar: !!G.player.inCar, hasPistol: G.player.hasPistol, ammo: G.player.ammo, speed: carSpeed, carHealth: carHealth },
      nearestCar: nearest,
      money: G.money, health: Math.round(G.health), wanted: G.wanted,
      mission: { index: G.mission.index, step: G.mission.step, timer: Math.round(G.mission.timer), objective: currentObjective(G) },
      cars: G.cars.length, peds: G.peds.length, cops: G.cops.length,
      stats: { ...G.stats },
      saveAvailable: G.saveAvailable,
    };
  },
};

// boot
{
  const params = new URLSearchParams(location.search);
  const seedParam = Number(params.get("seed"));
  const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : 7;
  const shot = params.get("shot");
  G = createGame(seed, null);
  if (shot) applyShot(G, shot);
  requestAnimationFrame(frame);
}
