// Aurelia Nights — staged states for screenshots (?shot=start|play|wanted|end).
// Deterministic scenes built from the real game state, no fake pixels.
import { makeCar, pushMsg } from "./entities.js";
import { shopById } from "./world.js";
import { startMission } from "./missions.js";

export function applyShot(G, name) {
  const p = G.player;
  if (name === "start") {
    G.mode = "title";
    p.x = 1300; p.y = 1300;
    return;
  }
  if (name === "play") {
    G.mode = "playing";
    startMission(G, 1); // Courier Run: package at the docks
    const car = makeCar(G, "sports", 1300, 1300, 0, "player");
    car.color = "#e17055";
    G.cars.push(car);
    p.inCar = car.id;
    p.x = 1300; p.y = 1300;
    pushMsg(G, "New job — Courier Run: pick up the package at Dockyard 7.");
    return;
  }
  if (name === "wanted") {
    G.mode = "playing";
    startMission(G, 2); // Hot Pursuit
    const car = makeCar(G, "sedan", 1300, 1560, 0, "player");
    car.color = "#c0392b";
    G.cars.push(car);
    p.inCar = car.id;
    p.x = 1300; p.y = 1560;
    G.wanted = 3;
    G.wantedTimer = 30;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const cop = makeCar(G, "police", p.x + Math.cos(a) * 260, p.y + Math.sin(a) * 260, a, "police");
      cop.color = "#1e3799";
      G.cars.push(cop);
      G.cops.push({ x: cop.x, y: cop.y, angle: cop.angle, speed: 200, onFoot: false, carId: cop.id, hp: 100, down: 0, stuck: 0, reverse: 0, punchCd: 0 });
    }
    pushMsg(G, "The APD is on you — wanted level 3.");
    return;
  }
  if (name === "end") {
    G.mode = "playing";
    G.money = 2350;
    G.stats.missionsDone = 6;
    G.mission.index = 5;
    G.mission.done = true;
    const marina = shopById("marina");
    const car = makeCar(G, "sports", marina.x - 40, marina.y, Math.PI / 2, "player");
    car.color = "#fdcb6e";
    G.cars.push(car);
    p.inCar = car.id;
    p.x = marina.x - 40; p.y = marina.y;
    G.missionCard = { name: "King of Aurelia", reward: 1500, t: 0 };
    pushMsg(G, "Job complete: King of Aurelia (+$1,500)");
    return;
  }
}
