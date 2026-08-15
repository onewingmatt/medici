# Medici — Implementation Scope

Status: DRAFT for approval. Rules verified against Grail Games 2016 rulebook (ed. 3.1, qugs.org/rules/r46.pdf) and cross-checked against two independent sources (Steffan O'Sullivan's 1999 panix.com review of the Amigo/Rio Grande editions; boardgamers.org WBC tournament summary). Board visuals analyzed from Steamforged 2024 marketing imagery (assetsio.gnwcdn.com board shot, Shopify CDN close-spill/mat-fan shots) and BoardGameQuest review photos.

## Game Summary

Reiner Knizia's 1995 auction classic, using the Grail Games 2016 edition rules. 2-6 players, ~60 minutes, played over three "days" (rounds). Players are Renaissance merchant-buyers competing at the Florence wholesale market. Each turn the active player reveals 1-3 commodity cards as an indivisible group and auctions them off (one bid-or-pass each, clockwise from the player left of the selector, selector bids last). Money spent bidding IS your end-game score — spend wisely. Each day ends when all but one ship is full (the last ship fills free from the deck) or the deck runs out. After each day: ship-value payments by rank, then per-commodity track advancement with 10/5 awards plus top-level bonuses. Most florins after day 3 wins; ties share the victory.

## Why This Game

- **Fits the taste profile.** Knizia's Auction Trilogy (Medici/Ra/Modern Art) is the canonical auction design. Medici's "money is points" tension makes it a deep, quick, interactive game (BGG 7.2, Spiel des Jahres 1995 recommendation). Pure auction + push-your-luck — no hidden state, no board geometry, so it maps cleanly onto the established Socket.IO party-game stack rather than the hex-grid engine stack.
- **Rules-light, decision-rich.** Teaches in minutes, plays in ~30-45 min online. Ideal for the existing real-time multiplayer pattern (So Clover / Sardegna): server-authoritative state, events-not-RPC, room codes, reconnect tokens.
- **Bot-friendly.** Turn structure is a clean decision loop: draw 1/2/3, then bid/pass. Three bot archetypes (Easy/Medium/Hard) map directly onto the existing bot scheduler pattern.
- **The hard problem is well-bounded.** Tie-division rounding on ship payments and track awards, plus the 3-day cumulative track state. That's a pure-function engine problem, testable headlessly — no vision extraction, no board data capture.

## Existing Digital Versions

- **Board Game Arena: NOT available.** Knizia's licensing has historically excluded free platforms (BGG thread "Knizia and Board Game Arena"; only select titles like Lost Cities appear, as premium). Multiple direct searches return no BGA page for Medici as of Aug 2026.
- **Mobile:** "Reiner Knizia's Medici" app (2011, iOS/Android) — AI-only, **no online play** (meadowparty.com, 2011; VideoGameGeek developer thread). Reports in BGG's "Knizia on iOS" thread indicate most Knizia apps have been delisted/are outdated. Not a modern multiplayer option.
- **No Steam release.**
- **BGG:** only Play-By-Forum (turn-based forum threads) — not real-time.
- **GitHub / web:** no maintained open-source web implementation found.
- **Tabletop Simulator / Tabletopia:** community mods exist but require owning TTS and aren't a clean web experience.

**Gap confirmed:** a clean, free, real-time, browser-based, self-hosted Medici with bots is a legitimate hole in the market. This fills it.

## What We'd Build

- **Stack:** React 19 + Vite + TypeScript + Zustand + Socket.IO client; Node/Express + Socket.IO server; engine as pure functions in `shared/` imported by both sides. So Clover / Sardegna pattern.
- **Multiplayer:** 5-char room codes, in-memory room manager with periodic cleanup, server-authoritative lobby (`allPlayers` rebuilds), host is player p0.
- **Reconnection:** per-player UUID reconnectToken in localStorage; mid-game disconnect marks `disconnected` (keeps ship/money/tracks); 3-second stale-token timeout; room cleanup only when all disconnected.
- **Persistence:** SQLite write-through (better-sqlite3), single `rooms` table, full room state as JSON blob; non-stale rooms loaded on server start.
- **Bots:** Easy / Medium / Hard, lobby add-bot, flags propagated room.players → game.players by index, 800ms scheduler, `runBot` schedules next bot on every exit path.
- **Deploy:** Docker (node:22-alpine), docker-compose, rsync to VPS, Caddy reverse proxy + Pangolin resource/target entries, domain medici.onewing.top.

## Full Rules Reference

Verified against the official Grail Games 2016 rulebook (edition 3.1). Discrepancies found in the second-pass cross-check are flagged inline with **✱** and summarized in the Discrepancy Log below.

### Components & Setup

- 36 cards: 7 each of cloth, fur, grain, dye, spice (values 0, 1, 2, 3, 4, 5, 5) + 1 gold card (value 10, colorless). Verify: 7×5+1 = 36 ✓.
- Ship mats: 5 cargo spaces each; in 2-player games, two additional smaller mats extend each ship to **7 spaces**.
- Money track 0-99 around the board edge. Starting florins: 2-4 players = 40; 5-6 players = 30.
- All players place a counter on the bottom (8th) level of each of the five commodity tracks (the gold frame = level 0).
- Cards in play per day: 2p/3p = 18, 4p = 24, 5p = 30, 6p = 36. Shuffle all 36, remove the rest unseen. Reshuffle and re-remove every day.
- Random start player day 1. Least-florins player starts days 2 and 3 (random among ties).
- Money can exceed 99 — keep counting past 99 with the counter flipped (+100 indicator).

### Turn Structure (one auction per turn)

1. Active player draws 1-3 cards from the deck, face up (min 1; may stop after 1 or 2; never more than 3). Drawn cards form ONE group and may NOT be split.
2. Auction: bidding starts with the player to the LEFT of the group selector. Each player clockwise gets exactly one bid-or-pass; successive bids must exceed the previous high. The selector is ALWAYS the last to bid or pass.
3. Minimum bid 1 florin. A player may never bid more than they currently have (no borrowing; money never below zero).
4. Winner loads the ENTIRE group onto their ship (cannot return, trade, split, or discard) and pays the bid.
5. Ship capacity: cannot bid on a group that would exceed ship spaces (5, or 7 in 2p) — must pass. A full ship is out of the auction for the rest of the day (cannot select or buy).
6. ✱ Presentation rule: on your turn you may present a group larger than your own remaining space (you'd just have to pass on it yourself), but you cannot present a group larger than at least one OTHER player can bid for. Panix's old-edition note ("once everyone has at least three cards, the dealer may not turn over a third card") is a corollary of this, not a separate rule.
7. If everyone passes, the group is discarded (removed from the game). Turn passes to the LEFT after each auction (skipping full ships).

### Day End

- A day ends when (a) all but one player have full ships — the remaining player fills their ship free from the top of the deck, no choices, sailing with empty holds if the deck is short — or (b) the deck runs out (some ships sail with empty holds).
- Players may count remaining deck cards but never look at them.

### Day Scoring (after each of 3 days)

1. **Ship value payments:** sum card values on each ship (gold counts). Rank highest to lowest; payments by player count:
   - 2p: 20, 0
   - 3p: 30, 15, 0
   - 4p: 30, 20, 10, 0
   - 5p: 30, 20, 10, 5, 0
   - 6p: 30, 20, **15**, 10, 5, 0  ✱ (see Discrepancy Log #1)
   - Ties: add the payments for the tied places and divide among the tied players, rounded down.
2. **Commodity tracks** (one at a time, all five): each player moves their counter UP by the number of cards of that commodity on their ship (card values ignored; gold does not count; counter cannot exceed the top level). Then the highest position earns 10 florins, second earns 5 (second earns **0 in 2-player**). Ties: add and divide, rounded down. Players with zero of a commodity can still tie for an award at the bottom (gold frame) level.
3. **Bonus levels:** the top three levels of each track pay 5, 10, 20 bonus florins — specifically level 6 (third-highest) = 5, level 7 (second-highest) = 10, level 8 (top) = 20, counting from the gold frame as level 1 ✱ (see Discrepancy Log #2; confirmed by rulebook examples + Steamforged board imagery). Ties at the same bonus level each receive the FULL bonus (not divided). Track counters do NOT reset between days.
4. **Payment order:** ship value first, then per-commodity awards (10/5 + bonus together).

### Game End

- After day 3 scoring, the player with the most florins wins. Ties share the victory.

## Discrepancy Log (second-pass cross-check)

1. **6-player ship payment table — starting prompt error.** The kickoff prompt (and the scoping skill reference) lists 6p payments as 30, 20, 10, 10, 5, 0. The Grail 2016 rulebook table gives 30, 20, **15**, 10, 5, 0 (3rd place = 15). The older editions (boardgamers.org WBC table: "6 Players 30 20 10 10 5 0") used 10 for 3rd — the 2016 Grail edition changed it. **Resolution: implement the Grail 2016 rulebook values (15).** Total daily payout at 6p = 80.
2. **Bonus level-to-amount mapping.** The rulebook says only "5, 10 or 20 florins (as noted on the board)" without stating which level gets which. Cross-source reconstruction: rulebook scoring example shows top-level = +20 ("10 plus the bonus of 20") and second-highest = +10 ("plus the bonus of 10"); Panix (old Amigo edition) states 6 cards reaches the 10-bonus and 7 cards reaches the 20-bonus; boardgamers.org notes the American version added the 5-florin bonus on the third-highest level. Steamforged board imagery confirms bonuses printed bottom-to-top as +5, +10, +20 on the upper levels. **Resolution: level 6 = 5, level 7 = 10, level 8 (top) = 20.** Re-verify visually against a high-res board close-up during the frontend phase.
3. **Presentation rule interpretation.** "Cannot present a group larger than at least one player can bid for" — the rulebook's worked example frames this as an OTHER player (Diane "could buy the group... as all other players would have to pass"). Implemented as: at least one player other than the selector must have capacity ≥ group size. Flagged for RULES-AUDIT.
4. **Money can exceed 99.** The starting prompt implied a 0-99 cap; the rulebook explicitly allows tracking past 99 with flipped counters. Model money as an unbounded integer; UI shows a +100 badge past 99.
5. Everything else in the starting prompt matched the rulebook exactly (deck construction, per-day counts, draw rules, bid order, min bid, money cap, day-end fill, tie division, 2p second = 0, cumulative tracks).

## Technical Architecture

```
medici/
├── shared/                 # engine: pure functions, no side effects, no I/O
│   ├── types.ts            # Card, Commodity, Player, Room, GameState, Phase, Events
│   ├── constants.ts        # DECK_SPEC, PAYMENT_TABLES, TRACK_BONUSES, SHIP_CAPACITY...
│   ├── deck.ts             # buildDeck, shuffle, dealDayCards (per-count removal)
│   ├── engine.ts           # state machine: createGame, drawCard, stopDraw, bid, pass,
│   │                       #   resolveAuction, endTurn, checkDayEnd, fillLastShip,
│   │                       #   scoreDay, scoreShipPayments, scoreCommodityTrack,
│   │                       #   nextDay, finalResults — pure, deterministic given RNG
│   ├── auction.ts          # bid order, validation (min bid, money cap, capacity)
│   ├── scoring.ts          # payment tables, tie division (round down), bonus levels
│   ├── bot.ts              # chooseDraw, chooseBid, choosePass (easy/medium/hard)
│   └── rng.ts              # injectable RNG for deterministic tests
├── server/
│   ├── index.ts            # Express + Socket.IO
│   ├── rooms.ts            # RoomManager: Map + cleanup timer + SQLite write-through
│   ├── db.ts               # better-sqlite3, rooms table (JSON blob)
│   ├── handlers.ts         # room:create/join/leave, room:reconnect, game:start,
│   │                       #   game:draw, game:stopDraw, auction:bid, auction:pass,
│   │                       #   game:restart, add_bot
│   └── botScheduler.ts     # 800ms setTimeout, scheduleBot after every exit path
└── client/
    ├── src/
    │   ├── store.ts        # Zustand: room, game, phase, view state
    │   ├── socket.ts       # socket.io-client wrapper, reconnect token mgmt
    │   ├── Board.tsx       # money track (0-99 ring), 5 triangular tracks, crest
    │   ├── Track.tsx       # single commodity triangle, counters, bonus markers
    │   ├── ShipMat.tsx     # player ship: 5 (or 7) cargo slots
    │   ├── AuctionPanel.tsx# draw controls, group display, bid/pass buttons
    │   ├── ScoreOverlay.tsx# day scoring animation, results
    │   └── Lobby.tsx
    └── ...
├── data/refs/              # reference board photos (GITIGNORED — copyrighted)
├── tests/                  # vitest engine tests (40+ assertions)
├── test-flow.mjs           # socket integration test (full game server-side)
└── sim/                    # full-game bot simulation for RULES-AUDIT
```

### Engine state machine

```
LOBBY → DAY (DRAW → AUCTION → LOAD → next selector) → DAY_SCORING (×3) → GAME_OVER
```

GameState: { day, phase: 'draw'|'auction'|'day_scoring'|'game_over', players[], deck (opaque to clients), group (drawn cards), auction { currentBidder, highBid, bids[], status }, trackLevels { [commodity]: { [playerId]: level } }, discarded[], dayEndTriggered }.

Hidden state: the deck and the day's removed cards are server-only. Clients see remaining deck count, never card identities. No per-player hidden info (all revealed cards are public) — full public broadcast is safe.

### Bots

Decision points (per the kickoff):
1. **Draw 1/2/3 (push-your-luck):** value current group vs. dilution risk and deck composition. Easy: near-random around intrinsic value. Medium: value heuristic with variance. Hard: expected-value model — track remaining deck composition (all bought/discarded/drawn cards are public knowledge; only the day-start removals are unknown), compute marginal EV of drawing another card, plus ship-space urgency.
2. **Bid amount:** lot intrinsic value (card values + commodity-track majority upside from this day's scoring + bonus-level reachability) + ship-space scarcity (cheap fill vs. leaving room) + denial value (what opponents gain by winning). Hard bot prices to its own value and drives price up against opponents who need the lot more.
3. **Overpay to deny:** when an opponent's gain from winning exceeds the price delta, bid up to (opponent gain − small margin) even past own value.

All bots enforce money caps and ship capacity; bots that are full never bid or select.

## Build Phases

1. **Engine core** — deck construction (verify 36 = 7×5+1), per-day card counts, draw rules (1-3, group indivisible, presentability constraint), auction resolution (bid order, min bid, money caps, capacity checks, selector-last), ship loading, turn order with full-ship skips, day-end triggers (all-but-one full → free fill; deck empty). Headless, vitest, deterministic RNG.
2. **Scoring** — ship payment tables per player count with tie division (round down); commodity track movement + 10/5 awards (2p second = 0) with tie division; bonus levels (5/10/20 at levels 6/7/8); zero-purchaser ties at the gold frame; 3-day cumulative track state; day cycle; game end + tie handling. Hard-problem area.
3. **Server** — Socket.IO rooms, game lifecycle, reconnection, SQLite persistence, bot scheduling, game:restart.
4. **Frontend** — board replication from reference imagery (square board, circular money track 0-99 clockwise, five inward-pointing triangular tracks with +5/+10/+20 at the top, golden crest center), ship mats (5 slots vertical, parchment + ocean), draw/auction interaction, phase display, day-scoring overlay. Visual fidelity verified against data/refs images.
5. **Deploy** — Docker (node:22-alpine), docker-compose, rsync to VPS, Caddy + Pangolin entries, medici.onewing.top, verified by loading the live URL.

## What Success Looks Like

A sharable URL (medici.onewing.top) where 2-6 friends open the same room code, play a full 3-day game in real time with the familiar Medici board on screen — money counters gliding around the edge track, cargo stacking on ship mats, counters climbing the five triangles with the crest at center. Bots fill empty seats at three difficulty levels. Disconnects reconnect seamlessly; rooms survive a server restart. A game takes 30-45 minutes and feels like the physical game.

## What We're Not Building (Phase 0 Scope)

No accounts/auth beyond room codes, no chat, no expansions (Medici: The Card Game, Medici vs Strozzi, Medici Traders), no Steamforged 2-player duel variant (use the 2016 Grail 2p rules with 7-space ships), no mobile app, no game replay, no turn timer (addable later), no spectating beyond room join, no tabletop-simulator-style 3D.
