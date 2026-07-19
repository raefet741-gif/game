// public/js/music.js — site-wide background music (ANIXIA — Samurai Spirit Ascension)
// The site is a multi-page app, so a page navigation tears down the <audio> element
// and JS context — the track can't literally keep playing. To make it *feel*
// continuous we don't just re-open at the last saved spot (that replays the same
// couple of seconds and sounds like a restart); instead we save the position with a
// wall-clock timestamp and, on the next page, fast-forward past the navigation gap
// so the music picks up exactly where it would be now. It only truly stops when the
// player mutes it — that choice is remembered.
(function () {
  var SRC = "/media/bg-music.mp3";
  var VOL = 0.3;
  var K_OFF = "kyuubi.music.off"; // "1" when the user muted it
  var K_TIME = "kyuubi.music.t"; // JSON {t: position seconds, at: epoch ms} — continuity across pages

  var off = localStorage.getItem(K_OFF) === "1";

  var audio = new Audio(SRC);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = VOL;

  // Read the saved {position, timestamp}. Back-compat: an old plain-number value is
  // treated as a position saved "just now" (no fast-forward).
  function readSaved() {
    var raw = localStorage.getItem(K_TIME);
    if (!raw) return { t: 0, at: Date.now() };
    try {
      var o = JSON.parse(raw);
      if (o && typeof o.t === "number") return { t: o.t, at: typeof o.at === "number" ? o.at : Date.now() };
    } catch (e) {}
    var n = parseFloat(raw);
    return { t: isNaN(n) ? 0 : n, at: Date.now() };
  }

  // Where should the track be right now? While unmuted we add the real time that has
  // elapsed since the position was saved (which covers the page-load gap) so playback
  // continues seamlessly. While muted we freeze at the saved spot so unmuting later
  // resumes from there rather than jumping ahead by the muted duration.
  function resumePosition() {
    var s = readSaved();
    var pos = s.t;
    if (!off) pos += Math.max(0, (Date.now() - s.at) / 1000);
    var dur = audio.duration;
    if (dur && isFinite(dur) && dur > 0) pos = pos % dur; // the track loops
    return pos > 0 ? pos : 0;
  }
  function applyResume() {
    try {
      var pos = resumePosition();
      var dur = audio.duration;
      if (!dur || !isFinite(dur) || pos < dur - 0.3) audio.currentTime = pos;
    } catch (e) {}
  }
  // Metadata may already be available for a cached file; otherwise wait for it.
  if (audio.readyState >= 1) applyResume();
  else audio.addEventListener("loadedmetadata", applyResume, { once: true });

  // Persist the position + a fresh timestamp so the next page can fast-forward. We
  // only record while actually playing, so a muted/paused stretch never inflates the
  // elapsed gap.
  function save() {
    if (audio.paused) return;
    try { localStorage.setItem(K_TIME, JSON.stringify({ t: audio.currentTime, at: Date.now() })); } catch (e) {}
  }
  var lastSave = 0;
  audio.addEventListener("timeupdate", function () {
    var now = Date.now();
    if (now - lastSave > 1000) { lastSave = now; save(); }
  });
  // Save on the way out — pagehide/visibilitychange fire reliably on navigation and
  // tab-switch where "unload" no longer does.
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") save();
  });

  // autoplay is blocked until a gesture on most browsers → arm a one-shot starter
  var armed = false;
  function armGesture() {
    if (armed) return;
    armed = true;
    var start = function () {
      armed = false;
      document.removeEventListener("pointerdown", start);
      document.removeEventListener("keydown", start);
      document.removeEventListener("touchstart", start);
      // Fast-forward past however long autoplay stayed blocked, then start.
      if (!off) { applyResume(); audio.play().catch(function () {}); }
    };
    document.addEventListener("pointerdown", start, { once: true });
    document.addEventListener("keydown", start, { once: true });
    document.addEventListener("touchstart", start, { once: true });
  }
  // Initial (cross-page) start: land at the seamless resume position, then play.
  // Falls back to a first-gesture start when the browser blocks autoplay.
  function tryPlay() {
    applyResume();
    var p = audio.play();
    if (p && p.catch) p.catch(function () { armGesture(); });
  }

  // floating mute / unmute button
  var btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Toggle background music");
  btn.setAttribute("title", "Music");
  btn.style.cssText = [
    "position:fixed", "left:14px", "bottom:14px", "z-index:200",
    "width:44px", "height:44px", "border-radius:50%",
    "border:1px solid rgba(26,21,18,.18)",
    "background:rgba(250,246,238,.92)", "color:#c1272d",
    "font-size:19px", "line-height:1", "cursor:pointer",
    "display:flex", "align-items:center", "justify-content:center",
    "box-shadow:0 6px 18px -6px rgba(26,21,18,.5)",
    "-webkit-backdrop-filter:blur(6px)", "backdrop-filter:blur(6px)",
    "transition:transform .12s ease, filter .15s ease",
  ].join(";");
  function paint() {
    btn.textContent = off ? "🔇" : "🔊";
    btn.style.filter = off ? "grayscale(.4) opacity(.7)" : "none";
  }
  btn.addEventListener("mouseenter", function () { btn.style.transform = "scale(1.07)"; });
  btn.addEventListener("mouseleave", function () { btn.style.transform = "scale(1)"; });
  btn.addEventListener("click", function () {
    off = !off;
    try { localStorage.setItem(K_OFF, off ? "1" : "0"); } catch (e) {}
    if (off) audio.pause();
    else audio.play().catch(function () { armGesture(); });
    paint();
  });

  function mount() {
    document.body.appendChild(btn);
    paint();
    if (!off) tryPlay();
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
