// src/weapons.js
// Weapon definitions + behaviors: fists, sword, gun, rock. Handles the A action
// (use equipped weapon), the B action (throw equipped item along an aim vector),
// projectile simulation, floor pickups, and equip/swap. Held-weapon rendering
// is procedural and drawn in front of the player along the facing vector.

import { isSolidPx } from './room.js';
import { sfx } from './audio.js';

const WEAPONS = {
  fists: { melee: true, reach: 13, arc: 0.9, dmg: 1, cd: 0.32, fx: 'punch' },
  sword: { melee: true, reach: 22, arc: 1.15, dmg: 3, cd: 0.42, fx: 'swing' },
  rock:  { melee: true, reach: 13, arc: 0.8, dmg: 2, cd: 0.40, fx: 'punch' },
  gun:   { melee: false, dmg: 2, cd: 0.5, bulletSpeed: 165 },
};

export function makeItem(kind, x, y) {
  return { kind, x, y, bob: Math.random() * 6, taken: false, noPickT: 0.55 };
}

export function makeWeaponSystem() {
  return { tryAttack, throwItem, step };
}

// ---- A: use equipped weapon ----
function tryAttack(game) {
  const p = game.player;
  if (p.cooldown > 0) return;
  const w = WEAPONS[p.weapon];
  p.cooldown = w.cd;

  if (w.melee) {
    p.attackT = 0.18;
    meleeHit(game, p, w);
    const ang = Math.atan2(p.fy, p.fx);
    if (w.fx === 'swing') {
      sfx.play('swing');
      game.effects.push({ type: 'swing', x: p.x + p.fx * 5, y: p.y + p.fy * 5 - 4, angle: ang, reach: w.reach, alpha: 1, t: 0, life: 0.18 });
    } else {
      sfx.play('punch');
      game.effects.push({ type: 'punch', x: p.x + p.fx * w.reach * 0.7, y: p.y + p.fy * w.reach * 0.7 - 4, alpha: 1, t: 0, life: 0.14 });
    }
  } else {
    p.attackT = 0.1;
    sfx.play('shoot');
    spawnBullet(game, p, w);
  }
}

function meleeHit(game, p, w) {
  const fang = Math.atan2(p.fy, p.fx);
  for (const e of game.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > w.reach + (e.r || 5)) continue;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), fang)) <= w.arc) {
      damageEnemy(e, w.dmg, dx, dy);
    }
  }
}

function spawnBullet(game, p, w) {
  const l = Math.hypot(p.fx, p.fy) || 1;
  game.projectiles.push({
    x: p.x + p.fx * 8, y: p.y + p.fy * 8 - 4,
    vx: p.fx / l * w.bulletSpeed, vy: p.fy / l * w.bulletSpeed,
    kind: 'bullet', dmg: w.dmg, r: 2, life: 1.1, fromPlayer: true,
  });
}

// ---- B: throw the equipped item ----
function throwItem(game, aim) {
  const p = game.player;
  if (p.weapon === 'fists') return;   // nothing to throw with bare hands
  const itemKind = p.weapon;
  const spd = itemKind === 'rock' ? 150 : 132;
  const dmg = itemKind === 'sword' ? 3 : 2;
  game.projectiles.push({
    x: p.x + aim.ax * 8, y: p.y + aim.ay * 8 - 4,
    vx: aim.ax * spd, vy: aim.ay * spd,
    kind: 'thrown', itemKind, dmg, r: 3, life: 1.6, fromPlayer: true,
  });
  p.weapon = 'fists';                 // item leaves the hand; revert to fists
  p.cooldown = 0.25;
  sfx.play('throw');
}

// ---- per-step simulation ----
function step(game, dt) {
  const room = game.room;
  const p = game.player;

  for (const pr of game.projectiles) {
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    if (isSolidPx(room, pr.x, pr.y)) { land(game, pr); pr.dead = true; continue; }
    let hit = false;
    for (const e of game.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - pr.x, e.y - pr.y) < (e.r || 5) + (pr.r || 2)) {
        damageEnemy(e, pr.dmg, pr.vx, pr.vy);
        hit = true; break;
      }
    }
    if (hit) { land(game, pr); pr.dead = true; continue; }
    if (pr.life <= 0) { land(game, pr); pr.dead = true; }
  }
  game.projectiles = game.projectiles.filter(pr => !pr.dead);

  // floor pickups: walking over equips (swaps); thrown items are retrievable
  for (const it of game.items) {
    if (it.taken) continue;
    it.bob += dt * 3;
    if (it.noPickT > 0) { it.noPickT -= dt; continue; }
    if (Math.hypot(it.x - p.x, it.y - p.y) < 10) equip(game, it);
  }
  game.items = game.items.filter(it => !it.taken);
}

// A thrown weapon (not a bullet) becomes a retrievable floor pickup on landing.
function land(game, pr) {
  if (pr.kind !== 'thrown') return;
  sfx.play('land');
  game.items.push(makeItem(pr.itemKind, pr.x, pr.y));
}

function equip(game, it) {
  const p = game.player;
  const prev = p.weapon;
  it.taken = true;
  p.weapon = it.kind;
  sfx.play(it.kind === 'rock' ? 'pickup' : 'equip');
  if (prev && prev !== 'fists') {
    const dropped = makeItem(prev, p.x, p.y);
    dropped.noPickT = 0.7;            // don't instantly re-grab what we dropped
    game.items.push(dropped);
  }
}

function damageEnemy(e, dmg, dx, dy) {
  e.hp -= dmg;
  e.hurtT = 0.25;
  const l = Math.hypot(dx, dy) || 1;
  e.kx = dx / l * 11; e.ky = dy / l * 11;
  if (e.hp <= 0) { e.dead = true; sfx.play('death'); }
  else sfx.play('hit');
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---- procedural held-weapon rendering (drawn in front of player) ----
export function drawHeldWeapon(ctx, p) {
  if (p.weapon === 'fists') return;
  const ang = Math.atan2(p.fy, p.fx);
  ctx.save();
  ctx.translate(p.x + p.fx * 7, p.y + p.fy * 7 - 5);
  ctx.rotate(ang);
  if (p.weapon === 'sword') {
    if (p.attackT > 0) ctx.rotate(-0.6 + (0.18 - p.attackT) / 0.18 * 1.2);  // swing sweep
    ctx.fillStyle = '#cfd6e6'; ctx.fillRect(0, -1.5, 13, 3);
    ctx.fillStyle = '#e9eef7'; ctx.fillRect(10, -1.5, 3, 3);
    ctx.fillStyle = '#8a6b3a'; ctx.fillRect(-3, -2.5, 4, 5);
  } else if (p.weapon === 'gun') {
    ctx.fillStyle = '#9aa0b5'; ctx.fillRect(0, -2, 9, 4);
    ctx.fillStyle = '#6b4a22'; ctx.fillRect(-2, 0, 3, 4);
  } else if (p.weapon === 'rock') {
    ctx.fillStyle = '#8a7d6b'; ctx.beginPath(); ctx.arc(6, 0, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#9c8e79'; ctx.beginPath(); ctx.arc(5, -1, 1.5, 0, 7); ctx.fill();
  }
  ctx.restore();
}
