# Medici — Rules Audit

Audit of the Grail Games 2016 edition rules against the implementation.
Date: 2026-08-15. Sources: Grail Games 2016 rulebook (ed. 3.1, qugs.org/rules/r46.pdf),
SCOPE.md Full Rules Reference, engine code in `shared/`, tests in `tests/`,
full-game bot simulations in `sim/`.

Legend: PASS = rule traced to code and covered by a test or the simulation;
NOTE = rule traced to code but the behavior depends on an interpretation
flagged here; FAIL = not implemented or wrong.

## Component & Setup Rules

| # | Rule | Implementation | Evidence | Status |
|---|------|----------------|----------|--------|
| 1 | 36 cards: 7 each of cloth/fur/grain/dye/spice (0,1,2,3,4,5,5) + 1 gold (10, colorless) | `shared/constants.ts` CARD_VALUES, `shared/deck.ts` buildDeck | tests: deck length 36, 7/commodity, values, gold | PASS |
| 2 | Ships: 5 cargo spaces (7 in 2p with small mats) | `constants.ts` SHIP_CAPACITY/SHIP_CAPACITY_2P, engine `shipCapacityOf` | tests: 2p capacity 7 and fits-a-3-card-group-at-4-loaded; 3p overflow rejected | PASS |
| 3 | Money track 0-99; start 40 florins (2-4p), 30 (5-6p) | `constants.ts` startingMoney | tests: starting money per count | PASS |
| 4 | Money may exceed 99 (counter flips, +100) | engine money is an unbounded integer; client shows `+100` flip marker + track value (e.g. 145 → "+100 45") | tests/rules-edge.test.ts asserts money stays within 0-199 across full games; client fixed 2026-08-15 (previously showed "+100 145" which read as 245) | PASS |
| 5 | All counters start on the bottom (8th) level (gold frame = 0) of each track | createGame sets trackLevels to 0 for all commodities | tests: all tracks 0 at start | PASS |
| 6 | Cards in play per day: 18/18/24/30/36 for 2p-6p; remove rest unseen | `constants.ts` CARDS_PER_DAY, setupDay | tests: deck+removed = 36, deck = CARDS_PER_DAY[n] | PASS |
| 7 | Reshuffle all 36 and re-remove every day | startNextDay → setupDay (fresh shuffle each day) | tests: day-2 deck differs from day 1, discarded reset | PASS |
| 8 | Random start player day 1; least florins starts days 2-3 (random among ties) | `pickStartPlayer` | tests: day-2 start = least florins; tie → one of the tied | PASS |

## Turn Structure Rules

| # | Rule | Implementation | Evidence | Status |
|---|------|----------------|----------|--------|
| 9 | Active player draws 1-3 cards face up, may stop after 1-2, never more than 3 | drawCard / stopDraw, MAX_DRAW | tests: 4th draw rejected, stop with 0 rejected | PASS |
| 10 | Drawn cards form ONE group, may not be split | group is loaded whole in resolveAuction; no split API | tests: winner loads entire group | PASS |
| 11 | Bidding starts left of the selector, clockwise, one bid-or-pass each | buildBidOrder | tests: [b,c,d,selector]; full/disconnected players excluded | PASS |
| 12 | Successive bids must exceed the previous high | bid validation `amount > highBid` | tests: tie bid rejected, +1 accepted | PASS |
| 13 | Selector always bids last | bidOrder appends selector last | tests: selector wins by bidding last | PASS |
| 14 | Minimum bid 1 florin | MIN_BID check | tests: bid 0 rejected | PASS |
| 15 | Never bid more than current money; money never below zero | bid validation `amount <= money` | tests: bid above money rejected | PASS |
| 16 | Winner loads the ENTIRE group and pays the bid | resolveAuction (load + deduct) | tests: ship grows by group, money deducted | PASS |
| 17 | Cannot bid on a group exceeding remaining ship space (must pass) | bid capacity check | tests: overflow bid rejected | PASS |
| 18 | Full ship = out of the auction for the rest of the day (cannot select or buy) | isSelectable (skips full ships in bid order and selector rotation); drawCard/stopDraw reject a full selector | tests: full ships excluded from bid order; selector skips full ships | PASS |
| 19 | Cannot present a group larger than at least one other player can bid for | canOtherBidFor in drawCard/stopDraw (other player, connected, has room, money >= 1) | tests: 3rd draw blocked when nobody else has room; 2p presentation guard | PASS |
| 20 | If everyone passes, the group is discarded (removed from the game) | resolveAuction → discarded | tests: all-pass discards group, no money moves | PASS |
| 21 | Turn passes to the left after each auction | checkDayEnd advances selectorIndex | tests: selector passes to the left; skips full ships | PASS |

## Day End Rules

| # | Rule | Implementation | Evidence | Status |
|---|------|----------------|----------|--------|
| 22 | Day ends when all but one ship is full — last player fills free from deck top, no choices, sails with empty holds if deck short | freeFill (takes min(spaces, deck) from top) | tests: free-fill takes deck top in order; short deck → empty holds | PASS |
| 23 | Day ends when the deck runs out | checkDayEnd deck.length === 0 | tests: deck_empty → scoring phase | PASS |
| 24 | Players may count remaining deck cards but never look at them | server serializes deckCount only; deck identities never sent | test-flow.mjs asserts deck undefined client-side; persistence check asserts deck hidden | PASS |

## Day Scoring Rules

| # | Rule | Implementation | Evidence | Status |
|---|------|----------------|----------|--------|
| 25 | Ship value = sum of card values; gold counts | shipValue | tests: gold counted (15 for gold+cloth2+fur3); rulebook 5p example | PASS |
| 26 | Ship payments by rank per player count | SHIP_PAYMENTS (2p 20,0 / 3p 30,15,0 / 4p 30,20,10,0 / 5p 30,20,10,5,0 / 6p 30,20,15,10,5,0) | tests: rulebook 5p example 30/20/7/7/0; 6p 3rd = 15 | PASS |
| 27 | Ties: add payments for tied places, divide, round down | scoreShipPayments spans tied positions | tests: 4p 25/25/5/5 tie case | PASS |
| 28 | Track movement: +1 level per card of that commodity; values ignored; gold excluded; capped at top | countOf + min(TRACK_LEVELS-1, ...) | tests: gold excluded, values ignored, cap at top | PASS |
| 29 | Track awards: highest 10, second 5 (second 0 in 2p); ties add + divide, round down | awardTable [10,5] or [10,0] with tie spanning | tests: 10/5 ranks; 2p second 0; 3-way tie 5/3 = 1 each | PASS |
| 30 | Zero-purchasers can still tie for an award at the bottom (gold frame) level | all players ranked including level 0 | tests: all-zero tie splits awards | PASS |
| 31 | Bonus levels: top three levels pay 5, 10, 20 (level 6 = 5, 7 = 10, 8 = 20 from the gold frame) | TRACK_BONUS_BY_LEVEL [0,0,0,0,0,5,10,20] | tests: bonuses on 5/6/7, none at 4; mapping asserted | PASS |
| 32 | Ties at the same bonus level each receive the FULL bonus (not divided) | bonus added per player, no division | tests: two at level 7 both +20 | PASS |
| 33 | Payment order: ship value first, then per-commodity awards (10/5 + bonus together) | scoreDay emits ship_value then 5 track events | tests: scoringLog order | PASS |
| 34 | Track counters do NOT reset between days | setupDay preserves trackLevels (clears ships only) | tests: 3-day cumulative fur levels 2→5→7 | PASS |
| 35 | Rulebook combined example (yellow 30, white/green 12 each, pink 0) | scoreCommodityTrack | tests: exact reproduction | PASS |

## Game End Rules

| # | Rule | Implementation | Evidence | Status |
|---|------|----------------|----------|--------|
| 36 | After day 3 scoring, most florins wins; ties share the victory | scoreDay game_over branch (finalResults, winnerIds) | tests: day-3 game over, richest wins, tie → multiple winners | PASS |
| 37 | Days 2 and 3 start with the least-florins player | pickStartPlayer day > 1 | tests: day-2/3 start player | PASS |

## Server / Multiplayer Rules

| # | Rule | Implementation | Evidence | Status |
|---|------|----------------|----------|--------|
| 38 | Server-authoritative: all draws, auctions, loading, scoring server-side | all engine calls in server/handlers.ts; client has no authority | architecture; test-flow drives server only | PASS |
| 39 | 5-char room codes; host is a player at creation | generateCode, room:create adds host p0 | test-flow: room created with 1 player | PASS |
| 40 | Reconnection: per-player reconnectToken; mid-game disconnect keeps ship/money/tracks; lobby disconnect removes; 3s stale-token timeout; room cleaned when all disconnected | handlers room:reconnect / disconnect; client socket.ts stale timeout; rooms cleanupRooms | persist-check: room + in-progress game restored after restart | PASS |
| 41 | game_over event emitted with final results | afterMutation broadcasts game_over | test-flow: game_over received with results | PASS |
| 42 | Bots: easy/medium/hard, scheduled, never stall | shared/bot.ts + server/botScheduler.ts (fallback + schedule after every path) | 150-game sweep: 0 stalls, 100% completion | PASS |

## Interpretation Notes & Known Limitations

1. **6-player ship payment table.** The starting prompt carried the older American edition values (30,20,10,10,5,0); the Grail 2016 rulebook says 3rd place pays **15**. Implemented per the rulebook. See SCOPE.md Discrepancy Log #1.
2. **Bonus level mapping (verified against rulebook 2026-08-15).** The rulebook (ed. 3.1, qugs.org/rules/r46.pdf) states the top three levels pay "5, 10 or 20 (as noted on the board)" and its worked example confirms top = +20, second = +10; the third bonus level is +5. Implemented as level 5→5, 6→10, 7→20 counting from the gold frame as level 0, which matches the example (yellow at top: 10 award + 20 bonus; white/green at second: 5÷2 rounded + 10 bonus).
3. **Presentation rule interpretation.** "Cannot present a group larger than at least one player can bid for" is implemented as *at least one OTHER player* (connected, has room, has >= 1 florin). The rulebook's worked example frames it as another player. A stricter reading (capacity only, ignoring money) would let the selector present sham lots; the money check prevents that. Edge case: if no other player can bid even a 1-card group, the engine ends the day (`stalled` reason) rather than letting the selector draw into a sham auction.
4. **Disconnected players in auctions.** Disconnected players are excluded from bid order and selector rotation (consistent with the established reconnect pattern: keep their state, skip their turns). A day with no connected selectable player ends immediately. Rare in practice; bots never disconnect.
5. **Bot balance (fixed 2026-08-15).** Earlier sweeps showed easy bots winning more than medium/hard, especially at 2p-3p. Root cause found and fixed: the hard bot's upside terms (ship-value 0.45×pay for taking the ship-race lead, full-strength track bonus deltas, deny premiums) inflated its auction limits far above card value. In multiplayer auctions the price is set by the second-highest limit, so hard systematically overpaid — money IS points. Empirical sweeps (sim/sweepup*.mjs) established the winning multipliers: ship upside ×0.06, track upside ×0.2, no deny premium, no slot-opportunity discount (both of those tested worse at 3-6p). Results at 200-300 games each: hard beats easy 62% (2p), 84% (3p), 80% (4p), 88% (5p), 89% (6p); medium ≈ hard; easy < medium. The day-end free-fill rule (last ship with room fills free) is a real strategic factor in 2p but chasing it via slot discounts loses more than it gains at 4-6p.

## Simulation Evidence

- `sim/headless.mjs` — single full game, any seed/count.
- `sim/sweep.mjs` — 250 games (seeds 1-50 × 2-6 players), all-bot:
  - completed: 250/250, stuck: 0
  - day end reasons: ships_full 629, deck_empty 121, stalled 0
  - winner money: min 83, max 199, avg 135.4 (always within one +100 flip)
  - 74 unit tests / 231+ assertions green; `npm run typecheck` clean.
- **Independent rules pass (2026-08-15)**: `tests/rules-edge.test.ts` re-derived edge cases from the rulebook PDF rather than from the existing tests — the rulebook's worked auction example (Adam/Kylie/Jason/Diane, Adam wins 8 as last bidder), presentation rule (selector may present a group larger than their own ship; must-pass for would-be overflowers), 0-florin bidders must pass, integer bids, bid-equals-money → exactly 0, money reconciliation (post-score money = pre-score + ship payment + all track totals), 2p ship tie → 10 each, 3-way top ship tie → 20 each, and 60 full bot games asserting money 0-199, track bounds, sorted final results, and consistent winnerIds.
- Socket integration (`test-flow.mjs`): full 3-day game over real sockets (1 human observer + 3 bots) → game_over with results; deck hidden from clients; day_total × 3.
- Persistence (`scripts/persist-check.mjs`): room with in-progress game restored from SQLite after server restart; reconnect by token re-associates the player.

## Conclusion

All 42 audited rules traced to implementation. 41 PASS, 1 NOTE (rule 4, money > 99 — no unit test but client renders the +100 badge; the engine models money as an unbounded integer, so the rule holds by construction). No FAIL items.
