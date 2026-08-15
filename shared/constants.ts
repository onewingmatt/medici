// Shared game constants — Medici (Grail Games 2016 rules)
// Single source of truth for both engine and client.

export const COMMODITIES = ['cloth', 'fur', 'grain', 'dye', 'spice'] as const
export type Commodity = (typeof COMMODITIES)[number]

export type CardCommodity = Commodity | 'gold'

export const CARD_VALUES = [0, 1, 2, 3, 4, 5, 5] as const
export const GOLD_VALUE = 10
export const DECK_SIZE = 36 // 7 cards × 5 commodities + 1 gold

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const DAYS = 3

export const SHIP_CAPACITY = 5
export const SHIP_CAPACITY_2P = 7

// Track levels: 0 (bottom, gold frame) .. 7 (top). 7 cards per commodity = top reachable.
export const TRACK_LEVELS = 8
export const TRACK_BONUS_BY_LEVEL: number[] = [0, 0, 0, 0, 0, 5, 10, 20] // level 5→5, 6→10, 7→20

export const MAX_DRAW = 3
export const MIN_BID = 1

export const CARDS_PER_DAY: Record<number, number> = {
  2: 18,
  3: 18,
  4: 24,
  5: 30,
  6: 36,
}

// Ship-value payments by player count (Grail 2016 rulebook).
// 6p 3rd place = 15 (older editions used 10; the 2016 edition changed it).
export const SHIP_PAYMENTS: Record<number, number[]> = {
  2: [20, 0],
  3: [30, 15, 0],
  4: [30, 20, 10, 0],
  5: [30, 20, 10, 5, 0],
  6: [30, 20, 15, 10, 5, 0],
}

export function startingMoney(playerCount: number): number {
  return playerCount <= 4 ? 40 : 30
}

export function shipCapacity(playerCount: number): number {
  return playerCount === 2 ? SHIP_CAPACITY_2P : SHIP_CAPACITY
}
