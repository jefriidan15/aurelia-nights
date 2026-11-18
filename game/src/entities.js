// Aurelia Nights — entities: player, traffic, pedestrians, police, goons,
// bullets, pickups and particles. All simulation, no drawing (see render.js).
import {
  CAR_TYPES, CAR_COLORS, PED_COLORS, WORLD, ROAD_STEP, ROAD_W,
  clamp, dist, angleTo, angleDiff, pick, range, rangeInt,
} from "./util.js";
import { collideCircle, moveCircle, onRoad, randomIntersection, nearestRoadPoint, shopById } from "./world.js";

let nextId = 1;

export function makeCar(G, type, x, y, angle, kind) {
  const t = CAR_TYPES[type];
  return {
    id: nextId++, type, x, y, angle, speed: 0, kind: kind || "parked",
    color: pick(G.rng, CAR_COLORS), health: t.hp, maxHealth: t.hp,
    driver: kind === "traffic", cruise: range(G.rng, 120, 200),
    road: "v", line: Math.round(x / ROAD_STEP) * ROAD_STEP, dir: 1,
    target: { x, y }, stuck: 0, reverse: 0, smokeT: 0,
  };
}

export function makePed(G, x, y, kind) {
  return {
    id: nextId++, kind: kind || "walk", x, y, angle: range(G.rng, 0, Math.PI * 2),
    speed: kind === "goon" ? 0 : range(G.rng, 30, 55), hp: kind === "goon" ? 60 : 30,
    color: pick(G.rng, PED_COLORS), from: { x, y }, to: randomIntersection(G.rng, G.city),
    wait: 0, down: 0, shootCd: range(G.rng, 0.5, 1.5), fleeX: 0, fleeY: 0,
  };
}

export function spawnTraffic(G, n) {
  for (let i = 0; i < n; i++) {
    const p = randomIntersection(G.rng, G.city);
    const type = pick(G.rng, ["sedan", "sedan", "taxi", "truck", "van", "sports"]);
    const c = makeCar(G, type, p.x, p.y, pick(G.rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), "traffic");
    c.road = G.rng() < 0.5 ? "v" : "h";
    c.line = c.road === "v" ? p.x : p.y;
    c.dir = G.rng() < 0.5 ? 1 : -1;
    pickNextTarget(G, c);
    G.cars.push(c);
  }
}

export function spawnPeds(G, n) {
  for (let i = 0; i < n; i++) {
    const p = randomIntersection(G.rng, G.city);
    G.peds.push(makePed(G, p.x + range(G.rng, -40, 40), p.y + range(G.rng, -40, 40), "walk"));
  }
}

export function spawnParked(G, n) {
  for (let i = 0; i < n; i++) {
    const p = randomIntersection(G.rng, G.city);
    const type = pick(G.rng, ["sedan", "sedan", "taxi", "van", "sports", "truck"]);
    const angle = pick(G.rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const off = 18;
    const x = p.x + (Math.abs(angle) < 0.1 || Math.abs(angle - Math.PI) < 0.1 ? 0 : (angle > 0 ? off : -off));
    const y = p.y + (Math.abs(angle) < 0.1 || Math.abs(angle - Math.PI) < 0.1 ? (angle === 0 ? off : -off) : 0);
    G.cars.push(makeCar(G, type, x, y, angle, "parked"));
  }
}

function pickNextTarget(G, c) {
  // keep rolling along the current road to the next intersection
  const step = ROAD_STEP;
  if (c.road === "v") {
    const ny = c.y + c.dir * step;
    c.target = { x: c.line, y: clamp(ny, 0, WORLD) };
  } else {
    const nx = c.x + c.dir * step;
    c.target = { x: clamp(nx, 0, WORLD), y: c.line };
  }
}

function atIntersection(G, c) {
  if (c.road === "v") return (c.dir > 0 && c.y >= c.target.y - 4) || (c.dir < 0 && c.y <= c.target.y + 4);
  return (c.dir > 0 && c.x >= c.target.x - 4) || (c.dir < 0 && c.x <= c.target.x + 4);
}

function chooseTurn(G, c) {
  const r = G.rng();
  const vertical = c.road === "v";
  if (r < 0.55) { pickNextTarget(G, c); return; } // straight on
  // turn onto the crossing road
  if (vertical) {
    c.road = "h";
    c.line = c.target.y;
    c.dir = G.rng() < 0.5 ? 1 : -1;
    c.y = c.line;
  } else {
    c.road = "v";
    c.line = c.target.x;
    c.dir = G.rng() < 0.5 ? 1 : -1;
    c.x = c.line;
  }
  pickNextTarget(G, c);
}

export function nearestCar(G, x, y, maxD) {
  let best = null, bd = maxD;
  for (const c of G.cars) {
    if (c.kind === "gone") continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function addWanted(G, n, reason) {
  const before = G.wanted;
  G.wanted = clamp(G.wanted + n, 0, 5);
  if (G.wanted > before) {
    G.wantedTimer = 12 + G.wanted * 3;
    pushMsg(G, reason + " — wanted level " + G.wanted);
  }
}

export function pushMsg(G, text) {
  G.msg.unshift({ text, t: 0 });
  if (G.msg.length > 5) G.msg.pop();
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

export function spawnParticles(G, x, y, n, color, speed, life, size) {
  for (let i = 0; i < n; i++) {
    const a = range(G.rng, 0, Math.PI * 2);
    const s = range(G.rng, speed * 0.3, speed);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: range(G.rng, life * 0.5, life), maxLife: life, color, size: range(G.rng, size * 0.6, size * 1.4) });
  }
}

export function dropPickup(G, x, y, kind, amount) {
  G.pickups.push({ x, y, kind, amount, t: 0 });
}

// ---- player ----
export function updatePlayer(G, input, sound, dt, cam) {
  const p = G.player;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  const car = p.inCar ? G.cars.find((c) => c.id === p.inCar) : null;

  if (car) {
    updatePlayerCar(G, input, sound, dt, car);
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    return;
  }

  // on foot
  const ax = input.axis();
  const run = input.any("ShiftLeft", "ShiftRight");
  const spd = run ? 250 : 155;
  let dx = ax.x, dy = ax.y;
  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; p.angle = Math.atan2(dy, dx); }
  const moved = moveCircle(G.city, p.x, p.y, 12, dx * spd * dt, dy * spd * dt);
  p.x = moved.x; p.y = moved.y;
  p.moving = len > 0;

  // aim with the mouse (world space)
  const wx = cam.x + input.mouseX;
  const wy = cam.y + input.mouseY;
  p.aim = angleTo(p.x, p.y, wx, wy);

  // attack
  if ((input.mouseDown || input.wasPressed("KeyF")) && p.punchCd <= 0) {
    if (p.hasPistol && p.ammo > 0) {
      p.ammo--;
      p.fireCd = 0.22; p.punchCd = 0.22;
      G.bullets.push({ x: p.x + Math.cos(p.aim) * 18, y: p.y + Math.sin(p.aim) * 18, angle: p.aim, speed: 950, life: 0.7, from: "player", dmg: 34 });
      spawnParticles(G, p.x + Math.cos(p.aim) * 22, p.y + Math.sin(p.aim) * 22, 3, "#ffd32a", 120, 0.15, 3);
      sound.shot();
      G.stats.shotsFired++;
    } else {
      p.punchCd = 0.38;
      sound.punch();
      const hx = p.x + Math.cos(p.aim) * 30, hy = p.y + Math.sin(p.aim) * 30;
      for (const ped of G.peds) {
        if (ped.kind === "goon" && ped.hp > 0 && dist(hx, hy, ped.x, ped.y) < 26) {
          hurtPed(G, ped, 25, "player");
        }
      }
      for (const cop of G.cops) {
        if (cop.onFoot && dist(hx, hy, cop.x, cop.y) < 26) hurtCop(G, cop, 25);
      }
    }
  }

  // enter a car
  if (input.wasPressed("KeyE")) tryEnterCar(G, sound);
  // interact with shops (gun / diner / spray need a car for spray)
  if (input.wasPressed("KeyE")) tryShop(G, sound, false);
}

// Move a car with axis-separated sliding along walls, so a nose graze
// does not wedge it dead: try the full move, then x-only, then y-only.
// Returns 0 = moved fully, 1 = slid along a wall, 2 = fully blocked.
export function moveCar(G, car, nx, ny) {
  const t = CAR_TYPES[car.type];
  const inset = t.len / 2 - 4;
  const blocked = (x, y) => {
    const nX = x + Math.cos(car.angle) * inset, nY = y + Math.sin(car.angle) * inset;
    const tX = x - Math.cos(car.angle) * inset, tY = y - Math.sin(car.angle) * inset;
    return collideCircle(G.city, nX, nY, 10) || collideCircle(G.city, tX, tY, 10);
  };
  if (!blocked(nx, ny)) { car.x = nx; car.y = ny; return 0; }
  if (!blocked(nx, car.y)) { car.x = nx; car.speed *= 0.6; return 1; }
  if (!blocked(car.x, ny)) { car.y = ny; car.speed *= 0.6; return 1; }
  return 2;
}

function updatePlayerCar(G, input, sound, dt, car) {
  const t = CAR_TYPES[car.type];
  const up = input.any("KeyW", "ArrowUp");
  const down = input.any("KeyS", "ArrowDown");
  const left = input.any("KeyA", "ArrowLeft");
  const right = input.any("KeyD", "ArrowRight");
  const brake = input.any("Space");
  if (up) car.speed += t.accel * dt;
  if (down) car.speed -= t.accel * 0.9 * dt;
  if (brake) car.speed -= Math.sign(car.speed) * 420 * dt;
  car.speed -= car.speed * 0.55 * dt; // drag + rolling resistance
  car.speed = clamp(car.speed, -t.top * 0.45, t.top);
  if (Math.abs(car.speed) < 4 && !up && !down) car.speed = 0;
  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  const grip = brake ? t.grip * 1.5 : t.grip;
  // keep a little steering authority at crawl speed so a car wedged on a
  // wall can still turn its wheels and get out (arcade handling)
  car.angle += steer * grip * 0.55 * dt * clamp(Math.abs(car.speed) / 120, 0.25, 1) * Math.sign(car.speed || 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const wasSpeed = car.speed;
  const moved = moveCar(G, car, nx, ny);
  if (moved === 2) {
    // fully blocked: only a hard hit counts as a crash
    if (Math.abs(wasSpeed) > 130) {
      sound.crash();
      spawnParticles(G, car.x + Math.cos(car.angle) * (t.len / 2), car.y + Math.sin(car.angle) * (t.len / 2), 10, "#ffa502", 200, 0.5, 3);
      damageCar(G, car, Math.floor(Math.abs(wasSpeed) / 14));
      G.shake = Math.min(10, Math.abs(wasSpeed) / 40);
    }
    car.speed *= -0.25;
  }
  // car vs car
  for (const o of G.cars) {
    if (o === car || o.kind === "gone") continue;
    const d = dist(car.x, car.y, o.x, o.y);
    const minD = 36;
    if (d < minD && d > 0.01) {
      const push = (minD - d) / 2;
      const a = angleTo(o.x, o.y, car.x, car.y);
      car.x += Math.cos(a) * push;
      car.y += Math.sin(a) * push;
      o.x -= Math.cos(a) * push;
      o.y -= Math.sin(a) * push;
      const impact = Math.abs(car.speed - o.speed);
      if (impact > 90) {
        sound.crash();
        spawnParticles(G, (car.x + o.x) / 2, (car.y + o.y) / 2, 8, "#ffa502", 180, 0.4, 3);
        damageCar(G, car, Math.floor(impact / 22));
        damageCar(G, o, Math.floor(impact / 22));
        if (o.kind === "traffic" && o.driver && impact > 160) ejectDriver(G, o);
        car.speed *= 0.55;
        o.speed *= 0.4;
      }
    }
  }
  // running over pedestrians
  for (const ped of G.peds) {
    if (ped.kind === "down" || ped.hp <= 0) continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 26 && Math.abs(car.speed) > 60) {
      const wasGoon = ped.kind === "goon";
      ped.hp = 0; ped.kind = "down"; ped.down = 0;
      spawnParticles(G, ped.x, ped.y, 10, "#c0392b", 160, 0.5, 3);
      if (wasGoon) { G.stats.goonsDown++; dropPickup(G, ped.x, ped.y, "cash", 40); }
      else { addWanted(G, 1, "Pedestrian down"); G.stats.pedsHit++; }
      car.speed *= 0.85;
    }
  }
  // exit car
  if (input.wasPressed("KeyE")) exitCar(G, sound);
  // spray shop while driving through it
  if (input.wasPressed("KeyE")) tryShop(G, sound, true);
  // wreck smoke
  if (car.health < 45) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = 0.12;
      spawnParticles(G, car.x + range(G.rng, -8, 8), car.y + range(G.rng, -8, 8), 1, "#636e72", 30, 0.9, 6);
    }
  }
}

function tryEnterCar(G, sound) {
  const p = G.player;
  const car = nearestCar(G, p.x, p.y, 58);
  if (!car) return;
  if (car.health <= 0) { pushMsg(G, "That car is wrecked."); sound.denied(); return; }
  if (car.kind === "traffic" && car.driver) {
    ejectDriver(G, car);
    addWanted(G, 1, "Grand theft auto");
    G.stats.carsStolen++;
  } else if (car.kind === "traffic") {
    G.stats.carsStolen++;
  }
  car.kind = "player";
  car.speed = 0;
  p.inCar = car.id;
  sound.pickup();
  pushMsg(G, "You took the " + CAR_TYPES[car.type].name + ".");
}

function ejectDriver(G, car) {
  car.driver = false;
  const ped = makePed(G, car.x + 30, car.y, "walk");
  ped.fleeX = car.x + 300; ped.fleeY = car.y;
  ped.kind = "flee";
  G.peds.push(ped);
}

export function exitCar(G, sound) {
  const p = G.player;
  const car = G.cars.find((c) => c.id === p.inCar);
  if (!car) { p.inCar = null; return; }
  const side = car.angle + Math.PI / 2;
  const px = car.x + Math.cos(side) * 34;
  const py = car.y + Math.sin(side) * 34;
  const spot = collideCircle(G.city, px, py, 12) ? { x: car.x - Math.cos(side) * 34, y: car.y - Math.sin(side) * 34 } : { x: px, y: py };
  p.x = spot.x; p.y = spot.y;
  p.inCar = null;
  car.kind = "parked";
  car.speed = 0;
  if (sound) sound.blip(440, 0.08, "sine", 0.12);
}

function tryShop(G, sound, inCar) {
  const p = G.player;
  for (const s of G.city.shops) {
    if (dist(p.x, p.y, s.x, s.y) > 70) continue;
    if (s.kind === "gun" && !inCar) {
      if (p.hasPistol) { pushMsg(G, "You already own the pistol."); sound.denied(); }
      else if (G.money >= 300) { G.money -= 300; p.hasPistol = true; p.ammo = 48; pushMsg(G, "Bought the AP-9 pistol. 48 rounds."); sound.pickup(); }
      else { pushMsg(G, "Ironworks: AP-9 pistol costs $300."); sound.denied(); }
      return;
    }
    if (s.kind === "diner" && !inCar) {
      if (G.money >= 20 && G.health < 100) { G.money -= 20; G.health = 100; pushMsg(G, "Burger Barn: patched up, health full."); sound.pickup(); }
      else if (G.health >= 100) { pushMsg(G, "You are already at full health."); sound.denied(); }
      else { pushMsg(G, "Burger Barn: a meal costs $20."); sound.denied(); }
      return;
    }
    if (s.kind === "spray" && inCar) {
      if (G.wanted > 0 && G.money >= 100) { G.money -= 100; G.wanted = 0; G.wantedTimer = 0; pushMsg(G, "Respray done. The heat is off."); sound.jingle(); }
      else if (G.wanted === 0) { pushMsg(G, "No heat on you right now."); sound.denied(); }
      else { pushMsg(G, "Spray Shop: a respray costs $100."); sound.denied(); }
      return;
    }
    if (s.kind === "safehouse" && !inCar) {
      pushMsg(G, "Safehouse — progress saved.");
      sound.pickup();
      if (G.onSave) G.onSave();
      return;
    }
  }
}

export function damageCar(G, car, dmg) {
  car.health -= dmg;
  if (car.health <= 0) {
    car.health = 0;
    car.speed = 0;
    spawnParticles(G, car.x, car.y, 16, "#2d3436", 120, 1.0, 5);
    if (car.kind === "player") {
      pushMsg(G, "Your car is wrecked!");
      exitCar(G, null);
    } else if (car.kind === "police") {
      car.kind = "parked";
      G.stats.copsDown++;
    }
  }
}

export function hurtPed(G, ped, dmg, from) {
  ped.hp -= dmg;
  spawnParticles(G, ped.x, ped.y, 5, "#c0392b", 120, 0.4, 3);
  if (ped.hp <= 0) {
    if (ped.kind === "goon") {
      ped.kind = "down"; ped.down = 0;
      dropPickup(G, ped.x, ped.y, "cash", 40);
      G.stats.goonsDown++;
    } else {
      ped.kind = "down"; ped.down = 0;
      if (from === "player") addWanted(G, 1, "Pedestrian down");
    }
  } else if (ped.kind === "walk") {
    ped.kind = "flee";
  }
}

export function hurtCop(G, cop, dmg) {
  cop.hp -= dmg;
  if (cop.hp <= 0) {
    cop.hp = 0;
    cop.down = 1;
    addWanted(G, 2, "Officer down");
    G.stats.copsDown++;
  }
}

// ---- traffic + pedestrians ----
export function updateTraffic(G, dt) {
  for (const c of G.cars) {
    if (c.kind !== "traffic" || c.health <= 0) continue;
    if (atIntersection(G, c)) chooseTurn(G, c);
    // car ahead in the same lane?
    let blocked = false;
    for (const o of G.cars) {
      if (o === c || o.kind === "gone") continue;
      const ahead = c.road === "v"
        ? Math.abs(o.x - c.x) < 30 && (o.y - c.y) * c.dir > 0 && (o.y - c.y) * c.dir < 78
        : Math.abs(o.y - c.y) < 30 && (o.x - c.x) * c.dir > 0 && (o.x - c.x) * c.dir < 78;
      if (ahead) { blocked = true; break; }
    }
    const target = blocked ? 0 : c.cruise;
    c.speed += clamp(target - c.speed, -260 * dt, 170 * dt);
    const laneOff = c.dir > 0 ? 14 : -14;
    if (c.road === "v") {
      c.x += (c.line + laneOff - c.x) * Math.min(1, dt * 3);
      const ny = c.y + c.dir * c.speed * dt;
      c.y = clamp(ny, 0, WORLD);
      c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      c.y += (c.line + laneOff - c.y) * Math.min(1, dt * 3);
      const nx = c.x + c.dir * c.speed * dt;
      c.x = clamp(nx, 0, WORLD);
      c.angle = c.dir > 0 ? 0 : Math.PI;
    }
  }
  // despawn far traffic, keep the streets alive
  const p = G.player;
  G.cars = G.cars.filter((c) => {
    if (c.kind === "traffic" && dist(c.x, c.y, p.x, p.y) > 1400) return false;
    return true;
  });
  const trafficCount = G.cars.filter((c) => c.kind === "traffic").length;
  if (trafficCount < 26) spawnTraffic(G, 26 - trafficCount);
}

export function updatePeds(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.kind === "down") {
      ped.down += dt;
      continue;
    }
    if (ped.kind === "goon" && ped.hp > 0) {
      updateGoon(G, ped, dt);
      continue;
    }
    if (ped.kind === "flee") {
      ped.angle = angleTo(ped.x, ped.y, ped.fleeX, ped.fleeY);
      const moved = moveCircle(G.city, ped.x, ped.y, 10, Math.cos(ped.angle) * 150 * dt, Math.sin(ped.angle) * 150 * dt);
      ped.x = moved.x; ped.y = moved.y;
      if (dist(ped.x, ped.y, p.x, p.y) > 500) ped.kind = "walk";
      continue;
    }
    // walk: head for the waypoint, pick a new one on arrival
    if (dist(ped.x, ped.y, ped.to.x, ped.to.y) < 24) {
      ped.from = { x: ped.x, y: ped.y };
      ped.to = randomIntersection(G.rng, G.city);
    }
    ped.angle = angleTo(ped.x, ped.y, ped.to.x, ped.to.y);
    const moved = moveCircle(G.city, ped.x, ped.y, 10, Math.cos(ped.angle) * ped.speed * dt, Math.sin(ped.angle) * ped.speed * dt);
    if (moved.hit) { ped.to = randomIntersection(G.rng, G.city); }
    ped.x = moved.x; ped.y = moved.y;
  }
  G.peds = G.peds.filter((ped) => !(ped.kind === "down" && ped.down > 8) && dist(ped.x, ped.y, p.x, p.y) < 1600);
  const walkers = G.peds.filter((x) => x.kind === "walk").length;
  if (walkers < 42) spawnPeds(G, 42 - walkers);
}

function updateGoon(G, goon, dt) {
  const p = G.player;
  const d = dist(goon.x, goon.y, p.x, p.y);
  if (d < 460) {
    goon.angle = angleTo(goon.x, goon.y, p.x, p.y);
    if (d > 180) {
      const moved = moveCircle(G.city, goon.x, goon.y, 10, Math.cos(goon.angle) * 120 * dt, Math.sin(goon.angle) * 120 * dt);
      goon.x = moved.x; goon.y = moved.y;
    }
    goon.shootCd -= dt;
    if (goon.shootCd <= 0 && d < 420) {
      goon.shootCd = range(G.rng, 0.9, 1.6);
      G.bullets.push({ x: goon.x, y: goon.y, angle: goon.angle + range(G.rng, -0.09, 0.09), speed: 700, life: 0.8, from: "goon", dmg: 9 });
    }
  }
}

// ---- police ----
export function updatePolice(G, dt, sound) {
  const p = G.player;
  // desired strength follows the wanted level
  const wantCars = G.wanted;
  const wantFoot = G.wanted >= 2 && !p.inCar ? Math.min(3, G.wanted - 1) : 0;
  const copCars = G.cops.filter((c) => !c.onFoot && c.hp > 0);
  const copFoot = G.cops.filter((c) => c.onFoot && c.hp > 0);
  if (copCars.length < wantCars) spawnCopCar(G);
  if (copFoot.length < wantFoot) spawnCopFoot(G);
  // heat decay: only when no cop can see the player
  let seen = false;
  for (const c of G.cops) if (c.hp > 0 && dist(c.x, c.y, p.x, p.y) < 340) { seen = true; break; }
  if (G.wanted > 0) {
    if (seen) G.wantedTimer = 12 + G.wanted * 3;
    else {
      G.wantedTimer -= dt;
      if (G.wantedTimer <= 0) { G.wanted--; G.wantedTimer = 9; if (G.wanted === 0) pushMsg(G, "You lost the cops."); }
    }
  }
  for (const cop of G.cops) {
    if (cop.hp <= 0) { cop.down += dt; continue; }
    if (cop.onFoot) updateCopFoot(G, cop, dt);
    else updateCopCar(G, cop, dt);
  }
  G.cops = G.cops.filter((c) => !(c.hp <= 0 && c.down > 6) && dist(c.x, c.y, p.x, p.y) < 1700);
  sound.setSiren(G.wanted > 0 && G.cops.some((c) => c.hp > 0 && dist(c.x, c.y, p.x, p.y) < 500));
}

function spawnCopCar(G) {
  const p = G.player;
  const a = range(G.rng, 0, Math.PI * 2);
  let x = p.x + Math.cos(a) * 520, y = p.y + Math.sin(a) * 520;
  x = clamp(x, 60, WORLD - 60); y = clamp(y, 60, WORLD - 60);
  const rp = { x: Math.round(x / ROAD_STEP) * ROAD_STEP, y: Math.round(y / ROAD_STEP) * ROAD_STEP };
  const c = makeCar(G, "police", rp.x, rp.y, angleTo(rp.x, rp.y, p.x, p.y), "police");
  c.color = "#1e3799";
  G.cars.push(c);
  G.cops.push({ x: c.x, y: c.y, angle: c.angle, speed: 0, onFoot: false, carId: c.id, hp: 100, down: 0, stuck: 0, reverse: 0, punchCd: 0 });
}

function spawnCopFoot(G) {
  const p = G.player;
  const a = range(G.rng, 0, Math.PI * 2);
  const rp = nearestRoadPoint(clamp(p.x + Math.cos(a) * 320, 40, WORLD - 40), clamp(p.y + Math.sin(a) * 320, 40, WORLD - 40));
  G.cops.push({ x: rp.x, y: rp.y, angle: 0, speed: 0, onFoot: true, carId: 0, hp: 100, down: 0, stuck: 0, reverse: 0, punchCd: 0 });
}

function updateCopCar(G, cop, dt) {
  const p = G.player;
  const car = G.cars.find((c) => c.id === cop.carId);
  if (!car || car.health <= 0) { cop.hp = 0; cop.down = 0; return; }
  const t = CAR_TYPES.police;
  const top = Math.min(430, 295 + G.wanted * 26);
  const desired = angleTo(car.x, car.y, p.x + Math.cos(p.angle || 0) * 30, p.y + Math.sin(p.angle || 0) * 30);
  const diff = angleDiff(car.angle, desired);
  car.speed = clamp(car.speed + 320 * dt, 0, top);
  car.angle += clamp(diff, -1, 1) * Math.min(1, Math.abs(diff)) * 2.6 * dt * clamp(car.speed / 100, 0.3, 1);
  if (cop.reverse > 0) {
    cop.reverse -= dt;
    car.speed = -120;
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const moved = moveCar(G, car, nx, ny);
  if (moved === 2) {
    cop.stuck += dt;
    if (cop.stuck > 1.2) { cop.reverse = 0.8; cop.stuck = 0; }
    car.speed *= 0.4;
  } else {
    cop.stuck = 0;
  }
  cop.x = car.x; cop.y = car.y; cop.angle = car.angle; cop.speed = car.speed;
  // ram the player
  const pcar = p.inCar ? G.cars.find((c) => c.id === p.inCar) : null;
  if (pcar && dist(car.x, car.y, pcar.x, pcar.y) < 38) {
    if (Math.abs(car.speed) > 120) {
      damageCar(G, pcar, 3);
      spawnParticles(G, (car.x + pcar.x) / 2, (car.y + pcar.y) / 2, 6, "#ffa502", 160, 0.4, 3);
      car.speed *= 0.7;
    } else {
      car.speed *= 0.92; // nudge, don't pin the player car at crawl speed
    }
  } else if (!pcar && dist(car.x, car.y, p.x, p.y) < 30 && Math.abs(car.speed) > 60) {
    hurtPlayer(G, 12, "cop");
    car.speed *= 0.4;
  }
}

function updateCopFoot(G, cop, dt) {
  const p = G.player;
  cop.punchCd = Math.max(0, cop.punchCd - dt);
  const d = dist(cop.x, cop.y, p.x, p.y);
  if (d > 26) {
    cop.angle = angleTo(cop.x, cop.y, p.x, p.y);
    const moved = moveCircle(G.city, cop.x, cop.y, 11, Math.cos(cop.angle) * 205 * dt, Math.sin(cop.angle) * 205 * dt);
    cop.x = moved.x; cop.y = moved.y;
  } else if (cop.punchCd <= 0 && !p.inCar) {
    cop.punchCd = 1.0;
    hurtPlayer(G, 10, "cop");
    pushMsg(G, "APD is beating you down — run!");
  }
}

export function hurtPlayer(G, dmg, from) {
  const p = G.player;
  if (p.hurtCd > 0) return;
  p.hurtCd = 0.5;
  G.health -= dmg;
  G.shake = 6;
  spawnParticles(G, p.x, p.y, 6, "#c0392b", 140, 0.4, 3);
  if (G.health <= 0) {
    G.health = 0;
    G.mode = G.wanted > 0 || from === "cop" ? "busted" : "wasted";
    if (G.onBusted) G.onBusted(G.mode);
  }
}

// ---- bullets / pickups / particles ----
export function updateBullets(G, dt) {
  for (const b of G.bullets) {
    b.life -= dt;
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    if (collideCircle(G.city, b.x, b.y, 2)) {
      b.life = 0;
      spawnParticles(G, b.x, b.y, 4, "#fdcb6e", 120, 0.3, 2);
      continue;
    }
    const p = G.player;
    if (b.from !== "player") {
      if (!p.inCar && dist(b.x, b.y, p.x, p.y) < 14) { b.life = 0; hurtPlayer(G, b.dmg, b.from); continue; }
      const pcar = p.inCar ? G.cars.find((c) => c.id === p.inCar) : null;
      if (pcar && dist(b.x, b.y, pcar.x, pcar.y) < 24) { b.life = 0; damageCar(G, pcar, 4); continue; }
    } else {
      for (const ped of G.peds) {
        if (ped.kind === "goon" && ped.hp > 0 && dist(b.x, b.y, ped.x, ped.y) < 14) { b.life = 0; hurtPed(G, ped, b.dmg, "player"); break; }
      }
      if (b.life <= 0) continue;
      for (const cop of G.cops) {
        if (cop.hp > 0 && cop.onFoot && dist(b.x, b.y, cop.x, cop.y) < 14) { b.life = 0; hurtCop(G, cop, b.dmg); break; }
      }
      if (b.life <= 0) continue;
      for (const c of G.cars) {
        if ((c.kind === "police" || c.kind === "traffic") && c.health > 0 && dist(b.x, b.y, c.x, c.y) < 24) {
          b.life = 0;
          damageCar(G, c, 8);
          if (c.kind === "police") addWanted(G, 1, "Shooting at the APD");
          break;
        }
      }
    }
  }
  G.bullets = G.bullets.filter((b) => b.life > 0);
}

export function updatePickups(G, dt, sound) {
  const p = G.player;
  for (const pk of G.pickups) {
    pk.t += dt;
    const d = dist(pk.x, pk.y, p.x, p.y);
    if (d < 46) { pk.x += (p.x - pk.x) * dt * 6; pk.y += (p.y - pk.y) * dt * 6; }
    if (d < 22) {
      pk.t = 999;
      if (pk.kind === "cash") { G.money += pk.amount; pushMsg(G, "Picked up " + "$" + pk.amount + "."); }
      if (pk.kind === "health") { G.health = Math.min(100, G.health + pk.amount); pushMsg(G, "Health +" + pk.amount + "."); }
      if (pk.kind === "ammo") { p.ammo += pk.amount; pushMsg(G, "Ammo +" + pk.amount + "."); }
      sound.pickup();
    }
  }
  G.pickups = G.pickups.filter((pk) => pk.t < 30);
}

export function updateParticles(G, dt) {
  for (const pt of G.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
  }
  G.particles = G.particles.filter((pt) => pt.life > 0);
}
