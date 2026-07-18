# 🍸 SPILL

A real-time, **multi-device** truth-or-dare party game. Everyone joins from their own
phone or laptop, one person hosts and sets the rules, and each turn puts a player in the
**hot seat** to draw a Truth or Dare. Completing challenges earns **points**, points buy
**superpowers** (steal, shield, reroll, sabotage…), and the **winner** gets to assign
tasks or claim a wish.

Neon nightclub-arcade look. Works fully **offline on your WiFi** — the players' phones
only need to reach your computer, not the internet.

**Trilingual** 🌍 — every screen, power, setting, feed message **and all 202 cards** are
translated into **English, Français, and العربية**, with full **right-to-left** layout for
Arabic. Each player picks their own language independently (pills on the landing/lobby, or
the 🌐 button in-game) — so one person can play in Arabic while another reads French in the
same room.

---

## ▶️ Run it (Windows, macOS, or Linux)

You need **Node.js 18+** (you already have Node 24). Then, in this folder:

```bash
npm install
npm start
```

You'll see something like:

```
────────────────────────────────────────────────────
  🍸  SPILL is live!
────────────────────────────────────────────────────
  On this PC:        http://localhost:3000
  On the same WiFi:  http://192.168.1.42:3000
────────────────────────────────────────────────────
```

- **On the host computer:** open `http://localhost:3000`, tap **Create a room**.
- **On every other phone/PC (same WiFi):** open the `http://192.168.x.x:3000` link,
  or scan the **QR code** shown in the lobby, then enter the room code.

> **Windows firewall:** the first time you run it, Windows may ask whether to allow Node
> to accept connections. Click **Allow access** (Private networks) so phones can join.
> If phones still can't connect, make sure they're on the **same WiFi** and that the
> network is set to *Private*, not *Public*.

Change the port with `PORT=4000 npm start` (or `set PORT=4000 && npm start` on Windows cmd).

---

## 🎮 How a game goes

1. **Host** creates a room and tweaks the **house rules** (timer, spice level, win
   condition, categories, superpowers, starting points, custom cards…).
2. Everyone joins the **lobby** by link or QR.
3. Host hits **Start**. Play rotates through the hot seat:
   - Choose (or get dealt) **Truth** or **Dare**, a random unused card is drawn.
   - **Dares** are performed out loud; the room votes **Nailed it / Chicken**.
   - **Truths** depend on the *Truth style* setting:
     - **🎭 Bluff (default):** the hot seat writes their **real answer + two lies**; everyone
       else guesses which is true. The writer scores **+1 for every player they fool**, and
       each correct guesser scores **+1** — so both sides play every round.
     - **🗣 Speak:** say it out loud (some deeper truths are typed privately first), then the
       room votes Nailed it / Chicken.
4. Anytime, open the **⚡ Power Shop** to spend points on superpowers.
5. First to the score cap (or last round, or host ends it) triggers the **Winner
   screen** — confetti, crown, and the winner's privilege.

### Two currencies: points 🏆 and coins 🪙
- **Points** are your **leaderboard score** — they decide who wins and are never spent.
- **Coins** are the **Power Shop currency**. You earn coins **and** points together every
  time you win a round, but only coins are spent on powers — so shopping never hurts your ranking.
- Everyone starts with a host-set number of **starting coins** (default 5) and **0 points**.

### Scoring
- Truth ✅ **+1**, Dare ✅ **+2**, **+1 bonus** for bold-intensity cards (added to *both* points and coins).
- Bluff: the writer scores for each player fooled; correct guessers score too (points + coins).
- Chicken out 🐔 costs the host-set penalty **in points**.
- **Double Down** doubles your next round's winnings. **Pickpocket** now steals a **coin**
  (an economy attack), while **Shield/Mirror** still defend against it.

### Superpowers
🧪 Truth Serum · 🕵️ Pickpocket · 🪃 Boomerang · 🛡️ Shield · ⚡ Double Down ·
🎲 Reroll · 😈 Sabotage · 🔦 Spotlight · ⏳ Time Bandit · 🏳️ Skip ·
🪞 Mirror *(bounces attacks back)* · 🃏 Wildcard *(flip truth ⇄ dare)*.

Defenses resolve **Mirror → Shield → effect**, and each player may fire only **one
offensive power per turn**, so nobody can be fully bullied out of the game.

---

## 🗂️ Project structure

```
Duo Game/
├─ package.json
├─ server/
│  ├─ index.js       Express static host + all Socket.IO event wiring + LAN IP/QR
│  ├─ rooms.js       Authoritative game engine (turns, timer, scoring, powers, win)
│  ├─ questions.js   200+ tagged prompts (Clash Night bank + SPILL additions)
│  └─ powers.js      Power Shop catalog + metadata
└─ public/
   ├─ index.html
   ├─ css/style.css  Neon design system
   └─ js/
      ├─ app.js      Client state, all screens, socket events, Power Shop UI
      └─ effects.js  Web-Audio SFX, confetti, floating emoji reactions
```

The server holds one authoritative `state` object per room and broadcasts it on every
change; clients are pure renderers of that snapshot. Rooms are in-memory and ephemeral
(no database), and are swept away ~20 minutes after everyone leaves.

---

## 🛠️ Notes & choices

- **Node instead of Flask.** The original spec suggested Flask + React; this build uses
  **Node + Express + Socket.IO** because Node was already installed here and Socket.IO
  auto-serves its own client — so there's **no build step and no internet dependency**.
  The architecture (authoritative room state over WebSockets, in-memory rooms, the same
  event contract) matches the spec.
- **Reconnects** are handled: your seat is remembered in the browser, so a phone that
  sleeps or a reloaded tab drops back into the same game.
- **Accessibility:** respects `prefers-reduced-motion`, has a 🔊 mute toggle, and uses
  large tap targets for phones.

Have fun — and maybe don't spill *everything*. 🤐
