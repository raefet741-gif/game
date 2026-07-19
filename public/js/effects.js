// public/js/effects.js
// Self-contained juice: Web Audio sound effects (generated, no files), canvas
// confetti, and floating emoji reactions. All degrade gracefully.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ *
 * Sound effects — tiny synth, unlocked on first user gesture.
 * ------------------------------------------------------------------ */
let ctx = null;
let muted = localStorage.getItem("spill.muted") === "1";

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Unlock audio on the first interaction (browsers require a gesture).
function unlock() {
  ac();
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
}
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

function tone(freq, start, dur, type = "sine", gain = 0.18, slideTo = null) {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  get muted() {
    return muted;
  },
  toggleMute() {
    muted = !muted;
    localStorage.setItem("spill.muted", muted ? "1" : "0");
    if (!muted) sfx.click();
    return muted;
  },
  click() {
    tone(420, 0, 0.06, "triangle", 0.08);
  },
  draw() {
    tone(300, 0, 0.12, "sawtooth", 0.1, 720);
    tone(680, 0.06, 0.16, "sine", 0.12);
  },
  point() {
    // cha-ching
    tone(880, 0, 0.1, "square", 0.12);
    tone(1320, 0.09, 0.16, "square", 0.12);
  },
  buzz() {
    tone(160, 0, 0.32, "sawtooth", 0.16, 90);
  },
  power() {
    tone(520, 0, 0.14, "sawtooth", 0.12, 1200);
    tone(1200, 0.1, 0.12, "sine", 0.1);
  },
  steal() {
    tone(700, 0, 0.1, "square", 0.12, 300);
  },
  tick() {
    tone(1000, 0, 0.04, "sine", 0.06);
  },
  win() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, i * 0.13, 0.28, "triangle", 0.16));
  },
};

/* ------------------------------------------------------------------ *
 * Confetti
 * ------------------------------------------------------------------ */
const COLORS = ["#FF3D77", "#22E0D6", "#FFC53D", "#8B5CF6", "#4ADE80", "#F472B6"];

export function confettiBurst(durationMs = 2600) {
  if (reduceMotion) return;
  const canvas = document.getElementById("confetti");
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
  };
  resize();
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const N = 160;
  const parts = Array.from({ length: N }, () => ({
    x: Math.random() * W,
    y: -20 - Math.random() * H * 0.5,
    r: 4 + Math.random() * 7,
    c: COLORS[(Math.random() * COLORS.length) | 0],
    vx: -2 + Math.random() * 4,
    vy: 2 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    vr: -0.2 + Math.random() * 0.4,
  }));
  const end = performance.now() + durationMs;
  function frame(now) {
    g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.rot += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.c;
      g.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
      g.restore();
    }
    if (now < end) requestAnimationFrame(frame);
    else g.clearRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ *
 * Floating emoji reactions
 * ------------------------------------------------------------------ */
export function floatEmoji(emoji, color) {
  const layer = document.getElementById("emoji-layer");
  if (!layer) return;
  if (reduceMotion) return;
  const el = document.createElement("div");
  el.className = "float-emoji";
  el.textContent = emoji;
  el.style.left = 8 + Math.random() * 84 + "vw";
  if (color) el.style.filter = `drop-shadow(0 3px 6px ${color}88)`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

export const motionReduced = reduceMotion;

/* ------------------------------------------------------------------
 * Language flags — small inline SVGs shared by every game's language
 * switcher. Inline SVG (not emoji) because desktop Windows/Chrome renders
 * regional flag emoji as plain letter codes ("TN", "FR"), which looks broken.
 *   • en → England (St George's cross)   • fr → France   • ar → Tunisia
 * All use a 3:2 viewBox so they line up at a uniform size.
 * ------------------------------------------------------------------ */
export function flagSVG(code) {
  if (code === "fr")
    return `<svg class="flag" viewBox="0 0 3 2" aria-hidden="true"><rect width="3" height="2" fill="#fff"/><rect width="1" height="2" fill="#0055A4"/><rect x="2" width="1" height="2" fill="#EF4135"/></svg>`;
  if (code === "en")
    return `<svg class="flag" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#fff"/><rect x="12" width="6" height="20" fill="#CE1124"/><rect y="7" width="30" height="6" fill="#CE1124"/></svg>`;
  // ar → Tunisia: red field, white disc, red crescent + red five-point star.
  return `<svg class="flag" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#E70013"/><circle cx="15" cy="10" r="6" fill="#fff"/><circle cx="15" cy="10" r="4.6" fill="#E70013"/><circle cx="16.6" cy="10" r="3.7" fill="#fff"/><polygon points="17.6,7.6 18.14,9.26 19.88,9.26 18.47,10.28 19.01,11.94 17.6,10.92 16.19,11.94 16.73,10.28 15.32,9.26 17.06,9.26" fill="#E70013"/></svg>`;
}
