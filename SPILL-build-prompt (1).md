# SPILL — Full Build Prompt (Flask + React)

> Paste this whole document into your AI coding assistant, or hand it to a developer.
> It is a complete spec for a real-time, multi-device truth-or-dare party game with a
> point economy and buyable superpowers.

---

## 0. The one-paragraph brief

Build **SPILL**, a real-time multiplayer party game (truth or dare) where each player
joins a room from their own phone or PC browser. One player is the **host** and sets the
rules. On each turn a player is put in the **hot seat** and draws a random Truth or Dare.
Completing challenges earns **points**. Points can be spent in a **Power Shop** on
superpowers that let players steal points, swap questions, peek at answers, and more.
Questions never repeat within a single game. At the end, the **winner** earns
**Winner's Privileges** — they assign fun tasks to everyone else or claim a reward they set.
The look is a bold, neon, nightclub-arcade aesthetic that feels exciting and premium.

---

## 1. Tech stack

- **Backend:** Python + **Flask** + **Flask-SocketIO** (real-time gameplay over WebSockets).
  - Game state kept in memory per room (dict keyed by room code); optionally back with Redis for persistence.
  - REST only for health check and seeding the question bank; everything gameplay-related runs over Socket.IO events.
- **Frontend:** **React** (Vite) + **socket.io-client** + React Router.
  - State via React Context or Zustand. No Redux needed.
  - Fully responsive — phones and desktops. Mobile-first.
- **No database required** for v1 (rooms are ephemeral). Add SQLite/Postgres later only if you want history or accounts.

---

## 2. Core game flow

1. **Create room** — host opens the app, taps *Create room*, configures settings (see §3), gets a **room code** (e.g. `SPILL-7F2K`) and a shareable QR/link.
2. **Join room** — other players open the link or enter the code, pick a **display name** and an **avatar color**, and land in the **lobby**.
3. **Lobby** — everyone sees the player list and scores at 0. Host taps *Start game* when ready.
4. **Turn loop** (repeats):
   - Game highlights the current **hot seat** player and starts their **turn timer**.
   - Player chooses **Truth** or **Dare** (or host setting forces a random pick).
   - App draws a **random unused** prompt from the enabled categories.
   - Player answers/performs. The room votes **Done / Chicken** (or host confirms).
   - **Points** awarded. Any **superpowers** can be triggered (see §6).
   - Turn passes to the next player.
5. **End condition** — first to the score cap, OR after N rounds, OR host ends manually (see §3).
6. **Winner screen** — winner gets **Winner's Privileges** (see §7). Show final leaderboard.

---

## 3. Host room settings (set at creation, editable in lobby)

The room creator can configure:

- **Turn timer:** 15s / 30s / 45s / 60s / off.
- **Win condition:** score cap (e.g. first to 30) OR fixed rounds (e.g. 10 rounds) OR endless (host ends).
- **Truth / Dare ratio:** e.g. force alternate, free choice, or weighted (70% truth).
- **Categories enabled:** toggle each category on/off (Relationships, Your type, Red flags, Friends, Love, Hate, Wants, Dreams, Secrets, Embarrassing, Deep, Funny, First impressions, plus all Dare packs).
- **Spice level:** Clean / Medium / Bold — filters the question pool by an `intensity` tag.
- **Superpowers:** on/off, and **starting points** each player begins with (e.g. 0, 5, 10).
- **Max players:** 2–16.
- **Allow custom questions:** players can add their own to the pool for this room.
- **Chicken penalty:** points lost or stolen when a player refuses a challenge.

---

## 4. Question system

### Rules
- Draw prompts **randomly across all enabled categories** — never march through one topic at a time. Shuffle the combined pool.
- **No repeats within a game:** track `used_question_ids` per room. A prompt is only eligible again after the game ends (pool resets on a new game).
- If the pool for a chosen type runs out, tell the room "You've been through every card!" and either reset or end.
- Each question has: `id`, `type` (truth | dare), `category`, `intensity` (light | medium | bold), `text`.

### Seed data (merge with the separate 180-prompt bank file)
Ship the bank as JSON. Example structure:

```json
[
  { "id": "t001", "type": "truth", "category": "relationships", "intensity": "medium",
    "text": "What's the most romantic thing you've ever done for someone?" },
  { "id": "d001", "type": "dare", "category": "first_impressions", "intensity": "light",
    "text": "Give your honest first impression of the person on your right." }
]
```

### NEW prompts to add (first-impressions + more variety)

First impressions:
- Give your honest first impression of the person on your right.
- Say one word that describes each person in the room right now.
- Who here did you completely misjudge when you first met them?
- If you'd met everyone here today for the first time, who would you befriend first?
- Whose vibe surprised you most once you got to know them?
- Rank the room by "who I'd trust with a secret" — fastest, no overthinking.
- Point to who you think is the most competitive person here and say why.
- Guess which player is most likely to become famous, and for what.

More random-variety questions:
- What's a talent you have that would genuinely surprise everyone here?
- If your life had a theme song, what would it be?
- What's the pettiest hill you will die on?
- What's a compliment you'd give yourself right now?
- If you could banish one word from existence, which one?
- What's the most "you" thing you own?
- What's a small win you had this week?
- Which app do you open first every morning, be honest?

More dares:
- Let the room give you a nickname you must respond to for two rounds.
- Do your best impression of the host.
- Text the 4th person in your chat list a single mysterious emoji.
- Describe the last thing you ate as if it were fine art.
- Swap seats with someone and defend their honor for one round.
- Give a 20-second TED talk on why your favorite snack is the best.

---

## 5. Points & scoring

- Truth answered (crowd counts it): **+1**
- Dare completed fully: **+2**
- Chicken out: lose the **chicken penalty** (host-set), or opponent steals it.
- Bold-intensity challenges: **+1 bonus**.
- Points are the **currency** for the Power Shop (§6).
- Show a live leaderboard everywhere; animate score changes.

---

## 6. Superpowers (the Power Shop)

Players spend points to buy powers. Each is a card with a cost, an icon, and a one-line effect.
Design so powers create drama but can't fully break the game (add cooldowns / one-per-turn caps).

| Power | Cost | Effect |
|-------|------|--------|
| **Truth Serum** | 6 | Peek at the hot-seat player's real written answer before the reveal (for write-first truths). |
| **Pickpocket** | 5 | Steal 1 point from any chosen player. |
| **Boomerang** | 5 | Pass your current question to another player of your choice. |
| **Shield** | 4 | Block the next steal or swap used against you (auto-triggers). |
| **Double Down** | 4 | Your next answer/dare is worth 2×. |
| **Reroll** | 3 | Discard the current prompt and draw a new one. |
| **Sabotage** | 5 | Choose the next player's dare from the pool. |
| **Spotlight** | 4 | Force a specific player to take the next turn. |
| **Time Bandit** | 3 | Cut an opponent's turn timer in half. |
| **Skip** | 3 | Skip your turn with no penalty (once per player per game). |

Implementation notes:
- A `powers` array on each player tracks owned/active powers.
- Buying and using powers are Socket.IO events broadcast to the room with a short animation.
- The "write-first truth" mode (needed for Truth Serum): some truths ask the player to type their answer privately first; the app stores it, and only reveals on the timer end — unless someone spent Truth Serum.
- Enforce: one offensive power per turn, Shield resolves before Pickpocket/Boomerang.

---

## 7. Winner's Privileges (the gift)

When the game ends, the winner gets a reward screen with two options:

1. **Assign tasks** — the app deals the winner one fun dare card per losing player; the winner assigns each one (or lets the app randomize). Losers must perform them.
2. **Claim a wish** — the winner types a custom (reasonable, group-agreed) request that the room fulfills.

Show a celebratory winner animation (confetti, crown on their avatar), the final leaderboard,
and a *Play again* button that resets scores and the used-question pool.

---

## 8. Screens / React components

1. **Landing** — Create room / Join room.
2. **Create room** — settings form (§3).
3. **Join room** — code + name + avatar color picker.
4. **Lobby** — player list, scores at 0, host's *Start* button, editable settings.
5. **Turn / Hot seat** — current player, timer ring, Truth/Dare choice, drawn card, Done/Chicken vote.
6. **Power Shop** — grid of power cards, buy buttons, owned powers tray (accessible any time via a drawer).
7. **Reveal** — shows the answer / dare result and animated score changes.
8. **Winner** — privileges screen + final leaderboard + play again.

Component list: `RoomSetup`, `JoinForm`, `Lobby`, `PlayerBadge`, `Scoreboard`, `HotSeat`,
`TimerRing`, `PromptCard`, `VoteBar`, `PowerShopDrawer`, `PowerCard`, `RevealModal`,
`WinnerScreen`, `Confetti`.

---

## 9. Socket.IO events (contract)

Client → server: `create_room`, `join_room`, `update_settings`, `start_game`,
`choose_type`, `draw_prompt`, `submit_written_answer`, `vote_result`, `buy_power`,
`use_power`, `next_turn`, `end_game`, `play_again`.

Server → client (broadcast to room): `room_state`, `player_joined`, `player_left`,
`game_started`, `prompt_drawn`, `timer_tick`, `score_update`, `power_used`,
`turn_changed`, `game_over`.

Keep a single authoritative `room_state` object the server owns; clients render from it.

```
room_state = {
  code, host_id, status,               // lobby | playing | finished
  settings: {...},                     // §3
  players: [{ id, name, color, score, powers: [], shielded }],
  current_player_id, current_prompt, timer_remaining,
  used_question_ids: [], round, deck: [...]
}
```

---

## 10. Design direction (make it attractive)

**Vibe:** neon nightclub-arcade. Dark, energetic, premium — not childish, not corporate.

**Palette**
- Background ink: `#0D0D22`
- Panel: `#1E1E3F`
- Primary (hot pink): `#FF3D77`
- Secondary (electric cyan): `#22E0D6`
- Accent (gold, for scores/winner): `#FFC53D`
- Violet (powers): `#8B5CF6`
- Text: `#F0EEFF` / muted `#9A9ABF`

**Type**
- Display / headers: a bold condensed face (e.g. *Anton* or *Archivo Expanded*) for that game-show punch.
- Body / UI: a clean geometric sans (e.g. *Space Grotesk* or *Inter*).

**Feel**
- Rounded cards (16px), soft glows on the primary color, tabular numbers for scores.
- A **countdown timer ring** as the centerpiece of the hot-seat screen — it drives adrenaline.
- Snappy micro-animations: cards flip in, scores tick up, powers fire with a quick flash.
- Confetti + crown on the winner. Sound effects (draw, buzzer, cha-ching on point steal) optional but great.
- Sentence case everywhere; short, punchy copy. Errors are helpful, never scary.

---

## 11. Build order (suggested)

1. Flask + SocketIO server with room create/join and the `room_state` broadcast.
2. React landing → create → join → lobby, all live-syncing.
3. Turn loop: hot seat, timer, prompt draw with no-repeat, Done/Chicken vote, scoring.
4. Question bank JSON + category/spice filtering + random shuffle.
5. Power Shop: buy/use, shield/steal/swap/reroll logic, animations.
6. Winner's Privileges + play again reset.
7. Polish: design pass, sounds, confetti, responsive checks, reduced-motion support.

---

## 12. Acceptance checklist

- [ ] Multiple players on different devices see the same live state.
- [ ] Host settings actually change gameplay (timer, categories, spice, ratio, win condition).
- [ ] Questions are random across topics and never repeat until the game ends.
- [ ] Truth and Dare both work, including write-first truths for Truth Serum.
- [ ] Points earned and spent correctly; leaderboard live and accurate.
- [ ] All superpowers work, with Shield resolving before steal/swap.
- [ ] Winner screen gives privileges and Play again resets scores + question pool.
- [ ] Looks great and is usable on a phone.
