// Aurelia Nights — save / load (localStorage, one slot + autosave).
import { SAVE_KEY, GAME_VERSION } from "./util.js";

export function saveGame(G) {
  try {
    const p = G.player;
    const data = {
      version: GAME_VERSION,
      seed: G.seed,
      money: G.money,
      health: G.health,
      wanted: 0,
      clockMin: G.clockMin,
      missionIndex: G.mission.index,
      hasPistol: p.hasPistol,
      ammo: p.ammo,
      px: p.x, py: p.y,
      stats: G.stats,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== GAME_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
