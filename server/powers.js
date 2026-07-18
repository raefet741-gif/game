// server/powers.js
// The Power Shop catalog. Effect logic lives in rooms.js (it mutates room state);
// this module is the single source of truth for what exists, what it costs, and
// the metadata the client needs to render + gate the buttons.
//
// Fields:
//   id        stable slug used in socket events
//   name      display name
//   icon      emoji shown on the card
//   cost      points to buy
//   blurb     one-line effect description
//   use       'active'  => sits in the player's tray until fired via use_power
//             'passive' => arms itself the moment it is bought (Shield / Mirror)
//   target    what the client must collect before firing:
//             'none' | 'player' | 'dare'
//   offensive true => counts against the "one offensive power per turn" cap
//             and can be blocked by Shield / bounced by Mirror
//   phase     when it may be fired (client hint; server re-validates):
//             'anytime'  usable any time during play
//             'my_turn'  only when you are the one in the hot seat
//             'reveal'   only while a write-first answer is pending a reveal
//   note      optional extra rule surfaced in the UI

export const POWERS = [
  {
    id: "truth_serum",
    name: "Truth Serum",
    icon: "🧪",
    cost: 6,
    blurb: "Secretly peek at the hot-seat player's written answer before the reveal.",
    use: "active",
    target: "none",
    offensive: false,
    phase: "reveal",
    note: "Only works on write-first truths (the ✍️ ones).",
  },
  {
    id: "pickpocket",
    name: "Pickpocket",
    icon: "🕵️",
    cost: 5,
    blurb: "Steal 1 coin from any player you choose.",
    use: "active",
    target: "player",
    offensive: true,
    phase: "anytime",
  },
  {
    id: "boomerang",
    name: "Boomerang",
    icon: "🪃",
    cost: 5,
    blurb: "Fling your current prompt at another player — now they have to do it.",
    use: "active",
    target: "player",
    offensive: true,
    phase: "my_turn",
  },
  {
    id: "shield",
    name: "Shield",
    icon: "🛡️",
    cost: 4,
    blurb: "Auto-blocks the next steal or swap aimed at you.",
    use: "passive",
    target: "none",
    offensive: false,
    phase: "anytime",
    note: "Arms instantly when bought.",
  },
  {
    id: "double_down",
    name: "Double Down",
    icon: "⚡",
    cost: 4,
    blurb: "Your next answer or dare is worth double points.",
    use: "active",
    target: "none",
    offensive: false,
    phase: "my_turn",
  },
  {
    id: "reroll",
    name: "Reroll",
    icon: "🎲",
    cost: 3,
    blurb: "Toss the current prompt and draw a fresh one of the same type.",
    use: "active",
    target: "none",
    offensive: false,
    phase: "my_turn",
  },
  {
    id: "sabotage",
    name: "Sabotage",
    icon: "😈",
    cost: 5,
    blurb: "Hand-pick the dare the next player will be forced to do.",
    use: "active",
    target: "dare",
    offensive: true,
    phase: "anytime",
  },
  {
    id: "spotlight",
    name: "Spotlight",
    icon: "🔦",
    cost: 4,
    blurb: "Drag any player into the hot seat for the next turn.",
    use: "active",
    target: "player",
    offensive: true,
    phase: "anytime",
  },
  {
    id: "time_bandit",
    name: "Time Bandit",
    icon: "⏳",
    cost: 3,
    blurb: "Cut a chosen player's next turn timer in half.",
    use: "active",
    target: "player",
    offensive: true,
    phase: "anytime",
  },
  {
    id: "skip",
    name: "Skip",
    icon: "🏳️",
    cost: 3,
    blurb: "Skip your turn with zero penalty. Once per game.",
    use: "active",
    target: "none",
    offensive: false,
    phase: "my_turn",
    note: "One use per player, per game.",
  },
  // --- Creative additions ---
  {
    id: "mirror",
    name: "Mirror",
    icon: "🪞",
    cost: 4,
    blurb: "Bounces the next attack aimed at you straight back at whoever cast it.",
    use: "passive",
    target: "none",
    offensive: false,
    phase: "anytime",
    note: "Arms instantly. Resolves before Shield.",
  },
  {
    id: "wildcard",
    name: "Wildcard",
    icon: "🃏",
    cost: 3,
    blurb: "Flip your prompt to the opposite type — truth becomes dare, dare becomes truth.",
    use: "active",
    target: "none",
    offensive: false,
    phase: "my_turn",
  },
];

export const POWER_MAP = Object.fromEntries(POWERS.map((p) => [p.id, p]));

export function getPower(id) {
  return POWER_MAP[id] || null;
}
