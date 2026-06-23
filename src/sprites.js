// src/sprites.js
// Asset pipeline: loads pixellab-generated PNGs described by
// assets/sprites/manifest.json and exposes lookup helpers used by render.js.
//
// Pixellab delivers a character as 8 separate per-direction PNGs (one file per
// facing), so an "actor" entry maps a direction code -> file. If the manifest
// or a file is missing, lookups return null and render.js falls back to a
// procedural placeholder (dev scaffolding only — shipped art is the pixellab set).

const imgCache = new Map();   // file -> HTMLImageElement (once loaded)
const actors = new Map();     // name -> { files:{DIR:file}, drawSize, anchorY }
const objects = new Map();    // name -> { file, drawSize, anchorY }  (single-frame props)

// Direction order, clockwise from south. dirIndex() maps a facing vector here.
export const DIR8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];

export async function preload() {
  let manifest = null;
  try {
    const res = await fetch('assets/sprites/manifest.json', { cache: 'no-store' });
    if (res.ok) manifest = await res.json();
  } catch (_) { /* no manifest → all procedural */ }
  if (!manifest) return { loaded: 0 };

  const jobs = [];
  for (const [name, a] of Object.entries(manifest.actors || {})) {
    actors.set(name, a);
    for (const file of Object.values(a.files || {})) jobs.push(loadImage(file));
  }
  for (const [name, o] of Object.entries(manifest.objects || {})) {
    objects.set(name, o);
    if (o.file) jobs.push(loadImage(o.file));
  }
  const results = await Promise.allSettled(jobs);
  return { loaded: results.filter(r => r.status === 'fulfilled' && r.value).length };
}

function loadImage(file) {
  if (imgCache.has(file)) return Promise.resolve(imgCache.get(file));
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { imgCache.set(file, img); resolve(img); };
    img.onerror = () => resolve(null);
    img.src = 'assets/sprites/' + file;
  });
}

function usable(img) { return img && img.complete && img.naturalWidth ? img : null; }

// Map a facing unit vector to a DIR8 index (screen y is down; 0 == south).
export function dirIndex(fx, fy) {
  let ang = Math.atan2(fx, fy);     // 0 = south, +x → east
  if (ang < 0) ang += Math.PI * 2;
  return Math.round(ang / (Math.PI / 4)) % 8;
}

// Return { img, drawSize, anchorY } for an actor facing (fx,fy), or null.
export function actorFrame(name, fx, fy) {
  const a = actors.get(name);
  if (!a) return null;
  const dir = DIR8[dirIndex(fx, fy)];
  const file = a.files[dir] || a.files.S;
  const img = usable(imgCache.get(file));
  if (!img) return null;
  return { img, drawSize: a.drawSize || 28, anchorY: a.anchorY ?? 0.8 };
}

// Return { img, drawSize, anchorY } for a single-frame prop, or null.
export function objectFrame(name) {
  const o = objects.get(name);
  if (!o) return null;
  const img = usable(imgCache.get(o.file));
  if (!img) return null;
  return { img, drawSize: o.drawSize || 16, anchorY: o.anchorY ?? 0.6 };
}
