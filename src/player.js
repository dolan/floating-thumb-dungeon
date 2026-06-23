// src/player.js
// Player entity: movement (analog from the floating joystick), 8-direction
// facing, weapon equip/swap, and attack timing. Combat resolution lives in
// weapons.js / world step; this module owns the player's own state.

import { input, setFacing, MODES } from './input.js';
import { moveCircle } from './room.js';
import { sfx } from './audio.js';

export function makePlayer(x, y) {
  return {
    x, y, r: 5,
    speed: 64,               // logical px / sec
    fx: 0, fy: 1,            // facing unit vector (default: south)
    hp: 8, maxHp: 8,         // a little roomier so you can settle into the controls
    weapon: 'fists',
    moving: false,
    animT: 0,                // walk-cycle phase
    attackT: 0,              // remaining attack-anim time (sword swing etc.)
    cooldown: 0,             // remaining time before next attack allowed
    hurtT: 0,                // i-frames / hit flash
  };
}

export function updatePlayer(p, dt, room) {
  // apply knockback through collision so a hit near a wall can't bury us in it
  if (p.knock) {
    const r = moveCircle(room, p.x, p.y, p.r, p.knock.x, p.knock.y);
    p.x = r.x; p.y = r.y;
    p.knock = null;
  }

  const mv = input.move;
  const mag = Math.hypot(mv.x, mv.y);
  p.moving = input.moveActive && mag > 0.02;

  if (p.moving) {
    p.fx = mv.x / mag;
    p.fy = mv.y / mag;
    setFacing({ x: p.fx, y: p.fy });
    const vx = mv.x * p.speed * dt, vy = mv.y * p.speed * dt;
    if (p.noClip) { p.x += vx; p.y += vy; }       // debug: ignore walls
    else { const r = moveCircle(room, p.x, p.y, p.r, vx, vy); p.x = r.x; p.y = r.y; }
    p.animT += dt * (4 + mag * 4);
  } else {
    p.animT = 0;
  }

  // While aiming a throw, face the aim so the sprite + held item point where it
  // will go — the "apparent" cue that the throw is no longer hidden under the thumb.
  if (MODES.faceAim && input.aim.active) {
    p.fx = input.aim.x; p.fy = input.aim.y;
    setFacing({ x: p.fx, y: p.fy });
  }

  if (p.attackT > 0) p.attackT -= dt;
  if (p.cooldown > 0) p.cooldown -= dt;
  if (p.hurtT > 0) p.hurtT -= dt;
}

export function hurtPlayer(p, dmg, fromX, fromY) {
  if (p.god) return;                // debug invulnerability
  if (p.hurtT > 0) return;          // i-frames
  p.hp = Math.max(0, p.hp - dmg);
  p.hurtT = 0.6;
  sfx.play('hurt');
  // small knockback
  const dx = p.x - fromX, dy = p.y - fromY, l = Math.hypot(dx, dy) || 1;
  p.knock = { x: dx / l * 6, y: dy / l * 6 };
}
