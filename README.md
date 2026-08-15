# Medici — Online Auction Game

Reiner Knizia's 1995 auction classic (Grail Games 2016 rules) as a real-time,
server-authoritative multiplayer web game. 2-6 players, three days, ships,
tracks, and florins. Money spent bidding IS your score.

## Features

- Real-time multiplayer via Socket.IO: 5-char room codes, reconnect tokens,
  SQLite persistence, server-authoritative engine
- Bots: easy / medium / hard, added from the lobby, tuned by simulation
  sweeps (`sim/`)
- Rulebook-exact scoring: ship-value payments, per-commodity track awards,
  top-level bonuses, tie division, day-end free-fill, 3-day cumulative tracks
- Accessibility: shape-identity player counters (no color dependence), five
  CVD-safe color schemes
- Day-scoring summary overlay that pauses bot play until dismissed; per-room
  bot speed control when your ship is full

## Stack

- TypeScript everywhere: `shared/` pure engine (deterministic, RNG-injected),
  `server/` Express + Socket.IO + better-sqlite3, `client/` React + Vite +
  Zustand
- Docker: `docker-compose.yml`, container serves client build + API

## Run locally

```bash
npm install
npm run server          # API + socket server on :3001
cd client && npm install && npm run dev   # Vite dev server
```

Tests: `npm test` (vitest: engine, scoring, rules edge cases) ·
Typecheck: `npm run typecheck` ·
Full-game bot sweep: `npx tsx sim/sweep.mjs 20 6` ·
Socket integration: `URL=http://localhost:3001 BOT_DELAY_MS=50 node test-flow.mjs`

## Deploy

```bash
rsync -av --exclude node_modules --exclude .git --exclude dist ./ user@host:/opt/stacks/medici/
ssh user@host "cd /opt/stacks/medici && docker compose up -d --build"
```

Rules audit and interpretation notes: `RULES-AUDIT.md`. Game rules are
copyright Reiner Knizia / Grail Games; this is a fan implementation.
