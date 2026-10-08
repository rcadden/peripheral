/* fish.js — how the animals move. Pure: no DOM, no three.js, no clock.
 *
 * Roadmap, Sprint 9: "boids for schooling species, species behaviours".
 * Each style is a small state machine stepped with a fixed dt; scene.js reads
 * x, y, depth, facing, tilt and tail phase off each agent and draws it.
 *
 *   school  boids — separation, alignment, cohesion — plus a shared wandering
 *           target so the school drifts across the tank instead of balling up
 *   cruise  a centrepiece gourami: slow glides to chosen spots, hovers, turns
 *   bottom  corydoras: short darts along the substrate, long pauses
 *   cling   otocinclus: parked on wood or glass, rarely shuffling
 *   shrimp  slow walking along the substrate with frequent stops
 *
 * Depth (0 = front glass, 1 = back) drives on-screen scale, fog and draw
 * order. Fish change depth slowly, so they visibly pass in front of and
 * behind the wood.
 */

import { SPECIES } from './species.js';
import { makeRng, makeNoise1 } from './rng.js';
import { W } from './layout.js';

const X_MIN = 60, X_MAX = W - 60;
const TAU = Math.PI * 2;

/** Max tail-beat rate. 4 fps samples at most 2 Hz without aliasing. */
export const MAX_BEAT_HZ = 1.5;

/**
 * @param {ReturnType<import('./layout.js').buildLayout>} layout
 * @param {{perches?: {x:number,y:number}[]}} opts  surfaces otocinclus may sit on
 */
export function createPopulation(layout, { perches = [] } = {}) {
  const r = makeRng(layout.seed ^ 0xf15);
  const agents = [];
  const { school, centerpiece, grazer } = layout.community;

  const spawn = (group, extra = {}) => {
    const sp = SPECIES[group.species];
    for (let i = 0; i < group.count; i++) {
      const [y0, y1] = sp.band;
      agents.push({
        sp,
        x: r.range(200, W - 200),
        y: r.range(y0, y1),
        z: Math.min(0.95, Math.max(0.05, sp.depth + r.range(-0.25, 0.35))),
        vx: r.range(-1, 1) * sp.speed[0],
        vy: r.range(-1, 1) * 3,
        vz: 0,
        facing: r.chance(0.5) ? 1 : -1,
        face: 1,
        phase: r.range(0, TAU),
        tilt: 0,
        timer: r.range(0, 4),
        target: null,
        moving: true,
        jitter: r.range(0, 1000),
        size: r.range(0.88, 1.08),
        ...extra,
      });
    }
  };

  spawn(school);
  if (centerpiece) spawn(centerpiece);
  if (grazer) spawn(grazer);

  // Start each animal facing the way it is moving.
  for (const a of agents) { a.facing = a.vx >= 0 ? 1 : -1; a.face = a.facing; }

  // Otocinclus start parked on a perch, if any are known.
  for (const a of agents) {
    if (a.sp.style === 'cling' && perches.length) {
      const p = r.pick(perches);
      a.x = p.x; a.y = p.y; a.vx = 0; a.vy = 0; a.moving = false;
    }
  }

  const noise = makeNoise1(layout.seed ^ 0x5c);
  return {
    agents,
    /** The school's shared wander target, moved by noise. */
    schoolTarget: { x: W / 2, y: 230 },
    rng: r,
    noise,
    perches,
    t: 0,
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function limit(a, lo, hi) {
  const s = Math.hypot(a.vx, a.vy);
  if (s > hi) { a.vx *= hi / s; a.vy *= hi / s; }
  else if (s < lo && s > 0.0001) { a.vx *= lo / s; a.vy *= lo / s; }
}

/** Steer softly away from the walls and out of the wrong part of the water. */
function bounds(a, dt) {
  const [y0, y1] = a.sp.band;
  const k = 40 * dt;
  if (a.x < X_MIN + 80) a.vx += k * (1 - (a.x - X_MIN) / 80);
  if (a.x > X_MAX - 80) a.vx -= k * (1 - (X_MAX - a.x) / 80);
  if (a.y < y0 + 20) a.vy += k * 0.5;
  if (a.y > y1 - 20) a.vy -= k * 0.5;
  a.x = clamp(a.x, X_MIN - 20, X_MAX + 20);
  a.y = clamp(a.y, y0 - 10, y1 + 10);
}

function stepSchool(pop, dt) {
  const fish = pop.agents.filter((a) => a.sp.style === 'school');
  if (!fish.length) return;
  const sp = fish[0].sp;
  // The shared target wanders across the whole tank on a slow noise path.
  const t = pop.t;
  pop.schoolTarget.x = W / 2 + pop.noise(t * 0.018) * (W / 2 - 180);
  pop.schoolTarget.y = (sp.band[0] + sp.band[1]) / 2 + pop.noise(t * 0.03 + 50) * (sp.band[1] - sp.band[0]) * 0.35;

  for (const a of fish) {
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
    for (const b of fish) {
      if (a === b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 110) continue;
      n++;
      ax += b.vx; ay += b.vy;
      cx += b.x; cy += b.y;
      const sep = sp.length * 0.9;
      if (d < sep && d > 0.01) { sx -= (dx / d) * (sep - d); sy -= (dy / d) * (sep - d); }
    }
    if (n) {
      a.vx += ((ax / n) - a.vx) * 0.6 * dt;
      a.vy += ((ay / n) - a.vy) * 0.6 * dt;
      a.vx += ((cx / n) - a.x) * 0.18 * dt;
      a.vy += ((cy / n) - a.y) * 0.18 * dt;
    }
    a.vx += sx * 1.6 * dt;
    a.vy += sy * 1.6 * dt;
    a.vx += (pop.schoolTarget.x - a.x) * 0.05 * dt;
    a.vy += (pop.schoolTarget.y - a.y) * 0.08 * dt;
    // Individual wobble so the school never looks like one sprite.
    a.vx += pop.noise(t * 0.5 + a.jitter) * 6 * dt;
    a.vy += pop.noise(t * 0.4 + a.jitter + 300) * 5 * dt;
    a.vy *= 1 - 0.8 * dt; // fish swim level, not up and down
    limit(a, sp.speed[0], sp.speed[1]);
    bounds(a, dt);
  }
}

function stepCruise(pop, a, dt) {
  const r = pop.rng;
  a.timer -= dt;
  if (!a.target || a.timer <= 0) {
    // Alternate gliding to a spot and hovering there.
    a.moving = !a.moving || !a.target;
    a.target = { x: r.range(X_MIN + 120, X_MAX - 120), y: r.range(...a.sp.band) };
    a.timer = a.moving ? r.range(8, 16) : r.range(3, 7);
  }
  if (a.moving) {
    const dx = a.target.x - a.x, dy = a.target.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    a.vx += (dx / d) * 6 * dt;
    a.vy += (dy / d) * 3 * dt;
    if (d < 20) a.timer = 0;
  } else {
    a.vx *= 1 - 1.2 * dt;
    a.vy *= 1 - 1.2 * dt;
  }
  limit(a, 0, a.sp.speed[1]);
  bounds(a, dt);
}

function stepBottom(pop, a, dt) {
  const r = pop.rng;
  a.timer -= dt;
  if (a.timer <= 0) {
    a.moving = !a.moving;
    if (a.moving) {
      const dir = r.chance(0.5) ? 1 : -1;
      a.vx = dir * r.range(...a.sp.speed);
      a.timer = r.range(1.2, 3);
    } else {
      a.timer = r.range(2, 6);
    }
  }
  if (!a.moving) a.vx *= 1 - 3 * dt;
  a.vy = (a.sp.band[0] + (a.sp.band[1] - a.sp.band[0]) * (1 - a.z) - a.y) * 1.5;
  bounds(a, dt);
}

function stepCling(pop, a, dt) {
  const r = pop.rng;
  a.timer -= dt;
  if (a.timer <= 0) {
    a.moving = r.chance(0.35);
    a.timer = a.moving ? r.range(1, 2.5) : r.range(10, 30);
    if (a.moving) {
      const p = pop.perches.length ? r.pick(pop.perches) : { x: a.x + r.range(-60, 60), y: a.y + r.range(-30, 30) };
      a.target = p;
    }
  }
  if (a.moving && a.target) {
    a.vx = (a.target.x - a.x) * 0.8;
    a.vy = (a.target.y - a.y) * 0.8;
    limit(a, 0, a.sp.speed[1] * 4);
  } else {
    a.vx *= 1 - 4 * dt; a.vy *= 1 - 4 * dt;
  }
}

function stepShrimp(pop, a, dt) {
  const r = pop.rng;
  a.timer -= dt;
  if (a.timer <= 0) {
    a.moving = r.chance(0.6);
    a.timer = a.moving ? r.range(1.5, 4) : r.range(2, 6);
    if (a.moving) a.vx = (r.chance(0.5) ? 1 : -1) * r.range(...a.sp.speed);
  }
  if (!a.moving) a.vx *= 1 - 5 * dt;
  a.vy = (a.sp.band[0] + (a.sp.band[1] - a.sp.band[0]) * (1 - a.z) - a.y) * 1.5;
  bounds(a, dt);
}

/**
 * Advance the population by `dt` seconds. Call with small steps (scene.js
 * sub-steps at 1/20 s) — the forces assume it.
 */
export function step(pop, dt) {
  pop.t += dt;
  stepSchool(pop, dt);
  for (const a of pop.agents) {
    switch (a.sp.style) {
      case 'cruise': stepCruise(pop, a, dt); break;
      case 'bottom': stepBottom(pop, a, dt); break;
      case 'cling': stepCling(pop, a, dt); break;
      case 'shrimp': stepShrimp(pop, a, dt); break;
      default: break;
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;

    // Depth drifts slowly for swimmers, so they pass in front of and behind
    // the wood rather than living on one plane.
    if (a.sp.style === 'school' || a.sp.style === 'cruise') {
      a.vz += pop.noise(pop.t * 0.07 + a.jitter + 700) * 0.02 * dt;
      a.vz *= 1 - 0.5 * dt;
      a.z = clamp(a.z + a.vz * dt, 0.05, 0.95);
    }

    // Facing follows horizontal motion with hysteresis; `face` eases through
    // zero, which the vertex shader renders as the fish turning side-on.
    const speed = Math.hypot(a.vx, a.vy);
    if (Math.abs(a.vx) > 3) a.facing = a.vx > 0 ? 1 : -1;
    a.face += clamp(a.facing - a.face, -2.2 * dt, 2.2 * dt);

    const climb = speed > 1 ? Math.atan2(a.vy, Math.abs(a.vx)) : 0;
    a.tilt += (clamp(climb, -0.35, 0.35) - a.tilt) * Math.min(1, 3 * dt);

    // Tail beat: faster when swimming, a lazy flutter when hovering.
    const beat = Math.min(MAX_BEAT_HZ, a.sp.beatHz * (0.45 + 0.75 * Math.min(1, speed / a.sp.speed[1])));
    a.phase = (a.phase + TAU * beat * dt) % TAU;
  }
}
