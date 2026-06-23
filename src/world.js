// src/world.js
// Room graph, entity spawning, room transitions through doors, and the
// win condition. For the vertical slice this builds the rooms and places the
// player; enemies/items are layered in once weapons + enemy AI land.

import { makeRoom, TILE, doorAtPx, roomPx } from './room.js';
import { sfx } from './audio.js';

// Door directions: which border edge the door sits on.
// 'N' top, 'S' bottom, 'W' left, 'E' right.
function buildRooms() {
  // Three connected rooms in a vertical-ish layout (portrait friendly).
  const A = makeRoom('Entry Hall', 15, 19, {
    pillars: [[4, 5], [10, 5], [4, 13], [10, 13]],
    doors: [{ x: 14, y: 9, dir: 'E', to: 'B', toDoor: 0 }],
  });
  const B = makeRoom('Guard Room', 17, 13, {
    pillars: [[5, 6], [8, 4], [11, 6], [8, 8]],
    doors: [
      { x: 0, y: 6, dir: 'W', to: 'A', toDoor: 0 },
      { x: 8, y: 12, dir: 'S', to: 'C', toDoor: 0 },
    ],
  });
  const C = makeRoom('Treasury', 15, 17, {
    pillars: [[3, 4], [11, 4], [7, 8], [3, 12], [11, 12]],
    doors: [{ x: 7, y: 0, dir: 'N', to: 'B', toDoor: 1 }],
  });
  return { A, B, C };
}

export function buildWorld(game) {
  game.rooms = buildRooms();
  game.effects = [];
  game.won = false;
  enter(game, 'A');
  // place the player near the center of the entry room
  const px = roomPx(game.room);
  game.player.x = px.w * 0.5;
  game.player.y = px.h * 0.5;
}

// Make `game` point at room `key` and alias the live enemy/item arrays to it.
function enter(game, key) {
  game.roomKey = key;
  game.room = game.rooms[key];
  game.enemies = game.room._enemies || (game.room._enemies = []);
  game.items = game.room._items || (game.room._items = []);
  game.projectiles = [];
  game.graceT = 1.2;            // enemies hold off briefly on room entry
  populateRoom(game);
}

// Spawn the current room's contents. Each room is populated once; we tag it so
// re-entering doesn't respawn cleared enemies.
export function populateRoom(game) {
  const room = game.room;
  if (room._populated) return;
  room._populated = true;
  if (typeof game.spawnRoomContents === 'function') {
    game.spawnRoomContents(game, room, game.roomKey);
  }
}

// Returns true if the player stepped through a door and we transitioned.
export function checkDoorTransition(game) {
  const p = game.player;
  const d = doorAtPx(game.room, p.x, p.y);
  if (!d) { game._lastDoor = false; return false; }
  if (game._lastDoor) return false;       // don't re-trigger while standing on it
  game._lastDoor = true;

  const next = game.rooms[d.to];
  const entry = next.doors[d.toDoor];
  sfx.play('door');
  enter(game, d.to);

  // place player just inside the entry door, offset by its edge direction
  const inset = TILE * 1.2;
  let x = entry.x * TILE + TILE / 2;
  let y = entry.y * TILE + TILE / 2;
  if (entry.dir === 'E') x -= inset;
  else if (entry.dir === 'W') x += inset;
  else if (entry.dir === 'N') y += inset;
  else if (entry.dir === 'S') y -= inset;
  p.x = x; p.y = y;
  return true;
}

// Debug helper: jump straight to a room and drop the player in its center.
export function debugWarp(game, key) {
  if (!game.rooms[key]) return;
  enter(game, key);
  const px = roomPx(game.room);
  game.player.x = px.w / 2;
  game.player.y = px.h / 2;
}

export function checkWin(game) {
  if (game.won) return;
  // win when every room has been populated and no enemies remain anywhere
  const rooms = Object.values(game.rooms);
  const allCleared = rooms.every(r => r._populated && (r._enemies || []).every(e => e.dead));
  if (allCleared) { game.won = true; sfx.play('win'); }
}
