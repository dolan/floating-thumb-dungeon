// src/room.js
// Tilemap model + AABB-vs-grid collision used by entities and projectiles.

export const TILE = 16;                 // logical px per tile
export const T = { FLOOR: 0, WALL: 1, DOOR: 2 };

// Build a rectangular room with a wall border, optional interior pillars, and
// doors punched into the border. `doors` entries: {x,y,dir,to,toDoor}.
export function makeRoom(name, w, h, opts = {}) {
  const tiles = new Array(w * h).fill(T.FLOOR);
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = t; };

  for (let x = 0; x < w; x++) { set(x, 0, T.WALL); set(x, h - 1, T.WALL); }
  for (let y = 0; y < h; y++) { set(0, y, T.WALL); set(w - 1, y, T.WALL); }

  for (const [px, py] of (opts.pillars || [])) set(px, py, T.WALL);

  const doors = [];
  for (const d of (opts.doors || [])) {
    set(d.x, d.y, T.DOOR);   // punched into the border; interior is already floor
    doors.push({ ...d });
  }
  return { name, w, h, tiles, doors };
}

export function tileAt(room, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return T.WALL;
  return room.tiles[ty * room.w + tx];
}

// Doors are walkable; only WALL blocks movement.
export function isSolidPx(room, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return tileAt(room, tx, ty) === T.WALL;
}

// How many of the circle's samples (center + 4 bbox corners) are inside a wall.
// 0 == fully clear. Used both to block moves and to detect/escape penetration.
function penetration(room, x, y, r) {
  let n = 0;
  if (isSolidPx(room, x, y)) n++;
  for (const ox of [-r, r]) for (const oy of [-r, r]) {
    if (isSolidPx(room, x + ox, y + oy)) n++;
  }
  return n;
}

// Axis-separated movement so sliding along walls feels right.
//
// When the circle is clear (p0 == 0) a move is allowed only if it stays clear —
// so you stop exactly `r` px off a wall and never penetrate it. If the circle is
// somehow already overlapping a wall (e.g. shoved by knockback at a corner), a
// move is allowed as long as it doesn't go DEEPER (penetration <= current). That
// guarantees an escape hatch: you can always slide out, never get trapped.
export function moveCircle(room, x, y, r, dx, dy) {
  const p0 = penetration(room, x, y, r);
  const allowed = (px, py) => {
    const p = penetration(room, px, py, r);
    return p === 0 || p <= p0;
  };
  if (allowed(x + dx, y)) x += dx;
  if (allowed(x, y + dy)) y += dy;
  return { x, y };
}

// Door the point is currently standing on, or null.
export function doorAtPx(room, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tileAt(room, tx, ty) !== T.DOOR) return null;
  return room.doors.find(d => d.x === tx && d.y === ty) || null;
}

export function roomPx(room) { return { w: room.w * TILE, h: room.h * TILE }; }
