// src/debug.js
// In-browser debugging facility. Attaches `window.dbg` with commands to set up
// test scenarios straight from the console (or an injected script) instead of
// playing through to a situation. Harmless in normal play — nothing happens
// until you call something. Type `dbg.help()` for the list.

import { TILE } from './room.js';
import { MODES } from './input.js';
import { makeItem } from './weapons.js';
import { addEnemy } from './enemy.js';
import { debugWarp } from './world.js';

export function setupDebug(game) {
  const p = () => game.player;

  const dbg = {
    help() {
      console.log('%cdbg — debug commands', 'font-weight:bold;font-size:13px');
      console.log([
        "god(on=true)             invulnerable player",
        "heal() / hp(n)           restore / set hit points",
        "freezeEnemies(on=true)   stop ALL enemy AI (frozen in place)",
        "noAggro(on=true)         enemies stay put but won't chase/attack",
        "noClip(on=true)          player walks through walls",
        "tp(x,y) / tpTile(tx,ty)  teleport player (pixels / tile coords)",
        "pinWall('S'|'N'|'E'|'W') slam player flush against a wall",
        "weapon('fists'|'sword'|'gun'|'rock')   equip instantly",
        "give(kind,[x,y])         drop a weapon pickup",
        "spawn(kind,[x,y])        spawn 'goblin'|'skeleton' (near player by default)",
        "clearEnemies() / killAll()   remove / kill all enemies",
        "room('A'|'B'|'C')        warp to a room (centered)",
        "face(dx,dy) attack() throwIt()   aim + drive the A / B actions",
        "fireOnRelease(on=true)   B throws on lift (aim+adjust) vs instantly on cross",
        "aimIndicator(on=true)    show the on-character throw-aim indicator",
        "faceAim(on=true)         hero turns to face the throw while aiming",
        "scenario(name)           presets: 'wall','arsenal','win','clear'",
        "state()                  dump a summary of the current state",
      ].join('\n'));
      return 'see console above';
    },

    fireOnRelease(on = true) { MODES.fireOnRelease = on; return `fireOnRelease=${on}`; },
    aimIndicator(on = true) { MODES.aimIndicator = on; return `aimIndicator=${on}`; },
    faceAim(on = true) { MODES.faceAim = on; return `faceAim=${on}`; },

    god(on = true) { p().god = on; return `god=${on}`; },
    heal() { p().hp = p().maxHp; return p().hp; },
    hp(n) { p().hp = n; return p().hp; },
    freezeEnemies(on = true) { game.dbgFreeze = on; return `freezeEnemies=${on}`; },
    noAggro(on = true) { game.graceT = on ? 1e9 : 0; return `noAggro=${on}`; },
    noClip(on = true) { p().noClip = on; return `noClip=${on}`; },

    tp(x, y) { p().x = x; p().y = y; return [x, y]; },
    tpTile(tx, ty) { p().x = tx * TILE + TILE / 2; p().y = ty * TILE + TILE / 2; return [p().x, p().y]; },
    pinWall(side = 'S') {
      const r = p().r, w = game.room.w, h = game.room.h;
      if (side === 'S') { p().x = w * TILE / 2; p().y = (h - 1) * TILE - r; }
      else if (side === 'N') { p().x = w * TILE / 2; p().y = TILE + r; }
      else if (side === 'W') { p().x = TILE + r; p().y = h * TILE / 2; }
      else if (side === 'E') { p().x = (w - 1) * TILE - r; p().y = h * TILE / 2; }
      return [+p().x.toFixed(1), +p().y.toFixed(1)];
    },

    weapon(name) { p().weapon = name; return `weapon=${name}`; },
    give(kind, x, y) {
      const it = makeItem(kind, x ?? p().x + 12, y ?? p().y);
      it.noPickT = 0.3;
      game.items.push(it);
      return `gave ${kind}`;
    },
    spawn(kind = 'goblin', x, y) {
      addEnemy(game, kind, x ?? p().x, y ?? p().y - 24);
      return `spawned ${kind}`;
    },
    clearEnemies() { game.enemies.length = 0; return 'cleared'; },
    killAll() { game.enemies.forEach(e => (e.dead = true)); return 'killed all'; },
    room(key) { debugWarp(game, key); return `warped to ${key}`; },

    face(dx, dy) { const l = Math.hypot(dx, dy) || 1; p().fx = dx / l; p().fy = dy / l; return [p().fx, p().fy]; },
    attack() { key('z'); return 'A (use)'; },
    throwIt() { key('x'); return 'B (throw)'; },

    scenario(name) {
      switch (name) {
        case 'wall':
          this.heal(); this.god(true); this.pinWall('S');
          this.spawn('skeleton', p().x, p().y - 18);
          return "scenario 'wall': healed + pinned to S wall + skeleton on top, god ON. Try to move/fight — you should never get stuck.";
        case 'arsenal':
          this.give('sword', p().x - 20, p().y);
          this.give('gun', p().x, p().y - 20);
          this.give('rock', p().x + 20, p().y);
          return "scenario 'arsenal': sword/gun/rock dropped around you.";
        case 'win': this.killAll(); return "scenario 'win': all enemies killed — clear the room to trigger the banner.";
        case 'clear': this.clearEnemies(); return "scenario 'clear': enemies removed.";
        default: return `unknown scenario '${name}'. try: 'wall','arsenal','win','clear'`;
      }
    },

    state() {
      const enemies = game.enemies.map(e => ({ kind: e.kind, dead: e.dead, hp: e.hp, x: +e.x.toFixed(0), y: +e.y.toFixed(0), state: e.state }));
      const s = {
        room: game.roomKey, weapon: p().weapon, hp: p().hp + '/' + p().maxHp,
        pos: [+p().x.toFixed(0), +p().y.toFixed(0)],
        flags: { god: !!p().god, noClip: !!p().noClip, freezeEnemies: !!game.dbgFreeze, graceT: +game.graceT.toFixed(1) },
        modes: { ...MODES },
        enemies, items: game.items.map(i => i.kind),
      };
      console.log(s);
      return s;
    },
  };

  function key(k) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k }));
  }

  window.dbg = dbg;
  console.log("%cDebug ready — type dbg.help()", 'color:#6cf');
}
