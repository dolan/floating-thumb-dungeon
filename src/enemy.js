// src/enemy.js
// Rule-based enemy AI: idle/patrol → chase (sight + line-of-sight) → attack on
// cooldown when in range → hurt/knockback → dead. Also owns per-room spawning
// of enemies and weapon pickups.

import { isSolidPx, moveCircle, roomPx } from './room.js';
import { hurtPlayer } from './player.js';
import { makeItem } from './weapons.js';

const DEFS = {
  goblin:   { hp: 3, r: 5, speed: 36, sight: 95,  range: 12, dmg: 1, atkCd: 1.0, color: '#6fae4a', sprite: 'goblin' },
  skeleton: { hp: 5, r: 5, speed: 27, sight: 120, range: 13, dmg: 2, atkCd: 1.3, color: '#cdd2da', sprite: 'skeleton' },
};

function makeEnemy(kind, x, y) {
  const d = DEFS[kind];
  return {
    kind, x, y, r: d.r,
    hp: d.hp, maxHp: d.hp, speed: d.speed,
    sight: d.sight, range: d.range, dmg: d.dmg, atkCd: d.atkCd,
    color: d.color, sprite: d.sprite,
    fx: 0, fy: 1, moving: false, animT: 0,
    state: 'idle', cd: 0, hurtT: 0, dead: false,
    kx: 0, ky: 0,
    home: { x, y }, wanderT: 0, wx: 0, wy: 0,
  };
}

export function makeEnemySystem() {
  return { step };
}

// Debug helper: drop a live enemy into the current room.
export function addEnemy(game, kind, x, y) {
  const e = makeEnemy(kind, x, y);
  game.enemies.push(e);
  return e;
}

function step(game, dt) {
  if (game.dbgFreeze) return;       // debug: enemies frozen in place
  const p = game.player;
  const room = game.room;
  for (const e of game.enemies) {
    if (e.dead) continue;

    if (e.hurtT > 0) e.hurtT -= dt;
    if (e.cd > 0) e.cd -= dt;

    // knockback impulse (decays fast)
    if (e.kx || e.ky) {
      const r = moveCircle(room, e.x, e.y, e.r, e.kx * dt * 12, e.ky * dt * 12);
      e.x = r.x; e.y = r.y;
      e.kx *= 0.78; e.ky *= 0.78;
      if (Math.abs(e.kx) < 0.3 && Math.abs(e.ky) < 0.3) { e.kx = 0; e.ky = 0; }
    }

    const dx = p.x - e.x, dy = p.y - e.y;
    const dist = Math.hypot(dx, dy);
    const sees = game.graceT <= 0 && dist < e.sight && lineOfSight(room, e.x, e.y, p.x, p.y);

    if (sees) e.state = 'chase';
    else if (e.state === 'chase' && dist > e.sight * 1.4) e.state = 'idle';

    let vx = 0, vy = 0;
    if (e.state === 'chase') {
      if (dist <= e.range) {
        // in range → attack on cooldown
        if (e.cd <= 0) {
          e.cd = e.atkCd;
          e.attackT = 0.2;
          hurtPlayer(p, e.dmg, e.x, e.y);
        }
      } else {
        const l = dist || 1;
        vx = dx / l; vy = dy / l;
      }
    } else {
      // idle wander: pick a gentle drift target occasionally
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 1.5 + Math.random() * 2;
        const a = Math.random() * Math.PI * 2;
        e.wx = Math.cos(a); e.wy = Math.sin(a);
      }
      if (Math.random() < 0.6) { vx = e.wx * 0.4; vy = e.wy * 0.4; }
    }

    if (vx || vy) {
      const before = { x: e.x, y: e.y };
      const r = moveCircle(room, e.x, e.y, e.r, vx * e.speed * dt, vy * e.speed * dt);
      e.x = r.x; e.y = r.y;
      const mvx = e.x - before.x, mvy = e.y - before.y;
      e.moving = Math.abs(mvx) + Math.abs(mvy) > 0.05;
      if (e.moving) { e.fx = vx; e.fy = vy; e.animT += dt * 6; }
    } else {
      e.moving = false;
    }
  }
}

function lineOfSight(room, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isSolidPx(room, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

// ---- spawning ----
// Called once per room (first entry). Places enemies + a weapon pickup.
export function spawnRoomContents(game, room, key) {
  const rp = roomPx(room);
  const place = (fx, fy) => clampFree(room, rp.w * fx, rp.h * fy);

  if (key === 'A') {
    spawn(game, 'goblin', place(0.3, 0.28));
    spawn(game, 'goblin', place(0.7, 0.72));
    drop(game, 'sword', place(0.5, 0.66));   // just below spawn so the pickup is visible
  } else if (key === 'B') {
    spawn(game, 'goblin', place(0.3, 0.4));
    spawn(game, 'skeleton', place(0.65, 0.35));
    spawn(game, 'goblin', place(0.55, 0.7));
    drop(game, 'gun', place(0.4, 0.55));
  } else if (key === 'C') {
    spawn(game, 'skeleton', place(0.32, 0.35));
    spawn(game, 'skeleton', place(0.68, 0.6));
    drop(game, 'rock', place(0.5, 0.3));
  }
}

function spawn(game, kind, pos) {
  const e = makeEnemy(kind, pos.x, pos.y);
  game.enemies.push(e);
}

function drop(game, kind, pos) {
  const it = makeItem(kind, pos.x, pos.y);
  it.noPickT = 0;     // pre-placed pickups are grabbable immediately
  game.items.push(it);
}

// Nudge a spawn point off any wall tile.
function clampFree(room, x, y) {
  if (!isSolidPx(room, x, y)) return { x, y };
  for (const [ox, oy] of [[16, 0], [-16, 0], [0, 16], [0, -16], [24, 24], [-24, -24]]) {
    if (!isSolidPx(room, x + ox, y + oy)) return { x: x + ox, y: y + oy };
  }
  return { x, y };
}
