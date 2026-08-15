// Core game types — shared between engine, server, and client.
import type { CardCommodity, Commodity } from './constants'

export interface Card {
  id: string
  commodity: CardCommodity
  value: number
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export type Phase = 'draw' | 'auction' | 'scoring' | 'game_over'

export interface PlayerState {
  id: string
  name: string
  money: number
  ship: Card[] // cards loaded this day
  trackLevels: Record<Commodity, number> // cumulative across days, 0..7
  disconnected: boolean
  isBot: boolean
  difficulty?: Difficulty
}

export interface AuctionState {
  group: Card[]
  selectorId: string
  // ids in clockwise order starting with the player left of the selector,
  // excluding full/disconnected players; selector is always LAST.
  bidOrder: string[]
  currentBidderIndex: number
  highBid: number // 0 = no bid yet
  highBidderId: string | null
  status: 'open' | 'resolved'
}

export type EngineEvent =
  | { type: 'day_start'; day: number; startPlayerId: string; deckCount: number; ts: number }
  | { type: 'draw'; playerId: string; card: Card; groupSize: number; ts: number }
  | { type: 'auction_start'; selectorId: string; group: Card[]; bidOrder: string[]; ts: number }
  | { type: 'bid'; playerId: string; amount: number; ts: number }
  | { type: 'pass'; playerId: string; ts: number }
  | { type: 'sold'; buyerId: string; amount: number; group: Card[]; ts: number }
  | { type: 'discarded'; group: Card[]; ts: number }
  | { type: 'free_fill'; playerId: string; cards: Card[]; deckEmpty: boolean; ts: number }
  | { type: 'day_end'; day: number; reason: 'deck_empty' | 'ships_full' | 'stalled'; ts: number }
  | { type: 'game_over'; winnerIds: string[]; ts: number }

export interface ShipPaymentLine {
  playerId: string
  shipValue: number
  payment: number
}

export interface TrackAwardLine {
  playerId: string
  level: number
  award: number // 10/5 (or 0) portion, tie-divided
  bonus: number // 5/10/20 bonus if on a bonus level
  total: number // award + bonus
}

export type ScoringEvent =
  | { type: 'ship_value'; lines: ShipPaymentLine[] }
  | { type: 'track'; commodity: Commodity; lines: TrackAwardLine[] }
  | { type: 'day_total'; day: number; totals: { playerId: string; money: number }[] }
  | {
      type: 'game_over'
      winnerIds: string[]
      totals: { playerId: string; money: number }[]
    }

export interface GameState {
  day: 1 | 2 | 3
  phase: Phase
  players: PlayerState[]
  playerOrder: string[] // fixed seating order (clockwise)
  deck: Card[] // remaining draw pile (server-only; clients see count)
  removed: Card[] // cards removed at day start (unseen)
  discarded: Card[] // groups no one bid on
  group: Card[] // current drawn group during draw phase
  selectorIndex: number // index into playerOrder
  auction: AuctionState | null
  dayEnded: boolean
  history: EngineEvent[]
  scoringLog: ScoringEvent[]
  finalResults?: { playerId: string; money: number }[]
}

export interface PlayerSeed {
  id: string
  name: string
}

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string }
