// src/input.js
// Floating thumb controls: left = movement joystick anchored to the touch
// point; right = "action rocker" state machine resolving tap (A=use weapon) vs
// push (B=throw) by the thumb's motion relative to its contact origin.
//
// The defining property: controls are anchored to the TOUCH POINT, not to
// screen coordinates, so thumb drift can never break contact.

// ---- Tunables (the one place to tweak during testing) ----
export const TUNABLES = {
  TAP_MS: 180,        // max press duration that still counts as a tap (A)
  B_THRESHOLD: 26,    // displacement (CSS px) past which the rocker commits to B (throw)
  maxRadius: 56,      // joystick clamp radius (CSS px)
  deadzone: 10,       // joystick deadzone (CSS px)
};

// Behavior modes (flippable live via window.dbg for A/B feel testing).
export const MODES = {
  fireOnRelease: true,  // B throws on lift (push → see → adjust → release) vs instantly on crossing
  faceAim: true,        // hero turns to face the throw while aiming (read by player.js)
  aimIndicator: true,   // draw the world-space aim indicator from the player (read by render.js)
};

// Input snapshot consumed by the game each fixed step.
export const input = {
  move: { x: 0, y: 0 },     // normalized direction * analog speed (0..1)
  moveActive: false,
  // continuous aim indicator while rocker is in B-active state
  aim: { x: 0, y: 0, active: false },
};

// --- internal state ---
let canvas;
let left = null;     // {id, ox, oy, x, y}
let right = null;    // {id, ox, oy, x, y, startT, state:'ARMED'|'B_ACTIVE'}

let pendingA = false;          // edge: A fired
let pendingB = null;           // edge: {ax, ay} aim at B-commit, or null
let facingVec = { x: 0, y: -1 }; // last known facing (for keyboard B)

// keyboard state
const keys = new Set();

export function initInput(c) {
  canvas = c;
  // Touch listeners on the canvas (passive:false so we can preventDefault).
  c.addEventListener('touchstart', onTouchStart, { passive: false });
  c.addEventListener('touchmove', onTouchMove, { passive: false });
  c.addEventListener('touchend', onTouchEnd, { passive: false });
  c.addEventListener('touchcancel', onTouchEnd, { passive: false });

  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  // Belt-and-suspenders: never let the page scroll/zoom on touch.
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { e.preventDefault(); }, { passive: false });
}

export function setFacing(v) { facingVec = v; }

// --- edge consumers (called once per fixed step) ---
export function consumeA() {
  const a = pendingA; pendingA = false; return a;
}
export function consumeB() {
  const b = pendingB; pendingB = null; return b; // {ax,ay} | null
}

// --- geometry helpers ---
function rect() { return canvas.getBoundingClientRect(); }
function halfSplit(clientX) { return clientX < rect().left + rect().width / 2; }

function clampLen(x, y, max) {
  const len = Math.hypot(x, y);
  if (len <= 0.0001) return { x: 0, y: 0, len: 0 };
  if (len <= max) return { x, y, len };
  return { x: x / len * max, y: y / len * max, len: max };
}

// ---- touch handling ----
function onTouchStart(e) {
  e.preventDefault();
  const r = rect();
  for (const t of e.changedTouches) {
    const x = t.clientX - r.left, y = t.clientY - r.top;
    const isLeft = t.clientX < r.left + r.width / 2;
    if (isLeft && !left) {
      left = { id: t.identifier, ox: x, oy: y, x, y };
    } else if (!isLeft && !right) {
      right = { id: t.identifier, ox: x, oy: y, x, y, startT: performance.now(), state: 'ARMED' };
    }
    // ignore 3rd+ touches
  }
  updateMove();
  updateRocker(e);
}

function onTouchMove(e) {
  e.preventDefault();
  const r = rect();
  for (const t of e.changedTouches) {
    const x = t.clientX - r.left, y = t.clientY - r.top;
    if (left && t.identifier === left.id) { left.x = x; left.y = y; }
    if (right && t.identifier === right.id) { right.x = x; right.y = y; }
  }
  updateMove();
  updateRocker(e);
}

function onTouchEnd(e) {
  const r = rect();
  for (const t of e.changedTouches) {
    const x = t.clientX - r.left, y = t.clientY - r.top;
    if (left && t.identifier === left.id) {
      left = null;
    }
    if (right && t.identifier === right.id) {
      // Resolve on release: a quick small touch is a tap (A); a release while
      // aiming throws (B) along the last aimed direction.
      if (right.state === 'ARMED') {
        const dx = right.x - right.ox, dy = right.y - right.oy;
        const dist = Math.hypot(dx, dy);
        const dt = performance.now() - right.startT;
        if (dt <= TUNABLES.TAP_MS && dist < TUNABLES.B_THRESHOLD) {
          pendingA = true; // tap → A = use weapon
        }
      } else if (right.state === 'B_ACTIVE') {
        if (MODES.fireOnRelease && right.lastAim) pendingB = right.lastAim; // release → B = throw
      }
      right = null;
      input.aim.active = false;
    }
  }
  updateMove();
}

function updateMove() {
  if (left) {
    let dx = left.x - left.ox, dy = left.y - left.oy;
    const dz = TUNABLES.deadzone;
    let len = Math.hypot(dx, dy);
    if (len < dz) { input.move.x = 0; input.move.y = 0; input.moveActive = false; return; }
    const c = clampLen(dx, dy, TUNABLES.maxRadius);
    // normalize to 0..1 speed
    const speed = c.len / TUNABLES.maxRadius;
    input.move.x = c.x / TUNABLES.maxRadius;
    input.move.y = c.y / TUNABLES.maxRadius;
    // ensure unit length direction * speed
    const nl = Math.hypot(input.move.x, input.move.y) || 1;
    input.move.x = input.move.x / nl * speed;
    input.move.y = input.move.y / nl * speed;
    input.moveActive = true;
  } else if (!anyMoveKey()) {
    input.move.x = 0; input.move.y = 0; input.moveActive = false;
  }
}

function updateRocker(e) {
  if (!right) { input.aim.active = false; return; }
  const dx = right.x - right.ox, dy = right.y - right.oy;
  const dist = Math.hypot(dx, dy);
  if (right.state === 'ARMED' && dist >= TUNABLES.B_THRESHOLD) {
    // Crossed threshold → enter aim mode. With fireOnRelease (default) the throw
    // is deferred to touchend so you can push → see the aim → adjust → release.
    // Legacy fire-on-cross commits immediately (flip via dbg.fireOnRelease(false)).
    right.state = 'B_ACTIVE';
    right.lastAim = unitAim(dx, dy);
    if (!MODES.fireOnRelease) pendingB = right.lastAim;
  }
  if (right.state === 'B_ACTIVE') {
    input.aim.active = true;
    const a = unitAim(dx, dy);
    input.aim.x = a.ax; input.aim.y = a.ay;
    if (dist >= TUNABLES.B_THRESHOLD) right.lastAim = a;  // remember the last real aim
  }
}

function unitAim(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return { ax: dx / len, ay: dy / len };
}

// ---- keyboard (desktop parity) ----
const MOVE_KEYS = {
  ArrowLeft: 'L', a: 'L', A: 'L',
  ArrowRight: 'R', d: 'R', D: 'R',
  ArrowUp: 'U', w: 'U', W: 'U',
  ArrowDown: 'D', s: 'D', S: 'D',
};

function onKey(e) {
  // prevent space/arrow scrolling
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (e.type === 'keydown') {
    keys.add(e.key);
    if (e.key === 'z' || e.key === 'Z') pendingA = true;       // A = use weapon
    if (e.key === 'x' || e.key === 'X') pendingB = { ax: facingVec.x, ay: facingVec.y }; // B = throw facing
  } else {
    keys.delete(e.key);
  }
  if (!left) updateMoveKeyboard();
}

function anyMoveKey() { return keys.has('ArrowLeft')||keys.has('ArrowRight')||keys.has('ArrowUp')||keys.has('ArrowDown')||keys.has('a')||keys.has('d')||keys.has('w')||keys.has('s')||keys.has('A')||keys.has('D')||keys.has('W')||keys.has('S'); }

function updateMoveKeyboard() {
  let x = 0, y = 0;
  if (keys.has('ArrowLeft')||keys.has('a')||keys.has('A')) x -= 1;
  if (keys.has('ArrowRight')||keys.has('d')||keys.has('D')) x += 1;
  if (keys.has('ArrowUp')||keys.has('w')||keys.has('W')) y -= 1;
  if (keys.has('ArrowDown')||keys.has('s')||keys.has('S')) y += 1;
  if (x || y) {
    const l = Math.hypot(x, y);
    input.move.x = x / l; input.move.y = y / l; input.moveActive = true;
  } else {
    input.move.x = 0; input.move.y = 0; input.moveActive = false;
  }
}

// poll keyboard each frame (key-up between fixed steps without an event fixup)
export function pollKeyboard() { if (!left) updateMoveKeyboard(); }

// ---- render hooks for control overlays (called by render.js) ----
export function getControls() {
  return {
    left: left ? { ox: left.ox, oy: left.oy, x: left.x, y: left.y, radius: TUNABLES.maxRadius } : null,
    right: right ? { ox: right.ox, oy: right.oy, x: right.x, y: right.y, state: right.state, threshold: TUNABLES.B_THRESHOLD } : null,
  };
}