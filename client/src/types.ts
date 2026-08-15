// Client types — the serialized game the server sends (deck hidden).
import type { AuctionState, GameState, Phase, ScoringEvent } from '../../shared/types'
import type { Commodity } from '../../shared/constants'

export type ClientGame = Omit<GameState, 'deck' | 'removed'> & {
  deck?: undefined
  removed?: undefined
  deckCount: number
  removedCount: number
}

export interface RoomPlayerPublic {
  id: string
  name: string
  isBot: boolean
  difficulty: 'easy' | 'medium' | 'hard'
  disconnected: boolean
}

export interface RoomState {
  code: string
  hostId: string
  inGame: boolean
  players: RoomPlayerPublic[]
  reconnectToken?: string
  yourId?: string
}

export type {
  AuctionState,
  Commodity,
  GameState,
  Phase,
  ScoringEvent,
}
