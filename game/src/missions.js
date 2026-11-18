// Aurelia Nights — six story jobs for Mama Luz, and the step engine that runs them.
// Steps: steal | goto | deliver (timed goto) | setWanted | loseWanted (timed)
//        | kill (spawn goons) | grab (hold-to-take) | spawnSports | enterSports
//        | checkpoints (sequential gotos).
import { dist } from "./util.js";
import { shopById } from "./world.js";
import { addWanted, pushMsg, makePed, makeCar } from "./entities.js";

export const MISSIONS = [
  {
    id: "first-wheels", name: "First Wheels", giver: "Mama Luz", reward: 150,
    brief: "Rae, you are out. First thing: wheels. Take any car on the street and bring it to my garage.",
    steps: [
      { type: "steal", label: "Steal a car (walk up and press E)" },
      { type: "goto", shop: "garage", label: "Drive to Luz's Garage", radius: 70 },
    ],
  },
  {
    id: "courier", name: "Courier Run", giver: "Mama Luz", reward: 250,
    brief: "A package is waiting at Dockyard 7. Run it to the Palm Court Motel — fast. The client pays for fast.",
    steps: [
      { type: "goto", shop: "docks", label: "Pick up the package at Dockyard 7", radius: 70 },
      { type: "deliver", shop: "motel", label: "Deliver to the Palm Court Motel", radius: 70, timer: 100 },
    ],
  },
  {
    id: "hot-pursuit", name: "Hot Pursuit", giver: "Mama Luz", reward: 300,
    brief: "The APD made you at the docks. Lose them — duck the spray shop on the east side, or outlast the heat.",
    steps: [
      { type: "setWanted", n: 3 },
      { type: "loseWanted", label: "Lose the cops (wanted level 0)", timer: 85 },
    ],
  },
  {
    id: "dock-deal", name: "Dock Deal", giver: "Mama Luz", reward: 500, grantPistol: true,
    brief: "The Marinelli crew shorted us at the docks. Take the briefcase back — and take the pistol, you will need it.",
    steps: [
      { type: "goto", shop: "docks", label: "Get to Dockyard 7", radius: 80 },
      { type: "kill", count: 4, shop: "docks", label: "Deal with the Marinelli crew (4)" },
      { type: "grab", shop: "docks", label: "Grab the briefcase (hold E near it)", radius: 60, hold: 3 },
      { type: "goto", shop: "safehouse", label: "Bring the briefcase to the Safehouse", radius: 70 },
    ],
  },
  {
    id: "vault", name: "The Vault Job", giver: "Mama Luz", reward: 800,
    brief: "Meridian Bank. In on foot, hold the vault, walk out rich. The whole APD will be on you — get to the safehouse.",
    steps: [
      { type: "goto", shop: "bank", label: "Reach Meridian Bank (on foot)", radius: 60, onFoot: true },
      { type: "grab", shop: "bank", label: "Hold the vault open (stay close)", radius: 60, hold: 5 },
      { type: "setWanted", n: 4 },
      { type: "goto", shop: "safehouse", label: "Escape to the Safehouse", radius: 70 },
    ],
  },
  {
    id: "king", name: "King of Aurelia", giver: "Mama Luz", reward: 1500,
    brief: "Last job. The Aurora GT is waiting at the garage. Five checkpoints, every cop in Aurelia on your tail, finish at the Marina. Do this and you are the King of Aurelia.",
    steps: [
      { type: "spawnSports", shop: "garage" },
      { type: "enterSports", label: "Take the Aurora GT from the garage" },
      { type: "setWanted", n: 5 },
      {
        type: "checkpoints", label: "Hit the checkpoints",
        points: [
          { x: 1300, y: 390 }, { x: 2080, y: 1300 }, { x: 1300, y: 2080 },
          { x: 650, y: 1560 }, { x: 2080, y: 2080 },
        ],
      },
      { type: "goto", shop: "marina", label: "Finish at the Marina", radius: 80 },
    ],
  },
];

export function newMissionState() {
  return { index: 0, step: 0, timer: 0, grabT: 0, cpIndex: 0, killsStart: 0, killsNeeded: 0, done: false };
}

export function missionDef(G) {
  return MISSIONS[G.mission.index] || null;
}

export function startMission(G, index) {
  G.mission.index = index;
  G.mission.step = 0;
  G.mission.timer = 0;
  G.mission.grabT = 0;
  G.mission.cpIndex = 0;
  G.mission.done = false;
  const def = MISSIONS[index];
  if (def) pushMsg(G, "New job — " + def.name + ": " + def.brief);
  enterStep(G);
}

export function resetMission(G) {
  const idx = Math.min(G.mission.index, MISSIONS.length - 1);
  startMission(G, idx);
}

function stepDef(G) {
  const def = missionDef(G);
  return def ? def.steps[G.mission.step] : null;
}

function stepPoint(step) {
  if (step.shop) {
    const s = shopById(step.shop);
    return { x: s.x, y: s.y };
  }
  if (step.x !== undefined) return { x: step.x, y: step.y };
  return null;
}

function enterStep(G) {
  const m = G.mission;
  const step = stepDef(G);
  if (!step) { completeMission(G); return; }
  m.timer = step.timer || 0;
  m.grabT = 0;
  m.cpIndex = 0;
  if (step.type === "setWanted") {
    // scripted beats SET the level (a job that brings the heat), they do
    // not stack on whatever the player already earned
    G.wanted = Math.max(0, Math.min(5, step.n));
    G.wantedTimer = 12 + G.wanted * 3;
    pushMsg(G, "The APD is on you — wanted level " + G.wanted);
    advanceStep(G);
    return;
  }
  if (step.type === "spawnSports") {
    const s = shopById(step.shop);
    const car = makeCar(G, "sports", s.x + 40, s.y, 0, "parked");
    car.color = "#fdcb6e";
    G.cars.push(car);
    pushMsg(G, "The Aurora GT is parked outside the garage.");
    advanceStep(G);
    return;
  }
  if (step.type === "kill") {
    const s = shopById(step.shop);
    m.killsStart = G.stats.goonsDown;
    m.killsNeeded = step.count;
    for (let i = 0; i < step.count; i++) {
      const goon = makePed(G, s.x + (i - 1.5) * 44, s.y, "goon");
      G.peds.push(goon);
    }
    pushMsg(G, step.count + " armed crew at the docks. Deal with them.");
  }
}

function advanceStep(G) {
  G.mission.step++;
  const def = missionDef(G);
  if (!def || G.mission.step >= def.steps.length) { completeMission(G); return; }
  enterStep(G);
}

function failMission(G, reason) {
  pushMsg(G, "Job failed — " + reason + ". Mama Luz gives you another shot.");
  startMission(G, G.mission.index);
}

function completeMission(G) {
  const def = missionDef(G);
  if (!def) return;
  G.money += def.reward;
  G.stats.missionsDone++;
  if (def.grantPistol && !G.player.hasPistol) {
    G.player.hasPistol = true;
    G.player.ammo = 48;
  }
  G.missionCard = { name: def.name, reward: def.reward, t: 0 };
  pushMsg(G, "Job complete: " + def.name + " (+$" + def.reward + ")");
  if (G.onMissionComplete) G.onMissionComplete(def);
  if (G.mission.index + 1 >= MISSIONS.length) {
    G.mission.done = true;
    G.mode = "complete";
    return;
  }
  startMission(G, G.mission.index + 1);
}

export function currentObjective(G) {
  const step = stepDef(G);
  if (!step) return null;
  if (step.type === "goto" || step.type === "deliver" || step.type === "grab" || step.type === "kill") {
    const pt = stepPoint(step);
    if (pt) return { x: pt.x, y: pt.y, label: step.label };
  }
  if (step.type === "checkpoints") {
    const pt = step.points[Math.min(G.mission.cpIndex, step.points.length - 1)];
    return { x: pt.x, y: pt.y, label: step.label + " (" + (G.mission.cpIndex + 1) + "/" + step.points.length + ")" };
  }
  if (step.type === "steal") return { x: G.player.x, y: G.player.y, label: step.label };
  if (step.type === "enterSports") {
    const s = shopById("garage");
    return { x: s.x, y: s.y, label: step.label };
  }
  if (step.type === "loseWanted") return { x: G.player.x, y: G.player.y, label: step.label };
  return null;
}

export function updateMission(G, dt) {
  const m = G.mission;
  const def = missionDef(G);
  if (!def || m.done) return;
  const step = stepDef(G);
  if (!step) return;
  const p = G.player;

  if (step.timer) {
    m.timer -= dt;
    if (m.timer <= 0) { failMission(G, "out of time"); return; }
  }

  switch (step.type) {
    case "steal":
      if (p.inCar) advanceStep(G);
      break;
    case "goto": {
      const pt = stepPoint(step);
      const r = step.radius || 60;
      if (step.onFoot && p.inCar) break;
      if (dist(p.x, p.y, pt.x, pt.y) < r) advanceStep(G);
      break;
    }
    case "deliver": {
      const pt = stepPoint(step);
      if (dist(p.x, p.y, pt.x, pt.y) < (step.radius || 60)) advanceStep(G);
      break;
    }
    case "loseWanted":
      if (G.wanted === 0) advanceStep(G);
      break;
    case "kill":
      if (G.stats.goonsDown - m.killsStart >= m.killsNeeded) advanceStep(G);
      break;
    case "grab": {
      const pt = stepPoint(step);
      if (dist(p.x, p.y, pt.x, pt.y) < (step.radius || 60)) {
        m.grabT += dt;
        if (m.grabT >= (step.hold || 3)) advanceStep(G);
      } else {
        m.grabT = Math.max(0, m.grabT - dt * 2);
      }
      break;
    }
    case "enterSports": {
      const car = p.inCar ? G.cars.find((c) => c.id === p.inCar) : null;
      if (car && car.type === "sports") advanceStep(G);
      break;
    }
    case "checkpoints": {
      const pt = step.points[Math.min(m.cpIndex, step.points.length - 1)];
      if (dist(p.x, p.y, pt.x, pt.y) < 70) {
        m.cpIndex++;
        if (m.cpIndex >= step.points.length) advanceStep(G);
        else pushMsg(G, "Checkpoint " + m.cpIndex + "/" + step.points.length);
      }
      break;
    }
    default:
      break;
  }
}
