// public/js/app.js
// SPILL client. Server owns authoritative room_state; this file renders it and turns
// clicks into socket events. Fully localized (EN/FR/AR + RTL) via ./i18n.js.

import { sfx, confettiBurst, floatEmoji } from "./effects.js";
import {
  LANGS, getLang, setLang, applyDir, t, tType, tLetter, tIntensity,
  tPower, tCategory, tErr, tLog,
} from "./i18n.js";

const socket = io({ reconnection: true });
const $app = document.getElementById("app");

let config = { powers: [], colors: [], serverUrl: "" };
let state = null;
let pre = "landing"; // landing | create | join
let session = loadSession();
let ui = { drawerOpen: false, drawerTab: "shop", overlay: null, serum: null };
let drafts = {
  name: "", color: "", joinCode: "", written: "", wish: "", custom: "",
  bluffReal: "", bluffFake1: "", bluffFake2: "",
  authUser: "", authPass: "",
};
let myGuess = null;
let bumpSet = new Set();
let prevScores = {};
let prevPromptId = null;
let lastFocused = null;
let hadFirstConnect = false;
let account = null;
let authChecked = false;
let authTab = "login";
let authBusy = false;
let authError = "";

const REACTIONS = ["🔥", "😂", "😱", "👏", "💀", "❤️", "🤯", "🙈"];

/* ---------------- session ---------------- */
function loadSession() {
  try { return JSON.parse(localStorage.getItem("spill.session") || "null"); }
  catch { return null; }
}
function saveSession(s) { session = s; localStorage.setItem("spill.session", JSON.stringify(s)); }
function clearSession() { session = null; localStorage.removeItem("spill.session"); }
function accountToken() { return localStorage.getItem("kyuubi.token"); }
async function apiPost(url, body) {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    return await r.json();
  } catch { return { error: "generic" }; }
}
function forceLogin() {
  localStorage.removeItem("kyuubi.token");
  account = null;
  authChecked = true;
  state = null;
  render();
}

/* ---------------- helpers ---------------- */
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
function loc(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  return x[getLang()] || x.en || "";
}
function myId() { return session?.playerId || null; }
function myPlayer() { return state?.players.find((p) => p.id === myId()) || null; }
function playerById(id) { return state?.players.find((p) => p.id === id) || null; }
function initials(name) { return (name || "?").trim().charAt(0).toUpperCase() || "?"; }
function powerMeta(id) { return config.powers.find((p) => p.id === id) || null; }
function powerIcon(id) { return powerMeta(id)?.icon || "❔"; }
function avatarHTML(p, cls = "avatar") {
  return `<div class="${cls}" style="background:${esc(p.color)}">${esc(initials(p.name))}</div>`;
}
// Base URL to hand out as the invite link / QR. In production this is the real public
// origin (e.g. https://spill.onrender.com). Only on a local host (localhost) do we fall
// back to the server-detected LAN IP so phones on the same WiFi can still reach it.
function inviteBase() {
  const o = location.origin;
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(o) ? config.serverUrl || o : o;
}
function toast(message, kind = "ok") {
  const wrap = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, 2600);
}

/* ---------------- socket ---------------- */
socket.on("connect", () => {
  const firstLoad = !hadFirstConnect;
  hadFirstConnect = true;
  if (session?.code && session?.playerId) {
    socket.emit("join_room", { code: session.code, playerId: session.playerId, token: accountToken() }, (res) => {
      if (!res?.ok) { clearSession(); state = null; render(); return; }
      // On a fresh page load, don't get stuck in an old lobby/finished room — only
      // auto-resume a game that's actually in progress, so reopening the app lets you
      // start a NEW room with a new code. Network reconnects keep the current room.
      if (firstLoad && res.state?.status !== "playing") {
        socket.emit("leave_room");
        clearSession(); state = null; render();
        return;
      }
      applyState(res.state);
    });
  } else if (firstLoad) render();
});
socket.on("config", (c) => {
  config = c;
  if (!drafts.color) drafts.color = config.colors[0] || "";
  render();
});
socket.on("state", (next) => applyState(next));
socket.on("timer", (t2) => updateTimerRing(t2));
socket.on("flash", ({ kind }) => { if (kind === "done") sfx.point(); else sfx.buzz(); });
socket.on("power", ({ kind, powerId }) => {
  if (kind === "use" && powerId === "pickpocket") sfx.steal(); else sfx.power();
});
socket.on("game_over", () => { confettiBurst(); sfx.win(); });
socket.on("account_update", ({ gain, unlocked }) => {
  if (gain) toast(t("xp_earned", { n: gain }), "ok");
  if (unlocked && unlocked.length) setTimeout(() => toast(t("achv_unlocked", { n: unlocked.length }), "ok"), 900);
});
socket.on("reaction", ({ emoji, byColor }) => floatEmoji(emoji, byColor));
socket.on("serum", ({ answer, ofName, bluff }) => {
  ui.serum = { answer, ofName, bluff };
  ui.overlay = null;
  render();
});
socket.on("notice", ({ type, message }) => toast(tErr(message), type === "error" ? "error" : "ok"));
socket.on("kicked", () => {
  clearSession();
  state = null;
  ui = { drawerOpen: false, drawerTab: "shop", overlay: null, serum: null };
  toast(t("removed_from_room"), "error");
  render();
});
socket.on("disconnect", () => toast(t("reconnecting"), "error"));

function applyState(next) {
  if (next.currentPrompt && next.currentPrompt.id !== prevPromptId) {
    if (prevPromptId !== null || state) sfx.draw();
    drafts.written = "";
    drafts.bluffReal = drafts.bluffFake1 = drafts.bluffFake2 = "";
    myGuess = null;
  }
  prevPromptId = next.currentPrompt ? next.currentPrompt.id : null;
  bumpSet = new Set();
  for (const p of next.players) {
    const before = prevScores[p.id];
    if (before !== undefined && p.score > before) bumpSet.add(p.id);
    prevScores[p.id] = p.score;
  }
  state = next;
  render();
}

/* ---------------- render dispatch ---------------- */
function render() {
  captureFocus();
  let html = "";
  if (!state) html = !authChecked ? viewLoading() : account ? viewPre() : viewAuthGate();
  else if (state.status === "lobby") html = viewLobby();
  else if (state.status === "playing") html = viewPlaying();
  else if (state.status === "finished") html = viewFinished();

  if (state && ui.drawerOpen) html += viewDrawer();
  if (ui.overlay) html += viewOverlay();
  if (ui.serum) html += viewSerum();

  $app.innerHTML = html;
  postRender();
}

/* ---------------- language switcher ---------------- */
function langBar() {
  return `<div class="langbar">${LANGS.map(
    (l) => `<button class="langpill ${getLang() === l.code ? "on" : ""}" data-action="set-lang" data-lang="${l.code}">${l.code === "ar" ? "ع" : l.code.toUpperCase()}</button>`
  ).join("")}</div>`;
}
function langCycleBtn() {
  return `<button class="btn btn-ghost sm" data-action="cycle-lang" title="Language">🌐</button>`;
}

/* ---------------- PRE-ROOM ---------------- */
function colorSwatches() {
  return `<div class="swatches">${(config.colors || [])
    .map((c) => `<button type="button" class="swatch ${drafts.color === c ? "sel" : ""}" style="background:${c}" data-action="pick-color" data-color="${c}"></button>`)
    .join("")}</div>`;
}

function viewLoading() {
  return `<div class="screen center-screen"><div class="brand" style="font-size:52px">KYUUBI</div><p class="muted">…</p></div>`;
}
function viewAuthGate() {
  const isLogin = authTab === "login";
  return `<div class="screen center-screen">
    ${langBar()}
    <div class="panel form-card stack" style="margin-top:12px">
      <div class="brand" style="font-size:40px;text-align:center">KYUUBI</div>
      <h2 class="display" style="text-align:center;font-size:26px">${t("gate_title")}</h2>
      <p class="muted" style="text-align:center">${t("gate_sub")}</p>
      <div class="seg" style="align-self:center">
        <button class="${isLogin ? "on" : ""}" data-action="auth-tab" data-tab="login">${t("acc_login")}</button>
        <button class="${!isLogin ? "on" : ""}" data-action="auth-tab" data-tab="register">${t("acc_signup")}</button>
      </div>
      <label class="field">${t("acc_username")}
        <input class="input" id="gate-user" data-draft="authUser" maxlength="20" autocomplete="username" value="${esc(drafts.authUser)}" /></label>
      <label class="field">${t("acc_password")}
        <input class="input" id="gate-pass" type="password" data-draft="authPass" maxlength="64" autocomplete="${isLogin ? "current-password" : "new-password"}" value="${esc(drafts.authPass)}" /></label>
      ${authError ? `<div class="form-err">${esc(authError)}</div>` : ""}
      <button class="btn ${isLogin ? "btn-cyan" : "btn-pink"} block lg" data-action="${isLogin ? "gate-login" : "gate-register"}" ${authBusy ? "disabled" : ""}>${authBusy ? "…" : isLogin ? t("acc_login_cta") : t("acc_signup_cta")}</button>
    </div>
  </div>`;
}
function gateErr(code) {
  const map = { name_taken: "acc_err_name_taken", bad_username: "acc_err_bad_username", bad_password: "acc_err_bad_password", bad_login: "acc_err_bad_login" };
  return t(map[code] || "acc_err_generic");
}
async function doGateAuth(kind) {
  const u = (document.getElementById("gate-user")?.value || "").trim();
  const p = document.getElementById("gate-pass")?.value || "";
  drafts.authUser = u; drafts.authPass = p;
  if (!u || !p) { authError = t("acc_err_fill"); render(); return; }
  authBusy = true; authError = ""; render();
  const res = kind === "login" ? await apiPost("/api/login", { username: u, password: p }) : await apiPost("/api/register", { username: u, password: p });
  authBusy = false;
  if (res && res.ok) {
    localStorage.setItem("kyuubi.token", res.token);
    account = res.profile;
    if (!drafts.name) drafts.name = account.name;
    if (account.color) drafts.color = account.color;
    drafts.authUser = ""; drafts.authPass = ""; authError = "";
    render();
  } else {
    authError = gateErr(res && res.error);
    render();
  }
}

function viewPre() {
  if (pre === "create") {
    return `<div class="screen center-screen">
      <div class="panel form-card stack">
        <h2 class="display">${t("create_title")}</h2>
        <p class="muted">${t("create_sub")}</p>
        <label class="field">${t("your_name")}
          <input class="input" id="name-input" maxlength="16" placeholder="${t("name_ph_alex")}" data-draft="name" value="${esc(drafts.name)}" />
        </label>
        <label class="field">${t("pick_color")}</label>
        ${colorSwatches()}
        <button class="btn btn-pink block lg" data-action="create-room">${t("create_cta")}</button>
        <button class="link" data-action="goto-landing">${t("back")}</button>
      </div>
    </div>`;
  }
  if (pre === "join") {
    return `<div class="screen center-screen">
      <div class="panel form-card stack">
        <h2 class="display">${t("join_title")}</h2>
        <label class="field">${t("room_code")}
          <input class="input code-input" id="code-input" maxlength="10" placeholder="SPILL-XXXX" data-draft="joinCode" value="${esc(drafts.joinCode)}" />
        </label>
        <label class="field">${t("your_name")}
          <input class="input" id="name-input" maxlength="16" placeholder="${t("name_ph_sam")}" data-draft="name" value="${esc(drafts.name)}" />
        </label>
        <label class="field">${t("pick_color")}</label>
        ${colorSwatches()}
        <button class="btn btn-cyan block lg" data-action="join-room">${t("join_cta")}</button>
        <button class="link" data-action="goto-landing">${t("back")}</button>
      </div>
    </div>`;
  }
  return `<div class="screen center-screen hero">
    ${langBar()}
    <div class="brand">SPILL</div>
    <p class="tagline">${t("app_tagline")}</p>
    <div class="stack" style="max-width:360px;width:100%;margin-top:18px">
      <button class="btn btn-pink block lg" data-action="goto-create">${t("create_room")}</button>
      <button class="btn btn-cyan block lg" data-action="goto-join">${t("join_room")}</button>
    </div>
    <p class="muted count-hint" style="margin-top:20px">${t("players_range")}</p>
  </div>`;
}

/* ---------------- LOBBY ---------------- */
function seg(key, options, current) {
  return `<div class="seg">${options
    .map((o) => `<button data-action="set" data-key="${key}" data-val="${o.val}" class="${String(current) === String(o.val) ? "on" : ""}">${esc(o.label)}</button>`)
    .join("")}</div>`;
}

function viewLobby() {
  const me = myPlayer();
  const iAmHost = me && state.hostId === me.id;
  const connected = state.players.filter((p) => p.connected).length;
  const base = inviteBase();
  const joinUrl = `${base}/spill?room=${state.code}`;
  const s = state.settings;

  const playerRows = state.players
    .map((p) => `<div class="player-row">
        ${avatarHTML(p)}
        <div class="grow">
          <div class="name">${esc(p.name)} ${p.isHost ? "⭐" : ""} ${p.id === myId() ? `<span class="badge-you">${t("you_badge")}</span>` : ""}</div>
          <div class="muted count-hint">${p.connected ? t("ready") : t("away")}</div>
        </div>
        ${iAmHost && p.id !== state.hostId ? `<button class="btn btn-danger sm" data-action="kick" data-id="${p.id}">${t("remove")}</button>` : ""}
      </div>`)
    .join("");

  const left = `<div class="panel stack">
    <div class="row spread">
      <h2 class="display" style="font-size:24px">${t("players")} · ${connected}</h2>
      <span class="chip code">${state.code}</span>
    </div>
    <div class="player-list">${playerRows}</div>
    <div class="divider"></div>
    <div class="qr-box">
      <div class="muted count-hint">${t("join_hint", { url: `<b>${esc(base)}</b>`, code: `<b class="cost">${esc(state.code)}</b>` })}</div>
      <img src="/api/qr?text=${encodeURIComponent(joinUrl)}" alt="QR" onerror="this.style.display='none'" />
      <button class="btn btn-ghost sm" data-action="copy-link" data-link="${esc(joinUrl)}">${t("copy_link")}</button>
    </div>
  </div>`;

  const catToggles = Object.keys(config.categoryLabels || {})
    .filter((k) => k !== "custom" && k in s.categories)
    .map((k) => `<button class="cat-toggle ${s.categories[k] ? "on" : ""}" data-action="set" data-key="category" data-cat="${k}">
        <span>${s.categories[k] ? "✓" : "○"}</span><span>${esc(tCategory(k))}</span></button>`)
    .join("");

  const settings = iAmHost
    ? `<div class="panel settings-block">
        <h2 class="display" style="font-size:24px">${t("house_rules")}</h2>
        <div class="setting"><span class="label">${t("turn_timer")}</span>
          ${seg("turnTimer", [{ val: 15, label: "15s" }, { val: 30, label: "30s" }, { val: 45, label: "45s" }, { val: 60, label: "60s" }, { val: 0, label: t("off") }], s.turnTimer)}
        </div>
        <div class="setting"><span class="label">${t("win_condition")}</span>
          ${seg("winType", [{ val: "score", label: t("score_cap") }, { val: "rounds", label: t("rounds") }, { val: "endless", label: t("endless") }], s.winType)}
          ${s.winType !== "endless"
            ? `<label class="field">${s.winType === "score" ? t("points_to_win") : t("number_of_rounds")}
                <input class="input" type="number" min="1" max="999" data-change="winValue" value="${s.winValue}" /></label>`
            : `<span class="muted count-hint">${t("host_ends")}</span>`}
        </div>
        <div class="setting"><span class="label">${t("truth_dare")}</span>
          ${seg("tdRatio", [{ val: "free", label: t("free_pick") }, { val: "alternate", label: t("alternate") }, { val: "random", label: t("random") }, { val: "truth70", label: t("truth70") }], s.tdRatio)}
        </div>
        <div class="setting"><span class="label">${t("truth_style")}</span>
          ${seg("truthStyle", [{ val: "bluff", label: t("bluff_opt") }, { val: "speak", label: t("speak_opt") }], s.truthStyle)}
          <span class="muted count-hint">${t("bluff_desc")}</span>
        </div>
        <div class="setting"><span class="label">${t("spice_level")}</span>
          ${seg("spice", [{ val: "clean", label: t("clean") }, { val: "medium", label: t("medium_lvl") }, { val: "bold", label: t("bold_lvl") }], s.spice)}
        </div>
        <div class="setting"><span class="label">${t("superpowers")}</span>
          <label class="toggle"><input type="checkbox" data-change="powersEnabled" ${s.powersEnabled ? "checked" : ""} /><span class="track"></span><span>${t("powers_enabled")}</span></label>
          <span class="label" style="margin-top:6px">${t("starting_xp")}</span>
          ${seg("startingXp", [{ val: 0, label: "0" }, { val: 5, label: "5" }, { val: 10, label: "10" }], s.startingXp)}
        </div>
        <div class="setting"><span class="label">${t("chicken_penalty")}</span>
          ${seg("chickenPenalty", [{ val: 0, label: "0" }, { val: 1, label: "1" }, { val: 2, label: "2" }, { val: 3, label: "3" }], s.chickenPenalty)}
        </div>
        <div class="setting"><span class="label">${t("custom_cards")}</span>
          <label class="toggle"><input type="checkbox" data-change="allowCustom" ${s.allowCustom ? "checked" : ""} /><span class="track"></span><span>${t("allow_custom")}</span></label>
        </div>
        <div class="setting"><span class="label">${t("categories")}</span>
          <div class="cat-grid">${catToggles}</div>
        </div>
      </div>`
    : `<div class="panel stack">
        <h2 class="display" style="font-size:24px">${t("house_rules")}</h2>
        <div class="row wrap">
          <span class="chip">⏱ ${s.turnTimer ? s.turnTimer + "s" : t("no_timer")}</span>
          <span class="chip">🏁 ${s.winType === "score" ? t("first_to", { n: s.winValue }) : s.winType === "rounds" ? t("n_rounds", { n: s.winValue }) : t("endless")}</span>
          <span class="chip">🌶 ${tIntensity(s.spice === "clean" ? "light" : s.spice === "medium" ? "medium" : "bold")}</span>
          <span class="chip">🎭 ${s.truthStyle === "bluff" ? t("bluff_truths") : t("speak_truths")}</span>
          <span class="chip">⚡ ${s.powersEnabled ? t("powers_on") : t("powers_off")}</span>
        </div>
        <p class="muted count-hint">${t("only_host_rules")}</p>
      </div>`;

  const customAdder = s.allowCustom
    ? `<div class="panel stack">
        <span class="label">${t("add_custom_title")}</span>
        <div class="row">
          <select class="select" id="custom-type" style="max-width:130px">
            <option value="truth">${tType("truth")}</option>
            <option value="dare">${tType("dare")}</option>
          </select>
          <input class="input grow" id="custom-text" placeholder="${t("type_prompt_ph")}" data-draft="custom" value="${esc(drafts.custom)}" />
          <button class="btn btn-ghost" data-action="add-custom">${t("add")}</button>
        </div>
      </div>`
    : "";

  return `<div class="screen">
    <div class="topbar">
      <span class="brand">SPILL</span>
      <span class="grow"></span>
      ${langBar()}
      <button class="btn btn-ghost sm" data-action="toggle-mute">${sfx.muted ? "🔇" : "🔊"}</button>
      <button class="btn btn-ghost sm" data-action="leave">${t("leave")}</button>
    </div>
    <div class="lobby-grid">${left}${settings}</div>
    ${customAdder}
    ${iAmHost
      ? `<button class="btn btn-gold block lg" data-action="start-game" ${connected < 2 ? "disabled" : ""}>${connected < 2 ? t("waiting_players") : t("start_game")}</button>`
      : `<p class="muted center-screen">${t("waiting_host")}</p>`}
  </div>`;
}

/* ---------------- PLAYING ---------------- */
function scoreboardHTML() {
  return `<div class="scoreboard">${state.players
    .map((p) => {
      const active = p.id === state.currentPlayerId;
      const icons = p.powers.map((id) => powerIcon(id)).join("") + (p.shielded ? "🛡️" : "") + (p.mirrored ? "🪞" : "");
      return `<div class="pbadge ${active ? "active" : ""} ${p.connected ? "" : "disconnected"}">
        ${active ? '<div class="crown">🎤</div>' : ""}
        ${avatarHTML(p)}
        <div class="name">${esc(p.name)} ${p.id === myId() ? `<span class="badge-you">${t("you_badge")}</span>` : ""}</div>
        <div class="score ${bumpSet.has(p.id) ? "bump" : ""}">${p.score}</div>
        <div class="coins">${t("xp_unit")}</div>
        <div class="mini-powers">${icons}</div>
      </div>`;
    })
    .join("")}</div>`;
}

function timerRingHTML() {
  const tm = state.timer;
  const total = tm ? tm.total : state.settings.turnTimer || 0;
  const remaining = tm ? Math.max(0, tm.remaining) : total;
  const r = 70, C = 2 * Math.PI * r;
  const frac = total ? remaining / total : 1;
  const off = C * (1 - frac);
  const low = tm && remaining <= 5 && remaining > 0 ? "low" : "";
  const num = tm ? remaining : state.settings.turnTimer ? total : "∞";
  return `<div class="timer-ring ${low}">
    <svg viewBox="0 0 160 160">
      <circle class="track" cx="80" cy="80" r="${r}"></circle>
      <circle class="value" cx="80" cy="80" r="${r}" style="stroke-dasharray:${C};stroke-dashoffset:${off}"></circle>
    </svg>
    <div class="num">${num}</div>
  </div>`;
}

function promptCardHTML() {
  const p = state.currentPrompt;
  if (!p) return "";
  return `<div class="prompt-card type-${p.type}">
    <div class="meta">
      <span class="tag ${p.type}">${tType(p.type)}</span>
      <span class="chip">${esc(tCategory(p.category))}</span>
      <span class="tag ${p.intensity}">${tIntensity(p.intensity)}</span>
      ${p.write ? `<span class="chip">${t("write_first_tag")}</span>` : ""}
    </div>
    <div class="prompt-text">${esc(loc(p.text))}</div>
  </div>`;
}

function viewPlaying() {
  const me = myPlayer();
  const resp = playerById(state.respondingPlayerId);
  const iAmResp = me && state.respondingPlayerId === me.id;
  const iAmHost = me && state.hostId === me.id;
  const phase = state.turnPhase;
  const rname = esc(resp?.name || "");

  const top = `<div class="topbar">
    <span class="brand">SPILL</span>
    <span class="chip code">${state.code}</span>
    <span class="chip">${t("round", { n: state.round })}</span>
    <span class="chip">🎴 ${state.deck.truth}${tLetter("truth")}·${state.deck.dare}${tLetter("dare")}</span>
    <span class="chip xp-chip">⚡ ${me ? me.score : 0} ${t("xp_unit")}</span>
    <span class="grow"></span>
    ${langCycleBtn()}
    ${state.settings.powersEnabled ? `<button class="btn btn-violet sm" data-action="open-drawer">🛒 ${t("shop")}</button>` : ""}
    <button class="btn btn-ghost sm" data-action="toggle-mute">${sfx.muted ? "🔇" : "🔊"}</button>
    <button class="btn btn-ghost sm" data-action="leave">⋯</button>
  </div>`;

  let stage = "";

  if (phase === "choosing") {
    const freePick = state.settings.tdRatio === "free";
    stage = `<div class="stage">
      <div class="turn-name">${rname}</div>
      <div class="turn-sub">${iAmResp ? t("hotseat_you") : t("hotseat_other")}</div>
      ${iAmResp && freePick
        ? `<div class="choice-grid">
            <button class="choice truth" data-action="choose-type" data-type="truth"><span class="big">${tType("truth")}</span><span class="muted">${state.settings.truthStyle === "bluff" ? t("write_they_guess") : t("plus1_bold")}</span></button>
            <button class="choice dare" data-action="choose-type" data-type="dare"><span class="big">${tType("dare")}</span><span class="muted">${t("plus2_bold")}</span></button>
          </div>`
        : `<p class="hint">${freePick ? t("waiting_choose", { name: rname }) : t("drawing")}</p>`}
    </div>`;
  } else if (phase === "in_progress") {
    const p = state.currentPrompt;
    let action = "";
    if (iAmResp) {
      if (p?.write) {
        action = state.writtenSubmitted
          ? `<div class="revealed">${t("answer_locked_hint")}</div>
             <button class="btn btn-gold block lg" data-action="reveal">${t("reveal_vote")}</button>`
          : `<textarea class="textarea" id="answer-input" data-draft="written" placeholder="${t("answer_ph")}">${esc(drafts.written)}</textarea>
             <button class="btn btn-cyan block" data-action="lock-answer">${t("lock_answer")}</button>
             <button class="btn btn-gold block lg" data-action="reveal">${t("reveal_vote")}</button>`;
      } else {
        action = `<p class="hint">${t("say_out_loud")}</p>
          <button class="btn btn-gold block lg" data-action="reveal">${t("done_vote")}</button>`;
      }
    } else {
      action = `<p class="hint">${t("on_the_spot", { name: rname })}</p>${reactionBarHTML()}`;
    }
    stage = `<div class="stage">
      <div class="turn-name">${rname}</div>
      ${timerRingHTML()}
      ${promptCardHTML()}
      <div class="action-area">${action}</div>
    </div>`;
  } else if (phase === "bluff_write") {
    stage = `<div class="stage">
      <div class="turn-name">${rname}</div>
      ${timerRingHTML()}
      ${promptCardHTML()}
      <div class="action-area">
        ${iAmResp
          ? `<p class="hint">${t("bluff_write_hint")}</p>
             <label class="field">${t("the_truth")}<input class="input" id="bluff-real" data-draft="bluffReal" maxlength="160" placeholder="${t("real_ph")}" value="${esc(drafts.bluffReal)}" /></label>
             <label class="field">${t("bluff1")}<input class="input" id="bluff-f1" data-draft="bluffFake1" maxlength="160" placeholder="${t("lie1_ph")}" value="${esc(drafts.bluffFake1)}" /></label>
             <label class="field">${t("bluff2")}<input class="input" id="bluff-f2" data-draft="bluffFake2" maxlength="160" placeholder="${t("lie2_ph")}" value="${esc(drafts.bluffFake2)}" /></label>
             <button class="btn btn-gold block lg" data-action="submit-bluff">${t("send_room")}</button>
             <button class="link" data-action="bluff-chicken">${t("cant_answer")}</button>`
          : `<p class="hint">${t("cooking_bluff", { name: rname })}</p>${reactionBarHTML()}`}
      </div>
    </div>`;
  } else if (phase === "bluff_guess") {
    const opts = state.bluff?.options || [];
    const guessedIds = state.bluff?.guessedIds || [];
    const iGuessed = guessedIds.includes(myId());
    const voterCount = state.players.filter((p) => p.connected && p.id !== state.respondingPlayerId).length;
    stage = `<div class="stage">
      <div class="turn-sub">${t("which_real", { name: rname })}</div>
      ${timerRingHTML()}
      ${promptCardHTML()}
      <div class="action-area">
        ${iAmResp
          ? `<p class="hint">${t("room_guessing")}</p><div class="count-hint">${t("n_guessed", { done: guessedIds.length, total: voterCount })}</div>`
          : `<div class="bluff-options">
              ${opts.map((o) => `<button class="bluff-opt ${myGuess === o.id ? "picked" : ""}" data-action="guess" data-opt="${o.id}" ${iGuessed ? "disabled" : ""}>${esc(o.text)}</button>`).join("")}
             </div>
             <p class="hint">${iGuessed ? t("locked_waiting", { done: guessedIds.length, total: voterCount }) : t("tap_true")}</p>`}
        ${iAmResp || iAmHost ? `<button class="btn btn-ghost sm" data-action="reveal">${t("reveal_now")}</button>` : ""}
      </div>
    </div>`;
  } else if (phase === "bluff_reveal") {
    const opts = state.bluff?.options || [];
    const realId = state.bluff?.realId;
    const guesses = state.bluff?.guesses || {};
    const res = state.bluffResult || {};
    const byOpt = {};
    Object.entries(guesses).forEach(([pid, oid]) => (byOpt[oid] = byOpt[oid] || []).push(pid));
    const canNext = iAmHost || iAmResp || (me && me.id === state.currentPlayerId);

    // Personalize the headline to the viewer: the writer sees their bluff result,
    // a guesser sees whether THEY guessed right, a spectator sees the writer result.
    const writerVerdict = res.hostPoints > 0 ? t("fooled_n", { n: (res.fooledPids || []).length }) : t("read_book");
    const writerClass = res.hostPoints > 0 ? "done" : "chicken";
    let vClass, verdict;
    const myGuessId = guesses[myId()];
    if (iAmResp) {
      vClass = writerClass;
      verdict = writerVerdict;
    } else if (myGuessId) {
      const right = myGuessId === realId;
      vClass = right ? "done" : "chicken";
      verdict = right ? t("guess_correct") : t("guess_wrong");
    } else {
      vClass = writerClass;
      verdict = writerVerdict;
    }

    stage = `<div class="stage">
      ${promptCardHTML()}
      <div class="bluff-options reveal">
        ${opts.map((o) => {
          const isReal = o.id === realId;
          const pickers = (byOpt[o.id] || []).map((pid) => {
            const p = playerById(pid);
            return p ? `<span class="pick-chip" style="background:${esc(p.color)}" title="${esc(p.name)}">${esc(initials(p.name))}</span>` : "";
          }).join("");
          return `<div class="bluff-opt ${isReal ? "real" : "fake"}">${isReal ? "✅ " : ""}${esc(o.text)}<div class="pickers">${pickers}</div></div>`;
        }).join("")}
      </div>
      <div class="outcome ${vClass}">
        <div class="verdict">${verdict}</div>
        <div class="pts">${t("bluff_score_line", { name: rname, points: res.hostPoints || 0, correct: (res.correctPids || []).length })}</div>
      </div>
      <div class="action-area">
        ${canNext ? `<button class="btn btn-gold block lg" data-action="next-turn">${t("next_turn")}</button>` : `<p class="hint">${t("next_coming")}</p>`}
      </div>
      ${reactionBarHTML()}
    </div>`;
  } else if (phase === "voting") {
    const myVote = state.votes.voters[myId()];
    const p = state.currentPrompt;
    const tally = `<div class="vote-tally"><span class="done">✅ ${state.votes.done}</span><span class="chicken">🐔 ${state.votes.chicken}</span></div>`;
    let voteUI;
    if (iAmResp) {
      voteUI = `<p class="hint">${t("deciding_fate")}</p>${tally}`;
    } else {
      voteUI = `<div class="vote-grid">
          <button class="btn btn-cyan lg" data-action="vote" data-vote="done" ${myVote ? "disabled" : ""}>${t("nailed_it")}</button>
          <button class="btn btn-pink lg" data-action="vote" data-vote="chicken" ${myVote ? "disabled" : ""}>${t("chickened_btn")}</button>
        </div>
        ${myVote ? `<p class="hint">${t("you_voted", { vote: myVote === "done" ? t("vote_nailed") : t("vote_chicken") })}</p>` : ""}
        ${tally}`;
    }
    stage = `<div class="stage">
      <div class="turn-sub">${t("did_pull_off", { name: rname })}</div>
      ${promptCardHTML()}
      ${p?.write && state.revealedAnswer ? `<div class="revealed">“${esc(state.revealedAnswer)}”</div>` : ""}
      <div class="action-area">${voteUI}
        ${iAmHost ? `<div class="row" style="justify-content:center;margin-top:6px"><span class="muted count-hint">${t("host_call")}</span>
          <button class="btn btn-ghost sm" data-action="force" data-result="done">${t("done_short")}</button>
          <button class="btn btn-ghost sm" data-action="force" data-result="chicken">${t("chicken_short")}</button></div>` : ""}
      </div>
    </div>`;
  } else if (phase === "reveal") {
    const o = state.outcome;
    const canNext = iAmHost || iAmResp || (me && me.id === state.currentPlayerId);
    stage = `<div class="stage">
      ${promptCardHTML()}
      ${o ? `<div class="outcome ${o.result}">
              <div class="verdict">${o.result === "done" ? t("verdict_nailed") : t("verdict_chicken")}</div>
              <div class="pts">${t("pts_line", { points: o.points > 0 ? "+" + o.points : o.points, name: esc(o.playerName) })}</div>
            </div>` : ""}
      <div class="action-area">
        ${canNext ? `<button class="btn btn-gold block lg" data-action="next-turn">${t("next_turn")}</button>` : `<p class="hint">${t("next_coming")}</p>`}
      </div>
      ${reactionBarHTML()}
    </div>`;
  }

  const footer = `${feedHTML()}
    ${iAmHost ? `<div class="row" style="justify-content:center"><button class="btn btn-danger sm" data-action="end-game">${t("end_game_early")}</button></div>` : ""}`;

  return `<div class="screen">${top}${scoreboardHTML()}${stage}${footer}</div>`;
}

function reactionBarHTML() {
  return `<div class="reaction-bar">${REACTIONS.map((e) => `<button data-action="react" data-emoji="${e}">${e}</button>`).join("")}</div>`;
}
function feedHTML() {
  return `<div class="feed" id="feed">${(state.log || []).map((e) => `<div class="entry">${esc(tLog(e))}</div>`).join("")}</div>`;
}

/* ---------------- DRAWER ---------------- */
function viewDrawer() {
  const me = myPlayer();
  const xp = me ? me.score : 0;
  const shop = config.powers.map((pw) => {
    const meta = tPower(pw.id);
    const armed = (pw.id === "shield" && me?.shielded) || (pw.id === "mirror" && me?.mirrored);
    const disabled = xp < pw.cost || armed;
    return `<div class="power-card">
      <div class="row spread"><span class="picon">${pw.icon}</span><span class="cost">${pw.cost}</span></div>
      <div class="pname">${esc(meta.name)}</div>
      <div class="pblurb">${esc(meta.blurb)}</div>
      ${meta.note ? `<div class="pnote">${esc(meta.note)}</div>` : ""}
      <button class="btn ${disabled ? "btn-ghost" : "btn-violet"} sm" data-action="buy-power" data-power="${pw.id}" ${disabled ? "disabled" : ""}>
        ${armed ? t("armed") : t("buy_cost", { n: pw.cost })}</button>
    </div>`;
  }).join("");

  const counts = {};
  (me?.powers || []).forEach((id) => (counts[id] = (counts[id] || 0) + 1));
  const trayItems = Object.entries(counts).map(([id, n]) => {
    const pw = powerMeta(id);
    if (!pw) return "";
    const meta = tPower(id);
    const usable = canUsePower(pw);
    return `<div class="owned-pill">
      <span>${pw.icon} ${esc(meta.name)} ${n > 1 ? "×" + n : ""}</span>
      <button class="btn ${usable ? "btn-cyan" : "btn-ghost"} sm" data-action="use-power" data-power="${id}" ${usable ? "" : "disabled"}>${t("use")}</button>
    </div>`;
  }).join("");
  const armedBadges = (me?.shielded ? `<span class="armed-badge">${t("shield_armed")}</span>` : "") + (me?.mirrored ? `<span class="armed-badge">${t("mirror_armed")}</span>` : "");
  const tray = trayItems || armedBadges
    ? `<div class="stack">${armedBadges ? `<div class="row wrap">${armedBadges}</div>` : ""}${trayItems}</div>`
    : `<div class="empty-note">${t("no_powers")}</div>`;

  const body = ui.drawerTab === "shop" ? `<div class="power-grid">${shop}</div>` : tray;

  return `<div class="drawer-backdrop" data-action="close-drawer">
    <div class="drawer" data-stop="1">
      <div class="drawer-head">
        <div class="tabs">
          <button class="${ui.drawerTab === "shop" ? "on" : ""}" data-action="drawer-tab" data-tab="shop">${t("shop_tab")}</button>
          <button class="${ui.drawerTab === "tray" ? "on" : ""}" data-action="drawer-tab" data-tab="tray">${t("powers_tab")}</button>
        </div>
        <div class="row"><span class="chip">⚡ ${t("xp_n", { n: xp })}</span><button class="btn btn-ghost sm" data-action="close-drawer">✕</button></div>
      </div>
      ${body}
    </div>
  </div>`;
}

function canUsePower(pw) {
  if (!state || state.status !== "playing") return false;
  const me = myPlayer();
  if (!me) return false;
  if (pw.id === "skip") return state.respondingPlayerId === me.id;
  if (pw.phase === "my_turn") return state.respondingPlayerId === me.id && !!state.currentPrompt;
  if (pw.phase === "reveal")
    return (state.settings.truthStyle === "bluff" && state.bluff?.submitted) || (!!state.currentPrompt?.write && state.writtenSubmitted);
  return true;
}

/* ---------------- OVERLAYS ---------------- */
function viewOverlay() {
  const o = ui.overlay;
  if (o.type === "target") {
    const pw = tPower(o.powerId);
    const meMeta = powerMeta(o.powerId);
    const me = myPlayer();
    const targets = state.players.filter((p) => p.connected && p.id !== me.id);
    const rows = targets.length
      ? targets.map((p) => `<button class="pick-row" data-action="pick-target" data-target="${p.id}">
          ${avatarHTML(p)}<span>${esc(p.name)}</span><span class="score">${p.score}</span></button>`).join("")
      : `<div class="empty-note">${t("no_target")}</div>`;
    return modalHTML(`${meMeta?.icon || ""} ${pw.name}`, `<div class="pick-list">${rows}</div>`);
  }
  if (o.type === "sabotage") {
    const rows = (o.dares || []).map((d) => `<button class="pick-row" data-action="pick-sabotage" data-qid="${d.id}">
        <span>😈</span><span class="grow" style="text-align:start">${esc(loc(d.text))}</span><span class="tag ${d.intensity}">${tIntensity(d.intensity)}</span></button>`).join("");
    return modalHTML(t("pick_dare_title"),
      `<div class="pick-list">${rows || `<div class="empty-note">${t("no_dares")}</div>`}
        <button class="btn btn-violet" data-action="sabotage-random">${t("surprise_random")}</button></div>`);
  }
  return "";
}
function viewSerum() {
  const label = ui.serum.bluff ? t("serum_real", { name: esc(ui.serum.ofName) }) : t("serum_secret", { name: esc(ui.serum.ofName) });
  return modalHTML(t("serum_title"),
    `<p class="muted">${label}</p>
     <div class="revealed">“${esc(ui.serum.answer || t("serum_empty"))}”</div>
     <button class="btn btn-cyan block" data-action="close-serum">${t("serum_got_it")}</button>`,
    "close-serum");
}
function modalHTML(title, inner, closeAction = "close-overlay") {
  return `<div class="drawer-backdrop" style="align-items:center" data-action="${closeAction}">
    <div class="drawer" style="border-radius:22px;max-width:460px;max-height:80dvh" data-stop="1">
      <div class="drawer-head"><h3 class="display" style="font-size:22px">${title}</h3>
        <button class="btn btn-ghost sm" data-action="${closeAction}">✕</button></div>
      ${inner}
    </div>
  </div>`;
}

/* ---------------- FINISHED ---------------- */
function viewFinished() {
  const me = myPlayer();
  const iAmHost = me && state.hostId === me.id;
  const winner = playerById(state.winnerId);
  const iAmWinner = me && me.id === state.winnerId;
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const priv = state.privileges || { mode: null };

  const leaderboard = ranked.map((p, i) => {
    const medal = ["🥇", "🥈", "🥉"][i] || `#${i + 1}`;
    return `<div class="lb-row ${i === 0 ? "first" : ""}">
      <span class="rank">${medal}</span>${avatarHTML(p)}
      <span class="grow">${esc(p.name)} ${p.id === myId() ? `<span class="badge-you">${t("you_badge")}</span>` : ""}</span>
      <span class="score">${p.score}</span></div>`;
  }).join("");

  let privBlock = "";
  if (priv.mode === null) {
    privBlock = iAmWinner
      ? `<div class="panel stack" style="max-width:480px">
          <h3 class="display" style="font-size:22px">${t("winner_privilege")}</h3>
          <p class="muted">${t("claim_reward")}</p>
          <button class="btn btn-pink block lg" data-action="priv-tasks">${t("assign_tasks")}</button>
          <button class="btn btn-gold block lg" data-action="priv-wish">${t("claim_wish")}</button>
        </div>`
      : `<p class="hint">${t("waiting_privilege", { name: esc(winner?.name || "") })}</p>`;
  } else if (priv.mode === "tasks") {
    const tasks = (priv.tasks || []).map((tk) => `<div class="task-row" style="${tk.playerId === myId() ? "box-shadow:var(--glow-pink)" : ""}">
        <div class="avatar" style="background:${esc(tk.color)}">${esc(initials(tk.playerName))}</div>
        <div><b>${esc(tk.playerName)}${tk.playerId === myId() ? " " + t("you_excl") : ""}</b><br>${esc(loc(tk.text))}</div>
      </div>`).join("");
    privBlock = `<div class="panel stack" style="max-width:520px">
      <h3 class="display" style="font-size:22px">${t("winner_tasks")}</h3>
      <div class="stack">${tasks || `<div class="empty-note">${t("no_losers")}</div>`}</div>
      ${iAmWinner ? `<button class="btn btn-ghost" data-action="reshuffle-tasks">${t("shuffle_tasks")}</button>` : ""}
    </div>`;
  } else if (priv.mode === "wish") {
    if (priv.wish) {
      privBlock = `<div class="wish-box">${t("wishes", { name: esc(winner?.name || "") })}<br><b>“${esc(priv.wish)}”</b></div>`;
    } else if (iAmWinner) {
      privBlock = `<div class="panel stack" style="max-width:480px">
        <h3 class="display" style="font-size:22px">${t("make_wish_title")}</h3>
        <textarea class="textarea" id="wish-input" data-draft="wish" placeholder="${t("wish_ph")}">${esc(drafts.wish)}</textarea>
        <button class="btn btn-gold block" data-action="make-wish">${t("make_official")}</button>
      </div>`;
    } else {
      privBlock = `<p class="hint">${t("making_wish", { name: esc(winner?.name || "") })}</p>`;
    }
  }

  return `<div class="screen center-screen">
    <div class="winner-wrap">
      <div class="row">${langBar()}</div>
      <div class="winner-avatar" style="background:${esc(winner?.color || "#FFC53D")}">
        <div class="crown">👑</div>${esc(initials(winner?.name || "?"))}
      </div>
      <div class="winner-name">${t("wins", { name: esc(winner?.name || "") })}</div>
      <div class="chip code">${t("points_n", { n: winner?.score ?? 0 })}</div>
      <div class="leaderboard">${leaderboard}</div>
      ${privBlock}
      <div class="row" style="margin-top:8px">
        ${iAmHost ? `<button class="btn btn-cyan lg" data-action="play-again">${t("play_again")}</button>` : ""}
        <button class="btn btn-ghost" data-action="leave">${t("leave")}</button>
      </div>
    </div>
  </div>`;
}

/* ---------------- events ---------------- */
$app.addEventListener("click", (e) => {
  const t2 = e.target.closest("[data-action]");
  if (!t2) return;
  try { onAction(t2.dataset.action, t2, e); } catch (err) { console.error(err); }
});
$app.addEventListener("change", (e) => {
  const key = e.target.dataset.change;
  if (!key) return;
  let val;
  if (e.target.type === "checkbox") val = e.target.checked;
  else if (e.target.type === "number") val = Number(e.target.value);
  else val = e.target.value;
  socket.emit("update_settings", { [key]: val });
});
$app.addEventListener("input", (e) => {
  const k = e.target.dataset.draft;
  if (!k) return;
  let v = e.target.value;
  if (k === "joinCode") v = v.toUpperCase();
  drafts[k] = v;
});
$app.addEventListener("focusin", (e) => { if (e.target.id) lastFocused = e.target.id; });

function onAction(action, el) {
  switch (action) {
    case "auth-tab": authTab = el.dataset.tab; authError = ""; render(); break;
    case "gate-login": doGateAuth("login"); break;
    case "gate-register": doGateAuth("register"); break;
    case "set-lang":
      setLang(el.dataset.lang);
      render();
      break;
    case "cycle-lang": {
      const codes = LANGS.map((l) => l.code);
      const next = codes[(codes.indexOf(getLang()) + 1) % codes.length];
      setLang(next);
      render();
      break;
    }
    case "goto-create": pre = "create"; sfx.click(); render(); break;
    case "goto-join": pre = "join"; sfx.click(); render(); break;
    case "goto-landing": pre = "landing"; render(); break;
    case "pick-color": drafts.color = el.dataset.color; render(); break;
    case "create-room":
      socket.emit("create_room", { name: drafts.name, color: drafts.color, token: accountToken() }, (res) => {
        if (res?.ok) { saveSession({ code: res.code, playerId: res.playerId }); applyState(res.state); }
        else if (res?.error === "login_required") { toast(t("login_required"), "error"); forceLogin(); }
        else toast(tErr(res?.error || "Could not create room."), "error");
      });
      break;
    case "join-room":
      if (!drafts.joinCode.trim()) return toast(t("enter_code"), "error");
      if (!drafts.name.trim()) return toast(t("enter_name"), "error");
      socket.emit("join_room", { code: drafts.joinCode, name: drafts.name, color: drafts.color, token: accountToken() }, (res) => {
        if (res?.ok) { saveSession({ code: res.code, playerId: res.playerId }); applyState(res.state); }
        else if (res?.error === "login_required") { toast(t("login_required"), "error"); forceLogin(); }
        else toast(tErr(res?.error || "Could not join."), "error");
      });
      break;
    case "set": {
      const key = el.dataset.key;
      if (key === "category") {
        const cat = el.dataset.cat;
        socket.emit("update_settings", { categories: { [cat]: !state.settings.categories[cat] } });
      } else {
        let val = el.dataset.val;
        if (["turnTimer", "winValue", "startingXp", "chickenPenalty", "maxPlayers"].includes(key)) val = Number(val);
        socket.emit("update_settings", { [key]: val });
      }
      sfx.click();
      break;
    }
    case "add-custom": {
      const type = document.getElementById("custom-type")?.value || "truth";
      const text = drafts.custom.trim();
      if (!text) return toast(t("type_prompt_first"), "error");
      socket.emit("add_custom", { type, text });
      drafts.custom = "";
      const ct = document.getElementById("custom-text");
      if (ct) ct.value = "";
      toast(t("card_added"), "ok");
      break;
    }
    case "copy-link":
      navigator.clipboard?.writeText(el.dataset.link).then(
        () => toast(t("link_copied"), "ok"),
        () => toast(t("copy_failed"), "error")
      );
      break;
    case "kick": socket.emit("kick", { playerId: el.dataset.id }); break;
    case "start-game": socket.emit("start_game"); break;
    case "leave":
      if (confirm(t("confirm_leave"))) {
        socket.emit("leave_room");
        clearSession();
        state = null;
        pre = "landing";
        ui = { drawerOpen: false, drawerTab: "shop", overlay: null, serum: null };
        render();
      }
      break;
    case "choose-type": socket.emit("choose_type", { type: el.dataset.type }); break;
    case "lock-answer": {
      const text = document.getElementById("answer-input")?.value || "";
      if (!text.trim()) return toast(t("write_something"), "error");
      socket.emit("submit_written_answer", { text });
      break;
    }
    case "reveal": socket.emit("request_reveal"); break;
    case "submit-bluff": {
      const real = document.getElementById("bluff-real")?.value || "";
      const f1 = document.getElementById("bluff-f1")?.value || "";
      const f2 = document.getElementById("bluff-f2")?.value || "";
      if (!real.trim() || !f1.trim() || !f2.trim()) return toast(t("fill_bluff"), "error");
      socket.emit("submit_bluff", { real, fake1: f1, fake2: f2 });
      break;
    }
    case "guess":
      myGuess = el.dataset.opt;
      socket.emit("guess_bluff", { optionId: el.dataset.opt });
      sfx.click();
      render();
      break;
    case "bluff-chicken":
      if (confirm(t("confirm_chicken"))) socket.emit("chicken_out");
      break;
    case "vote": socket.emit("cast_vote", { vote: el.dataset.vote }); sfx.click(); break;
    case "force": socket.emit("force_resolve", { result: el.dataset.result }); break;
    case "next-turn": socket.emit("next_turn"); break;
    case "end-game": if (confirm(t("confirm_end"))) socket.emit("end_game"); break;
    case "react":
      socket.emit("reaction", { emoji: el.dataset.emoji });
      floatEmoji(el.dataset.emoji, myPlayer()?.color);
      break;
    case "toggle-mute": sfx.toggleMute(); render(); break;
    case "open-drawer": ui.drawerOpen = true; sfx.click(); render(); break;
    case "close-drawer": if (el.dataset.stop) return; ui.drawerOpen = false; render(); break;
    case "drawer-tab": ui.drawerTab = el.dataset.tab; render(); break;
    case "buy-power": socket.emit("buy_power", { powerId: el.dataset.power }); break;
    case "use-power": {
      const id = el.dataset.power;
      const pw = powerMeta(id);
      if (!pw) break;
      if (pw.target === "player") { ui.overlay = { type: "target", powerId: id }; render(); }
      else if (pw.target === "dare") {
        socket.emit("sabotage_options", {}, (res) => { ui.overlay = { type: "sabotage", powerId: id, dares: res?.dares || [] }; render(); });
      } else { socket.emit("use_power", { powerId: id }); ui.drawerOpen = false; render(); }
      break;
    }
    case "pick-target":
      socket.emit("use_power", { powerId: ui.overlay.powerId, targetId: el.dataset.target });
      ui.overlay = null; ui.drawerOpen = false; render();
      break;
    case "pick-sabotage":
      socket.emit("use_power", { powerId: ui.overlay.powerId, questionId: el.dataset.qid });
      ui.overlay = null; ui.drawerOpen = false; render();
      break;
    case "sabotage-random":
      socket.emit("use_power", { powerId: ui.overlay.powerId });
      ui.overlay = null; ui.drawerOpen = false; render();
      break;
    case "close-overlay": if (el.dataset.stop) return; ui.overlay = null; render(); break;
    case "close-serum": if (el.dataset.stop) return; ui.serum = null; render(); break;
    case "priv-tasks": socket.emit("set_privilege_mode", { mode: "tasks" }); break;
    case "priv-wish": socket.emit("set_privilege_mode", { mode: "wish" }); break;
    case "reshuffle-tasks": socket.emit("reshuffle_tasks"); break;
    case "make-wish": {
      const text = document.getElementById("wish-input")?.value || "";
      if (!text.trim()) return toast(t("type_wish_first"), "error");
      socket.emit("claim_wish", { text });
      break;
    }
    case "play-again":
      socket.emit("play_again");
      ui = { drawerOpen: false, drawerTab: "shop", overlay: null, serum: null };
      break;
  }
}

/* ---------------- timer ring live update ---------------- */
function updateTimerRing(tm) {
  if (state?.timer) state.timer.remaining = tm.remaining;
  const ring = document.querySelector(".timer-ring");
  if (!ring) return;
  const num = ring.querySelector(".num");
  const val = ring.querySelector(".value");
  const remaining = Math.max(0, tm.remaining);
  if (num) num.textContent = remaining;
  const r = 70, C = 2 * Math.PI * r;
  const frac = tm.total ? remaining / tm.total : 0;
  if (val) val.style.strokeDashoffset = C * (1 - frac);
  const low = remaining <= 5 && remaining > 0;
  ring.classList.toggle("low", low);
  if (low) sfx.tick();
}

/* ---------------- post-render ---------------- */
function captureFocus() {
  const a = document.activeElement;
  lastFocused = a && a.id ? a.id : lastFocused;
}
function postRender() {
  if (lastFocused) {
    const el = document.getElementById(lastFocused);
    if (el && typeof el.focus === "function") {
      el.focus();
      if (el.setSelectionRange && typeof el.value === "string") {
        const n = el.value.length;
        try { el.setSelectionRange(n, n); } catch {}
      }
    }
  }
  const feed = document.getElementById("feed");
  if (feed) feed.scrollTop = feed.scrollHeight;
}

/* ---------------- boot ---------------- */
(function boot() {
  applyDir();
  const urlRoom = new URLSearchParams(location.search).get("room");
  if (urlRoom) {
    const code = urlRoom.toUpperCase();
    // A shared invite link is authoritative. If this device has a stale session
    // pointing at a *different* room, drop it — otherwise the connect handler would
    // auto-rejoin (or fail to find) that old room instead of the one in the link.
    if (session && session.code !== code) clearSession();
    drafts.joinCode = code;
    pre = "join";
  }
  render();
  // Require login: check the session, then reveal the game or the login wall.
  const tok = accountToken();
  if (!tok) {
    authChecked = true;
    if (!state) render();
  } else {
    fetch("/api/me", { headers: { Authorization: "Bearer " + tok } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.profile) {
          account = d.profile;
          if (!drafts.name) drafts.name = account.name;
          if (account.color) drafts.color = account.color;
        } else {
          localStorage.removeItem("kyuubi.token");
        }
        authChecked = true;
        if (!state) render();
      })
      .catch(() => { authChecked = true; if (!state) render(); });
  }
})();
