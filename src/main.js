// src/main.js
// Entry point: canvas + resize setup, fixed-timestep loop, world boot.

import { initInput, pollKeyboard, consumeA, consumeB, resetInput } from './input.js';
import { initRender, resize, renderWorld } from './render.js';
import { makePlayer, updatePlayer } from './player.js';
import { buildWorld, checkDoorTransition, checkWin } from './world.js';
import * as sprites from './sprites.js';
import { sfx } from './audio.js';
import { setupDebug } from './debug.js';

const STEP = 1 / 60;          // fixed update step (s)
const OVER_SEQUENCE = 1.1;    // s: banner fade-in / settle before "tap to restart" arms
const game = {
  player: null,
  rooms: null, room: null, roomKey: 'A',
  enemies: [], items: [], projectiles: [], effects: [],
  won: false,
  over: null,                 // {type:'dead'|'win', t, ready} while on the end screen
};

// Optional subsystems wired in by later modules. Kept as hooks so the loop
// doesn't need to know whether weapons/enemies are present yet.
const systems = {
  weapons: null,   // { tryAttack(game), throw(game, aim), step(game, dt), drawHeld }
  enemies: null,   // { step(game, dt) }
  spawn: null,     // (game, room, key) => void
};
game.systems = systems;

function update(dt) {
  pollKeyboard();
  const p = game.player;
  if (p.hp <= 0 || game.won) { updateOver(dt); return; }
  game.over = null;                         // alive & playing — no end screen

  if (game.graceT > 0) game.graceT -= dt;   // brief "settle in" window per room

  updatePlayer(p, dt, game.room);   // (also applies collision-aware knockback)

  // footstep cadence while moving
  if (p.moving) {
    game.stepT = (game.stepT || 0) - dt;
    if (game.stepT <= 0) { sfx.play('step'); game.stepT = 0.30; }
  } else {
    game.stepT = 0;
  }

  // resolve discrete control edges → weapon actions
  if (consumeA() && systems.weapons) systems.weapons.tryAttack(game);
  const aim = consumeB();
  if (aim && systems.weapons) systems.weapons.throwItem(game, aim);

  if (systems.weapons) systems.weapons.step(game, dt);
  if (systems.enemies) systems.enemies.step(game, dt);

  // age visual effects
  for (const fx of game.effects) { fx.t += dt; fx.alpha = Math.max(0, 1 - fx.t / fx.life); }
  game.effects = game.effects.filter(fx => fx.t < fx.life);

  checkDoorTransition(game);
  checkWin(game);
}

// Run the end-screen sequence: the banner fades in, then after OVER_SEQUENCE a
// fresh tap/click/key restarts (handled by the listener in boot()).
function updateOver(dt) {
  if (!game.over) {
    game.over = { type: game.won ? 'win' : 'dead', t: 0, ready: false };
    resetInput();                           // clear any queued action from the killing blow
  }
  game.over.t += dt;
  if (game.over.t >= OVER_SEQUENCE) game.over.ready = true;
}

function restartGame() {
  game.over = null;
  game.player = makePlayer(0, 0);
  buildWorld(game);                         // fresh rooms → enemies/items respawn
  resetInput();                             // the restart tap's own edge doesn't carry in
}

let last = 0, acc = 0;
function frame(t) {
  if (!last) last = t;
  let dt = (t - last) / 1000;
  last = t;
  if (dt > 0.25) dt = 0.25;        // clamp after tab-switch / stall
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 8) { update(STEP); acc -= STEP; }
  renderWorld(game);
  requestAnimationFrame(frame);
}

async function boot() {
  const canvas = document.getElementById('game');
  game.player = makePlayer(0, 0);
  initRender(canvas);
  initInput(canvas);
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  // Tap / click / key on the end screen restarts — but only once the death/win
  // sequence has finished arming, so the input that killed you can't bounce you
  // straight into a new run.
  // Restart on pointer/key UP (after the gesture's own edge has been set), so
  // restartGame's resetInput() clears it instead of it leaking into the new run.
  const onOverPress = () => { if (game.over && game.over.ready) restartGame(); };
  window.addEventListener('pointerup', onOverPress);
  window.addEventListener('keyup', onOverPress);

  // wire optional subsystems if their modules are present
  await wireSystems();

  buildWorld(game);

  const boot = document.getElementById('boot');
  if (boot) boot.style.display = 'none';

  const res = await sprites.preload();
  console.log('[boot] sprites loaded:', res.loaded);

  sfx.unlock();                  // arm audio for the first user gesture
  sfx.load().then(a => console.log('[boot] sfx loaded:', a.loaded));

  window.game = game;            // debug handle (harmless; handy for tuning)
  setupDebug(game);              // attaches window.dbg — type dbg.help()
  requestAnimationFrame(frame);
}

// Dynamically import weapons/enemy so the slice runs even before they exist.
async function wireSystems() {
  try {
    const w = await import('./weapons.js');
    systems.weapons = w.makeWeaponSystem();
    const r = await import('./render.js');
    r.setHeldWeaponDrawer(w.drawHeldWeapon);
  } catch (e) { console.log('[boot] weapons not wired:', e.message); }
  try {
    const en = await import('./enemy.js');
    systems.enemies = en.makeEnemySystem();
    game.spawnRoomContents = en.spawnRoomContents;
  } catch (e) { console.log('[boot] enemies not wired:', e.message); }
}

boot();
