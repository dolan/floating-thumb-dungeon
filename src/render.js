// src/render.js
// Camera (follows player, clamped to room bounds), tilemap + sprite blit, HUD,
// and the floating-control overlays. Uses pixellab sprites when available
// (via sprites.js) and procedural placeholders otherwise.

import { TILE, T, tileAt, roomPx } from './room.js';
import { getControls, input, TUNABLES, MODES } from './input.js';
import * as sprites from './sprites.js';

let canvas, ctx;
let view = { w: 0, h: 0, dpr: 1 };
const camera = { x: 0, y: 0, scale: 3 };

export function initRender(c) {
  canvas = c;
  ctx = c.getContext('2d');
  resize();
}

export function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(window.innerWidth);
  const h = Math.floor(window.innerHeight);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  view = { w, h, dpr };
  // pick an integer-ish zoom so ~220 logical px of height are visible
  camera.scale = Math.max(2, Math.round(h / 240));
  ctx.imageSmoothingEnabled = false;
}

function updateCamera(game) {
  const p = game.player;
  const rp = roomPx(game.room);
  const viewW = view.w / camera.scale;
  const viewH = view.h / camera.scale;
  let cx = p.x - viewW / 2;
  let cy = p.y - viewH / 2;
  // clamp to room, or center if the room is smaller than the viewport
  cx = rp.w <= viewW ? (rp.w - viewW) / 2 : Math.max(0, Math.min(cx, rp.w - viewW));
  cy = rp.h <= viewH ? (rp.h - viewH) / 2 : Math.max(0, Math.min(cy, rp.h - viewH));
  camera.x = cx; camera.y = cy;
}

export function renderWorld(game) {
  updateCamera(game);
  const dpr = view.dpr, s = camera.scale;

  // world space transform: device px = (worldPx - camera) * scale * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b0d14';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.save();
  ctx.scale(s, s);
  ctx.translate(-camera.x, -camera.y);

  drawTiles(game.room);
  for (const it of game.items) if (!it.taken) drawItem(it);
  for (const e of game.enemies) if (!e.dead) drawEnemy(e);
  drawPlayer(game.player);
  drawAimIndicator(game.player);
  for (const pr of game.projectiles) drawProjectile(pr);
  drawEffects(game.effects);

  ctx.restore();

  // screen-space UI (CSS px)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawControls();
  drawHUD(game);
  if (game.won) drawBanner('DUNGEON CLEAR', game, '#9ad');
  else if (game.player.hp <= 0) drawBanner('YOU DIED', game, '#c66');
}

// ---------- tiles ----------
function drawTiles(room) {
  const x0 = Math.max(0, Math.floor(camera.x / TILE));
  const y0 = Math.max(0, Math.floor(camera.y / TILE));
  const x1 = Math.min(room.w, Math.ceil((camera.x + view.w / camera.scale) / TILE) + 1);
  const y1 = Math.min(room.h, Math.ceil((camera.y + view.h / camera.scale) / TILE) + 1);
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const t = tileAt(room, tx, ty);
      const px = tx * TILE, py = ty * TILE;
      if (t === T.WALL) {
        ctx.fillStyle = '#2a2f45';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#3b4266';
        ctx.fillRect(px, py, TILE, 3);
      } else {
        // floor: subtle checker
        ctx.fillStyle = ((tx + ty) & 1) ? '#171b2b' : '#1b2032';
        ctx.fillRect(px, py, TILE, TILE);
        if (t === T.DOOR) {
          ctx.fillStyle = '#6b4a22';
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = '#caa15a';
          ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
        }
      }
    }
  }
}

// ---------- actors ----------
function drawPlayer(p) {
  const bob = p.moving ? Math.abs(Math.sin(p.animT * 6)) * 1.4 : 0;
  // try pixellab sprite first
  if (drawActorSprite('hero', p.fx, p.fy, p.x, p.y - bob)) {
    drawHeldWeapon(p);
    return;
  }
  // procedural placeholder
  ctx.save();
  ctx.translate(p.x, p.y - bob);
  if (p.hurtT > 0 && Math.floor(p.hurtT * 20) % 2) ctx.globalAlpha = 0.4;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 6, 6, 2.5, 0, 0, 7); ctx.fill();
  // body
  ctx.fillStyle = '#5fbf6f';
  ctx.fillRect(-5, -8, 10, 13);
  ctx.fillStyle = '#3c8a4d';
  ctx.fillRect(-5, 1, 10, 4);
  // head
  ctx.fillStyle = '#e8c39a';
  ctx.fillRect(-4, -13, 8, 6);
  // facing pip
  ctx.fillStyle = '#fff';
  ctx.fillRect(-1 + p.fx * 5, -10 + p.fy * 5, 2, 2);
  ctx.restore();
  drawHeldWeapon(p);
}

// Hook used once weapons.js is wired; safe no-op until then.
let heldWeaponDrawer = null;
export function setHeldWeaponDrawer(fn) { heldWeaponDrawer = fn; }
function drawHeldWeapon(p) { if (heldWeaponDrawer) heldWeaponDrawer(ctx, p); }

function drawEnemy(e) {
  if (drawActorSprite(e.sprite || 'enemy', e.fx ?? 0, e.fy ?? 1, e.x, e.y)) return;
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.hurtT > 0 && Math.floor(e.hurtT * 20) % 2) ctx.globalAlpha = 0.4;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 5, 5, 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = e.color || '#c4524a';
  ctx.fillRect(-5, -7, 10, 12);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-3, -4, 2, 2); ctx.fillRect(1, -4, 2, 2);
  ctx.restore();
  // hp pips
  if (e.hp < e.maxHp) {
    const w = 12, x = e.x - w / 2, y = e.y - 12;
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = '#e54'; ctx.fillRect(x, y, w * (e.hp / e.maxHp), 2);
  }
}

function drawItem(it) {
  if (drawObjectSprite(it.kind, it.x, it.y)) return;
  ctx.save();
  ctx.translate(it.x, it.y + Math.sin((it.bob || 0)) * 1.5);
  const c = { sword: '#cfd6e6', gun: '#9aa0b5', rock: '#8a7d6b' }[it.kind] || '#ddd';
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 5, 5, 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c;
  if (it.kind === 'sword') { ctx.fillRect(-1, -7, 2, 12); ctx.fillRect(-3, 3, 6, 2); }
  else if (it.kind === 'gun') { ctx.fillRect(-4, -2, 8, 4); ctx.fillRect(-4, 2, 3, 3); }
  else { ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill(); }
  ctx.restore();
}

function drawProjectile(pr) {
  ctx.save();
  ctx.translate(pr.x, pr.y);
  if (pr.kind === 'bullet') {
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(-1.5, -1.5, 3, 3);
  } else {
    ctx.fillStyle = pr.color || '#caa';
    ctx.beginPath(); ctx.arc(0, 0, pr.r || 3, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// World-space throw aim, drawn FROM the player along input.aim while aiming.
// This is the primary aim readout — on the character, where the eyes are and
// the thumb can't occlude it. Subtle by design (it's a cue, not the centerpiece).
function drawAimIndicator(p) {
  if (!MODES.aimIndicator || !input.aim.active) return;
  const ax = input.aim.x, ay = input.aim.y;
  const oy = -4;                       // lift to roughly chest height
  const start = 9, end = 30;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,186,120,0.85)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([2, 2.5]);
  ctx.beginPath();
  ctx.moveTo(p.x + ax * start, p.y + oy + ay * start);
  ctx.lineTo(p.x + ax * end, p.y + oy + ay * end);
  ctx.stroke();
  ctx.setLineDash([]);
  // chevron at the end, pointing along the aim
  ctx.translate(p.x + ax * end, p.y + oy + ay * end);
  ctx.rotate(Math.atan2(ay, ax));
  ctx.fillStyle = 'rgba(255,186,120,0.95)';
  ctx.beginPath();
  ctx.moveTo(3.5, 0); ctx.lineTo(-2.2, -2.4); ctx.lineTo(-2.2, 2.4); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawEffects(effects) {
  if (!effects) return;
  for (const fx of effects) {
    if (fx.type === 'swing') {
      ctx.save();
      ctx.translate(fx.x, fx.y);
      ctx.rotate(fx.angle);
      ctx.strokeStyle = `rgba(255,255,255,${fx.alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, fx.reach, -0.9, 0.9); ctx.stroke();
      ctx.restore();
    } else if (fx.type === 'punch') {
      ctx.fillStyle = `rgba(255,255,255,${fx.alpha})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 3, 0, 7); ctx.fill();
    }
  }
}

// Blit a directional actor sprite if the named pixellab asset is loaded.
// Returns true if drawn, false if the caller should use a placeholder.
function drawActorSprite(name, fx, fy, x, y) {
  const f = sprites.actorFrame(name, fx, fy);
  if (!f) return false;
  const s = f.drawSize;
  ctx.drawImage(f.img, Math.round(x - s / 2), Math.round(y - s * f.anchorY), s, s);
  return true;
}

// Blit a single-frame prop (floor pickup, etc.) if loaded.
function drawObjectSprite(name, x, y) {
  const f = sprites.objectFrame(name);
  if (!f) return false;
  const s = f.drawSize;
  ctx.drawImage(f.img, Math.round(x - s / 2), Math.round(y - s * f.anchorY), s, s);
  return true;
}

// ---------- control overlays (screen / CSS px) ----------
function drawControls() {
  const c = getControls();
  // hint zones (faint) when nothing is touched
  if (c.left) drawStick(c.left);
  if (c.right) drawRocker(c.right);
}

function drawStick(L) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ring(L.ox, L.oy, L.radius, 'rgba(150,180,255,0.25)', 'rgba(150,180,255,0.6)');
  // knob clamped to radius
  let dx = L.x - L.ox, dy = L.y - L.oy;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(len, L.radius);
  const kx = L.ox + dx / len * k, ky = L.oy + dy / len * k;
  ctx.fillStyle = 'rgba(180,205,255,0.85)';
  ctx.beginPath(); ctx.arc(kx, ky, L.radius * 0.42, 0, 7); ctx.fill();
  ctx.restore();
}

function drawRocker(R) {
  ctx.save();
  const active = R.state === 'B_ACTIVE';
  // outer ring = B (throw) zone
  ring(R.ox, R.oy, R.threshold + 22, active ? 'rgba(255,150,90,0.22)' : 'rgba(255,200,120,0.18)',
    active ? 'rgba(255,150,90,0.8)' : 'rgba(255,200,120,0.5)');
  // inner disk = A (use) zone
  ctx.fillStyle = active ? 'rgba(255,170,110,0.35)' : 'rgba(255,220,150,0.5)';
  ctx.beginPath(); ctx.arc(R.ox, R.oy, R.threshold * 0.7, 0, 7); ctx.fill();
  // labels
  ctx.fillStyle = 'rgba(20,15,10,0.8)';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('A', R.ox, R.oy);
  // Small local stub under the thumb while aiming — just enough tactile
  // confirmation. The primary, readable aim is drawn on the character itself
  // (drawAimIndicator), where the thumb can't hide it.
  if (active) {
    let dx = R.x - R.ox, dy = R.y - R.oy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    ctx.strokeStyle = 'rgba(255,170,110,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R.ox, R.oy);
    ctx.lineTo(R.ox + ux * 16, R.oy + uy * 16);
    ctx.stroke();
  }
  ctx.restore();
}

function ring(x, y, r, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
}

// ---------- HUD ----------
function drawHUD(game) {
  const p = game.player;
  // hearts
  for (let i = 0; i < p.maxHp; i++) {
    const x = 12 + i * 16, y = 14;
    ctx.fillStyle = i < p.hp ? '#e0444f' : 'rgba(255,255,255,0.18)';
    heart(x, y, 5);
  }
  // weapon + room name + enemy count
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(8, 26, 150, 38);
  ctx.fillStyle = '#cdd6f0';
  ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Weapon: ' + game.player.weapon, 14, 30);
  const alive = game.enemies.filter(e => !e.dead).length;
  ctx.fillText(game.room.name + '  ·  enemies: ' + alive, 14, 46);
}

function heart(cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s);
  ctx.bezierCurveTo(cx - s * 1.5, cy - s * 0.5, cx - s * 0.5, cy - s * 1.4, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s * 1.4, cx + s * 1.5, cy - s * 0.5, cx, cy + s);
  ctx.fill();
}

function drawBanner(title, game, titleColor) {
  // Fade the end screen in over its sequence; the restart prompt only appears
  // once the sequence has armed (game.over.ready).
  const o = game.over;
  const fade = o ? Math.min(1, o.t / 0.6) : 0;
  const ready = !!(o && o.ready);

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, view.h / 2 - 56, view.w, 112);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = titleColor || '#fff';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(title, view.w / 2, view.h / 2 - 10);
  if (ready) {
    // gentle pulse so "tap to restart" reads as interactive
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(o.t * 3));
    ctx.globalAlpha = fade * pulse;
    ctx.fillStyle = '#cdd6f0';
    ctx.font = '14px monospace';
    ctx.fillText('tap to restart', view.w / 2, view.h / 2 + 24);
  }
  ctx.restore();
}
