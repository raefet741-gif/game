// public/js/music.js — site-wide background music (ANIXIA — Samurai Spirit Ascension)
// Loops at ~30% volume, resumes roughly where it left off across page navigations,
// and can be muted by the player (choice remembered). Handles browsers that block
// autoplay by starting on the first user interaction.
(function () {
  var SRC = "/media/bg-music.mp3";
  var VOL = 0.3;
  var K_OFF = "kyuubi.music.off"; // "1" when the user muted it
  var K_TIME = "kyuubi.music.t"; // last playback position (continuity across pages)

  var off = localStorage.getItem(K_OFF) === "1";

  var audio = new Audio(SRC);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = VOL;

  // resume near where the previous page left off
  var resumeAt = parseFloat(localStorage.getItem(K_TIME) || "0");
  if (resumeAt > 0) {
    audio.addEventListener("loadedmetadata", function () {
      try { if (resumeAt < audio.duration - 1) audio.currentTime = resumeAt; } catch (e) {}
    });
  }

  // persist position so the next page continues from here
  var lastSave = 0;
  audio.addEventListener("timeupdate", function () {
    var now = Date.now();
    if (now - lastSave > 2000) {
      lastSave = now;
      try { localStorage.setItem(K_TIME, String(audio.currentTime)); } catch (e) {}
    }
  });
  window.addEventListener("pagehide", function () {
    try { localStorage.setItem(K_TIME, String(audio.currentTime)); } catch (e) {}
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
      if (!off) audio.play().catch(function () {});
    };
    document.addEventListener("pointerdown", start, { once: true });
    document.addEventListener("keydown", start, { once: true });
    document.addEventListener("touchstart", start, { once: true });
  }
  function tryPlay() {
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
