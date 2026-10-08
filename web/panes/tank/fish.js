/* fish.js — how the animals move. Pure: no DOM, no three.js, no clock.
 *
 * Built to docs/plans/fish-behaviour-spec.md, approved by Ricky 2026-10-08
 * after three invented models were rejected on the glass ("following a
 * current… instead of milling about in the tank"). The spec's sources are
 * Ricky's reference clips and Deskworlds' riverscape fish
 * (github.com/chaseleantj/deskworlds, MIT), minus its river current.
 *
 * THE ONE IDEA: the population stays put and individuals move. Nothing moves
 * a shoal's zone. Each fish mostly hovers on a station, makes short trips in
 * bursts and glides, and sometimes follows a neighbour that just left.
 *
 *   school  hover / travel / settle, with recruitment and loose spacing,
 *           inside the shoal's zone (layout.js gives each shoal one)
 *   cruise  a centrepiece gourami: long hovers by plants and wood, slow
 *           glides, sometimes inspects a spot nose-first
 *   bottom  corydoras: short scoots, foraging pauses, a rare dash to the top
 *   cling   otocinclus: parked on wood or glass, rarely shuffling
 *   shrimp  slow walking along the substrate with frequent stops
 *
 * Units: school and cruise motion is in BODY LENGTHS (BL) so it survives any
 * size change (the 2026-10-08 doubling broke a fixed-px constant). Depth z is
 * 0 at the front glass and 1 at the back; for direction it counts as DEPTH_PX
 * of travel, so a fish heading for the back of the tank turns toward it and
 * the shader foreshortens it (face ~ cos(yaw)), as in Ricky's clip 5.
 */

import { SPECIES } from './species.js';
import { makeRng, makeNoise1 } from './rng.js';
import { W } from './layout.js';

const X_MIN = 60, X_MAX = W - 60;
const TAU = Math.PI * 2;
/** How far the tank's depth counts as, in px, when choosing a heading. */
const DEPTH_PX = 360;
const Z_MIN = 0.08, Z_MAX = 0.88;

/** Max tail-beat rate. At ~8-10 fps anything over ~3-4 Hz aliases; the spec
 * raised this from 1.5 (set for 4 fps) to 2.5. */
export const MAX_BEAT_HZ = 2.5;

/* ── the spec's numbers (BL = body length, s = seconds) ─────────────────── */
const SHOAL = {
  excursionMean: 4.5,   // s between leaving station, exponential, / character
  twitchMean: 7,        // s between flicks/turns while hovering
  turn: [0.17, 0.65],   // rad per flick
  flip: 0.3,            // chance a flick reverses the turn direction
  aboutFace: 0.15,      // chance a flick is a full turn through head-on
  hoverTurnRate: 1.2,   // rad/s for in-place turns
  travelTurnRate: 1.8,  // rad/s while swimming
  driftBack: 0.5,       // BL/s, max, back to the station
  peak: 2.0,            // BL/s, burst speed while travelling
  gaitHz: 1.6,          // burst-and-coast cycles per second
  coast: [0.3, 0.65],   // fraction of each cycle spent gliding
  tripBL: [2, 6],       // a short trip
  wideTrip: 0.25,       // chance a trip goes anywhere in the zone
  chain: 0.7,           // chance of another trip on arrival
  settle: 1.2,          // s gliding to a stop
  spacing: 1.5,         // BL to the nearest neighbour
  crowded: 0.8,         // BL — closer than this, flick away
  isolated: 4,          // BL — nobody this close, head back to the others
  recruitRange: 2,      // BL
  recruitWindow: 1.2,   // s after a neighbour departs
  recruitRate: 0.15,    // per s
  maxTravelling: 0.3,   // fraction of a shoal off on a trip at once
};

const CRUISE = {
  hover: [5, 15], glide: [1, 3], peak: 0.8, inspect: [3, 8], inspectChance: 0.35,
};

const BOTTOM = {
  scoot: [1, 3], scootSpeed: 1.5, forage: [2, 6], dashMean: 120, group: 4,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const expo = (r, mean) => -mean * Math.log(1 - r.next() * 0.999);

/**
 * @param {ReturnType<import('./layout.js').buildLayout>} layout
 * @param {{perches?: {x:number,y:number}[]}} opts  surfaces otocinclus may sit on
 */
export function createPopulation(layout, { perches = [] } = {}) {
  const r = makeRng(layout.seed ^ 0xf15);
  const agents = [];
  const { school, school2, centerpiece, grazer } = layout.community;

  const spawn = (group, groupId) => {
    const sp = SPECIES[group.species];
    const zone = group.zone ?? { x: [X_MIN, X_MAX], y: sp.band };
    for (let i = 0; i < group.count; i++) {
      const x = r.range(zone.x[0] + 40, zone.x[1] - 40);
      const y = r.range(zone.y[0] + 10, zone.y[1] - 10);
      const z = clamp(sp.depth + r.range(-0.25, 0.3), Z_MIN, Z_MAX);
      const yaw = (r.chance(0.5) ? 0 : Math.PI) + r.range(-0.4, 0.4);
      agents.push({
        sp, group: groupId, zone,
        x, y, z,
        vx: 0, vy: 0, vz: 0,
        yaw, yawTarget: yaw, yawRate: SHOAL.hoverTurnRate,
        facing: Math.cos(yaw) >= 0 ? 1 : -1,
        face: Math.cos(yaw),
        phase: r.range(0, TAU),
        tilt: 0, restTilt: r.range(-0.12, 0.12),
        speed: 0, gait: r.range(0, 1), amp: 0.03, beat: sp.beatHz * 0.5,
        character: r.range(0.8, 1.2),
        mode: 'hover',
        anchor: { x, y, z },
        goal: null, until: 0, departed: -Infinity, recruited: false,
        nextExcursion: r.range(0.5, 6), nextTwitch: r.range(0.5, 5),
        turnSign: r.chance(0.5) ? 1 : -1,
        // Legacy fields used by the bottom / cling / shrimp styles.
        timer: r.range(0, 4), target: null, moving: false,
        nextDash: r.range(20, 140), dashing: 0,
        jitter: r.range(0, 1000),
        size: r.range(0.88, 1.08),
      });
    }
  };

  spawn(school, 0);
  if (school2) spawn(school2, 1);
  if (centerpiece) spawn(centerpiece, 2);
  if (grazer) spawn(grazer, 3);

  // Bottom dwellers and shrimp start with a nominal heading from their pose.
  for (const a of agents) {
    if (a.sp.style !== 'school' && a.sp.style !== 'cruise') { a.face = a.facing; a.yaw = a.facing > 0 ? 0 : Math.PI; }
  }
  // Otocinclus start parked on a perch, if any are known.
  for (const a of agents) {
    if (a.sp.style === 'cling' && perches.length) {
      const p = r.pick(perches);
      a.x = p.x; a.y = p.y; a.vx = 0; a.vy = 0; a.moving = false;
    }
  }

  return { agents, rng: r, noise: makeNoise1(layout.seed ^ 0x5c), perches, t: 0 };
}

/* ── shared helpers ─────────────────────────────────────────────────────── */

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

/** Keep a point inside a zone (and the species band), with a margin. */
function inZone(a, p) {
  const z = a.zone, [b0, b1] = a.sp.band;
  p.x = clamp(p.x, Math.max(X_MIN + 30, z.x[0]), Math.min(X_MAX - 30, z.x[1]));
  p.y = clamp(p.y, Math.max(b0 + 10, z.y[0]), Math.min(b1 - 10, z.y[1]));
  p.z = clamp(p.z, Z_MIN + 0.04, Z_MAX - 0.04);
  return p;
}

/** Distance in px with depth counted as DEPTH_PX. */
const dist3 = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, (b.z - a.z) * DEPTH_PX);

/** Turn toward a heading, at most `rate` rad/s. */
function steerYaw(a, target, rate, dt) {
  const d = wrap(target - a.yaw);
  a.yaw = wrap(a.yaw + clamp(d, -rate * dt, rate * dt));
}

/** Swim along the current heading at `a.speed` (px/s), pitched toward dy. */
function moveAlongHeading(a, pitch) {
  const c = Math.cos(pitch);
  a.vx = a.speed * Math.cos(a.yaw) * c;
  a.vz = (a.speed * Math.sin(a.yaw) * c) / DEPTH_PX;
  a.vy = a.speed * Math.sin(pitch);
}

/* ── shoaling species ───────────────────────────────────────────────────── */

function stepShoal(pop, fish, dt) {
  const r = pop.rng, t = pop.t;
  const travelling = fish.filter((f) => f.mode === 'travel').length;
  const cap = Math.max(1, Math.ceil(fish.length * SHOAL.maxTravelling));

  for (const a of fish) {
    const BL = a.sp.length * a.size;

    // What the fish can see: nearest neighbour, a fresh departure, the group.
    let nearest = null, nearestD = Infinity, leader = null, leaderD = Infinity;
    let cx = 0, cy = 0, cz = 0, n = 0, sx = 0, sy = 0, sz = 0;
    for (const b of fish) {
      if (b === a) continue;
      const d = dist3(a, b);
      cx += b.x; cy += b.y; cz += b.z; n++;
      if (d < nearestD) { nearest = b; nearestD = d; }
      if (b.mode === 'travel' && !b.recruited && t - b.departed < SHOAL.recruitWindow &&
          d < SHOAL.recruitRange * BL && d < leaderD) { leader = b; leaderD = d; }
      if (d < SHOAL.spacing * BL && d > 0.01) {
        const k = (SHOAL.spacing * BL - d) / (SHOAL.spacing * BL);
        sx += ((a.x - b.x) / d) * k; sy += ((a.y - b.y) / d) * k; sz += ((a.z - b.z) * DEPTH_PX / d) * k;
      }
    }

    const leave = (fromLeader) => {
      const goal = fromLeader
        ? { x: fromLeader.goal.x + r.range(-0.9, 0.9) * BL, y: fromLeader.goal.y + r.range(-0.3, 0.3) * BL,
            z: fromLeader.goal.z + r.range(-0.08, 0.08) }
        : nearestD > SHOAL.isolated * BL && n
          // Left behind: head back toward the others.
          ? { x: cx / n + r.range(-1, 1) * BL, y: cy / n + r.range(-0.5, 0.5) * BL, z: cz / n }
          : r.chance(SHOAL.wideTrip)
            ? { x: r.range(...a.zone.x), y: r.range(...a.zone.y), z: r.range(Z_MIN, Z_MAX) }
            : (() => {
                const len = r.range(...SHOAL.tripBL) * BL;
                const ang = r.range(0, TAU);
                return { x: a.x + Math.cos(ang) * len, y: a.y + r.range(-1.5, 1.5) * BL,
                         z: a.z + Math.sin(ang) * len / DEPTH_PX * 0.6 };
              })();
      a.goal = inZone(a, goal);
      a.mode = 'travel';
      a.recruited = Boolean(fromLeader);
      a.departed = fromLeader ? -Infinity : t; // followers never recruit others
      a.until = t + dist3(a, a.goal) / (SHOAL.peak * 0.5 * BL) + 2;
    };
    const settle = () => { a.mode = 'settle'; a.until = t + SHOAL.settle * r.range(0.8, 1.3); };
    const hover = () => {
      a.mode = 'hover';
      a.anchor = { x: a.x, y: a.y, z: a.z };
      a.nextExcursion = t + expo(r, SHOAL.excursionMean / a.character);
      a.nextTwitch = t + expo(r, SHOAL.twitchMean);
    };
    const twitch = (away) => {
      a.nextTwitch = t + expo(r, SHOAL.twitchMean);
      a.restTilt = r.range(-0.12, 0.12);
      if (away) {
        a.yawTarget = Math.atan2(away.z, away.x);
      } else if (r.chance(SHOAL.aboutFace)) {
        a.yawTarget = wrap(a.yaw + Math.PI * (r.chance(0.5) ? 1 : -1) * r.range(0.85, 1));
      } else {
        if (r.chance(SHOAL.flip)) a.turnSign = -a.turnSign;
        a.yawTarget = wrap(a.yaw + a.turnSign * r.range(...SHOAL.turn));
      }
      a.speed = Math.max(a.speed, 0.4 * BL); // a small push with the flick
    };

    if (a.mode === 'hover') {
      const crowded = nearestD < SHOAL.crowded * BL;
      const recruited = leader && r.next() < dt * SHOAL.recruitRate;
      if (recruited) leave(leader);
      else if (t >= a.nextExcursion) {
        if (travelling < cap || nearestD > SHOAL.isolated * BL) leave(null);
        else a.nextExcursion = t + r.range(0.5, 1.5);
      } else if (crowded) twitch({ x: a.x - nearest.x, z: (a.z - nearest.z) * DEPTH_PX });
      else if (t >= a.nextTwitch) twitch(null);
    }

    if (a.mode === 'travel') {
      const dx = a.goal.x - a.x, dy = a.goal.y - a.y, dz = (a.goal.z - a.z) * DEPTH_PX;
      const remaining = Math.hypot(dx, dy, dz);
      if (remaining < 0.6 * BL || t > a.until) {
        if (r.chance(SHOAL.chain) && travelling < cap) leave(null); else settle();
      } else {
        steerYaw(a, Math.atan2(dz, dx), SHOAL.travelTurnRate, dt);
        // Burst and coast: thrust for part of each cycle, glide for the rest.
        a.gait = (a.gait + SHOAL.gaitHz * a.character * dt) % 1;
        const coast = SHOAL.coast[0] + (SHOAL.coast[1] - SHOAL.coast[0]) * ((a.jitter % 1));
        const bursting = a.gait > coast;
        const ease = Math.min(1, 0.25 + remaining / (1.5 * BL));
        const peak = SHOAL.peak * BL * a.character * ease;
        if (bursting) a.speed += (peak - a.speed) * Math.min(1, 6 * dt);
        else a.speed *= 1 - 1.4 * dt;
        a.amp = bursting ? 0.06 : 0.015;
        a.beat = bursting ? MAX_BEAT_HZ : a.sp.beatHz * 0.4;
        const pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz) || 1), -0.35, 0.35);
        moveAlongHeading(a, pitch);
      }
    }

    if (a.mode === 'settle') {
      a.speed *= 1 - 2.2 * dt;
      a.amp = 0.02; a.beat = a.sp.beatHz * 0.4;
      moveAlongHeading(a, 0);
      if (t > a.until) hover();
    }

    if (a.mode === 'hover') {
      // Station keeping: the anchor follows the fish very slowly (it does not
      // hold a fixed point forever), and a displaced fish drifts back to it.
      // Depth is NOT followed: a measured run had flicks and spacing nudges
      // random-walk z into the front/back limits (16-34% of samples). On
      // station, depth holds; trips are what change it.
      const k = 1 - Math.exp(-dt / 10);
      a.anchor.x += (a.x - a.anchor.x) * k; a.anchor.y += (a.y - a.anchor.y) * k;
      steerYaw(a, a.yawTarget, SHOAL.hoverTurnRate, dt);
      a.speed *= 1 - 2.5 * dt; // the flick's push decays
      moveAlongHeading(a, 0);
      const back = SHOAL.driftBack * BL; // px/s
      a.vx += clamp((a.anchor.x - a.x) * 0.6, -back, back);
      a.vy += clamp((a.anchor.y - a.y) * 0.6, -back, back);
      a.vz = clamp((a.anchor.z - a.z) * 0.8, -0.06, 0.06);
      a.amp = 0.025; a.beat = a.sp.beatHz * 0.45;
    }

    // Loose spacing: a gentle shove apart, in every state.
    const push = 0.5 * BL;
    a.vx += sx * push; a.vy += sy * push * 0.5; a.vz += (sz * push * 0.3) / DEPTH_PX;
    // Soft walls short of the depth limits.
    if (a.z < Z_MIN + 0.08) a.vz += (Z_MIN + 0.08 - a.z) * 2;
    if (a.z > Z_MAX - 0.08) a.vz -= (a.z - (Z_MAX - 0.08)) * 2;

    // Facing follows the heading; the shader foreshortens through head-on.
    a.face = Math.cos(a.yaw);
    a.facing = a.face >= 0 ? 1 : -1;
    const climb = a.mode === 'travel' ? Math.atan2(a.vy, Math.abs(a.vx) + 1) : a.restTilt;
    a.tilt += (clamp(climb, -0.35, 0.35) - a.tilt) * Math.min(1, 3 * dt);
  }
}

/* ── centrepiece ────────────────────────────────────────────────────────── */

function stepCruise(pop, a, dt) {
  const r = pop.rng, t = pop.t, BL = a.sp.length * a.size;
  if (t >= a.until) {
    if (a.mode === 'hover') {
      // Off to somewhere nearby — sometimes a perch on the wood to inspect.
      const p = pop.perches.length && r.chance(CRUISE.inspectChance)
        ? { ...r.pick(pop.perches), z: r.range(0.2, 0.6), inspect: true }
        : (() => { const len = r.range(...CRUISE.glide) * BL, ang = r.range(0, TAU);
            return { x: a.x + Math.cos(ang) * len, y: a.y + r.range(-0.6, 0.6) * BL, z: a.z + Math.sin(ang) * len / DEPTH_PX * 0.6 }; })();
      a.goal = inZone(a, p);
      a.goal.inspect = p.inspect;
      a.mode = 'travel';
      a.until = t + 20;
    } else {
      a.mode = 'hover';
      a.anchor = { x: a.x, y: a.y, z: a.z };
      a.until = t + r.range(...(a.mode === 'inspect' ? CRUISE.inspect : CRUISE.hover));
      a.nextTwitch = t + expo(r, SHOAL.twitchMean);
    }
  }
  if (a.mode === 'travel') {
    const dx = a.goal.x - a.x, dy = a.goal.y - a.y, dz = (a.goal.z - a.z) * DEPTH_PX;
    const remaining = Math.hypot(dx, dy, dz);
    if (remaining < 0.4 * BL) {
      a.mode = a.goal.inspect ? 'inspect' : 'hover';
      a.anchor = { x: a.x, y: a.y, z: a.z };
      a.until = t + r.range(...(a.mode === 'inspect' ? CRUISE.inspect : CRUISE.hover));
    } else {
      steerYaw(a, Math.atan2(dz, dx), 0.8, dt);
      const want = CRUISE.peak * BL * Math.min(1, 0.3 + remaining / (2 * BL));
      a.speed += (want - a.speed) * Math.min(1, 1.5 * dt);
      moveAlongHeading(a, clamp(Math.atan2(dy, Math.hypot(dx, dz) || 1), -0.25, 0.25));
      a.amp = 0.04; a.beat = a.sp.beatHz;
    }
  } else {
    // Hover or inspect: hold station; inspecting adds small pecks forward.
    if (t >= a.nextTwitch && a.mode === 'hover') {
      a.nextTwitch = t + expo(r, SHOAL.twitchMean);
      a.yawTarget = r.chance(0.25) ? wrap(a.yaw + Math.PI) : wrap(a.yaw + r.range(-0.5, 0.5));
    }
    if (a.mode === 'hover') steerYaw(a, a.yawTarget ?? a.yaw, 0.6, dt);
    a.speed *= 1 - 2 * dt;
    if (a.mode === 'inspect' && r.next() < dt * 0.8) a.speed = 0.25 * BL;
    moveAlongHeading(a, 0);
    a.vx += clamp((a.anchor.x - a.x) * 0.5, -0.3 * BL, 0.3 * BL);
    a.vy += clamp((a.anchor.y - a.y) * 0.5, -0.3 * BL, 0.3 * BL);
    a.amp = 0.02; a.beat = a.sp.beatHz * 0.4;
  }
  a.face = Math.cos(a.yaw);
  a.facing = a.face >= 0 ? 1 : -1;
  const climb = a.mode === 'travel' ? Math.atan2(a.vy, Math.abs(a.vx) + 1) : a.restTilt;
  a.tilt += (clamp(climb, -0.25, 0.25) - a.tilt) * Math.min(1, 2 * dt);
}

/* ── bottom dwellers ────────────────────────────────────────────────────── */

function stepBottom(pop, a, dt) {
  const r = pop.rng, t = pop.t, BL = a.sp.length * a.size;
  const [y0, y1] = a.sp.band;
  const floorY = y0 + (y1 - y0) * (1 - a.z);

  // A rare dash to the surface and back — a real corydoras habit.
  if (!a.dashing && t >= a.nextDash) { a.dashing = 1; a.nextDash = t + expo(r, BOTTOM.dashMean); }
  if (a.dashing === 1) {
    a.vy = -3 * BL; a.vx *= 1 - 2 * dt;
    if (a.y < 75) a.dashing = 2;
  } else if (a.dashing === 2) {
    a.vy = 2 * BL; a.vx *= 1 - 2 * dt;
    if (a.y >= floorY) { a.dashing = 0; a.y = floorY; }
  } else {
    a.timer -= dt;
    if (a.timer <= 0) {
      a.moving = !a.moving;
      if (a.moving) {
        // Scoot, drifting back toward the group if it has wandered off.
        const mates = pop.agents.filter((b) => b !== a && b.sp === a.sp);
        const mx = mates.length ? mates.reduce((s, b) => s + b.x, 0) / mates.length : a.x;
        const toward = Math.abs(mx - a.x) > BOTTOM.group * BL ? Math.sign(mx - a.x) : (r.chance(0.5) ? 1 : -1);
        a.vx = toward * BOTTOM.scootSpeed * BL * r.range(0.7, 1.1);
        a.timer = r.range(...BOTTOM.scoot) / BOTTOM.scootSpeed;
      } else {
        a.timer = r.range(...BOTTOM.forage);
      }
    }
    if (!a.moving) a.vx *= 1 - 3 * dt;
    a.vy = (floorY - a.y) * 1.5;
  }
  if (!a.dashing) bounds(a, dt);
  else a.x = clamp(a.x, X_MIN - 20, X_MAX + 20);
  if (Math.abs(a.vx) > 3) a.facing = a.vx > 0 ? 1 : -1;
  a.face += clamp(a.facing - a.face, -2.2 * dt, 2.2 * dt);
  const nose = a.dashing === 1 ? -0.6 : a.dashing === 2 ? 0.4 : a.moving ? 0 : 0.25; // nose down to forage
  a.tilt += (nose - a.tilt) * Math.min(1, 3 * dt);
  a.amp = a.moving || a.dashing ? 0.05 : 0.02;
  a.beat = Math.min(MAX_BEAT_HZ, a.sp.beatHz * (a.moving || a.dashing ? 1.5 : 0.5));
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
  legacyFacing(a, dt);
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
  legacyFacing(a, dt);
  a.amp = 0;
}

/** Facing from horizontal motion with hysteresis — the pre-spec rule, kept for
 * animals that walk or cling rather than swim. */
function legacyFacing(a, dt) {
  if (Math.abs(a.vx) > 3) a.facing = a.vx > 0 ? 1 : -1;
  a.face += clamp(a.facing - a.face, -2.2 * dt, 2.2 * dt);
  const speed = Math.hypot(a.vx, a.vy);
  const climb = speed > 1 ? Math.atan2(a.vy, Math.abs(a.vx)) : 0;
  a.tilt += (clamp(climb, -0.35, 0.35) - a.tilt) * Math.min(1, 3 * dt);
  a.beat = Math.min(MAX_BEAT_HZ, a.sp.beatHz * (0.45 + 0.75 * Math.min(1, speed / a.sp.speed[1])));
}

/**
 * Advance the population by `dt` seconds. Call with small steps (scene.js
 * sub-steps at 1/20 s) — the forces assume it.
 */
export function step(pop, dt) {
  pop.t += dt;
  for (const g of [0, 1]) {
    const shoal = pop.agents.filter((a) => a.group === g && a.sp.style === 'school');
    if (shoal.length) stepShoal(pop, shoal, dt);
  }
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
    if (a.sp.style === 'school' || a.sp.style === 'cruise') {
      a.z = clamp(a.z + a.vz * dt, Z_MIN, Z_MAX);
      // Hard limits only — the zone shapes where fish choose to go.
      a.x = clamp(a.x, X_MIN - 20, X_MAX + 20);
      a.y = clamp(a.y, a.sp.band[0] - 10, a.sp.band[1] + 10);
    }
    a.phase = (a.phase + TAU * Math.min(MAX_BEAT_HZ, a.beat) * dt) % TAU;
  }
}
