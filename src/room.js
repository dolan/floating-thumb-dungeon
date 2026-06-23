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

function circleHitsWall(room, x, y, r) {
  // sample the 4 corners of the circle's bounding box + center
  if (isSolidPx(room, x, y)) return true;
  for (const ox of [-r, r]) for (const oy of [-r, r]) {
    if (isSolidPx(room, x + ox, y + oy)) return true;
  }
  return false;
}

// Axis-separated movement so sliding along walls feels right.
export function moveCircle(room, x, y, r, dx, dy) {
  let nx = x + dx;
  if (!circleHitsWall(room, nx, y, r)) x = nx;
  let ny = y + dy;
  if (!circleHitsWall(room, x, ny, r)) y = ny;
  return { x, y };
}

// Door the point is currently standing on, or null.
export function doorAtPx(room, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tileAt(room, tx, ty) !== T.DOOR) return null;
  return room.doors.find(d => d.x === tx && d.y === ty) || null;
}

export function roomPx(room) { return { w: room.w * TILE, h: room.h * TILE }; }
