# Snatch

Real-time multiplayer heist game. Hoard treasures. Steal each other's.

## Setup

```bash
npm install
npm run dev      # → localhost:1999
npm run deploy   # → snatch.YOUR-USERNAME.partykit.dev
```

No config changes needed — host auto-detected.

## Reveal screen

Players are shown in a horizontal strip at the top. Each treasure group reveals one at a time (host clicks "Reveal Next"). Bags appear below each hoarder's name. Snatched bags fly across the screen to the thief's column with coin spray on landing. Kept bags pulse green.

## Rules

- Each round: pick a Hoard (treasure to keep) + a Snatch (treasure to steal from others)
- 30 second timer — blanks auto-submitted on timeout
- Uncontested hoard = +100 coins
- Successful snatch = +100 coins per hoarder (full value each, even with multiple thieves)
- Dragon's Hoard (one-time): hoard 3 treasures
- Heist (one-time): snatch 3 treasures
- Game ends when total hoarded coins hits the goal
