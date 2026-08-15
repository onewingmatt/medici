// Zustand store — single source of truth for the client UI.
import { create } from 'zustand'
import type { ClientGame, RoomState } from './types'
export interface UIState {
  connected: boolean
  room: RoomState | null
  yourId: string | null
  reconnectToken: string | null
  game: ClientGame | null
  scoredGame: ClientGame | null // state right after a day scored (overlay)
  gameOver: ClientGame | null
  error: string | null
  playerScheme: string
  // actions
  setConnected: (c: boolean) => void
  setRoom: (room: RoomState) => void
  setGame: (game: ClientGame) => void
  setScored: (game: ClientGame) => void
  setGameOver: (game: ClientGame) => void
  dismissScored: () => void
  setError: (msg: string | null) => void
  setPlayerScheme: (scheme: string) => void
  reset: () => void
}

export const useStore = create<UIState>((set) => ({
  connected: false,
  room: null,
  yourId: null,
  reconnectToken: null,
  game: null,
  scoredGame: null,
  gameOver: null,
  error: null,
  playerScheme: localStorage.getItem('medici:scheme') ?? 'bright',

  setConnected: (c) => set({ connected: c }),
  setRoom: (room) =>
    set((s) => ({
      room,
      yourId: room.yourId ?? s.yourId,
      reconnectToken: room.reconnectToken ?? s.reconnectToken,
    })),
  setGame: (game) =>
    set((s) => ({
      game,
      // Keep the day-scored snapshot so the overlay stays readable until the
      // player dismisses it — board updates (e.g. the next bot action firing
      // right after scoring) must NOT wipe it. Clear gameOver only when a
      // fresh (non-game-over) game arrives, e.g. after Play again.
      scoredGame: s.scoredGame,
      gameOver: game.phase === 'game_over' ? s.gameOver : null,
    })),
  setScored: (game) => set({ scoredGame: game, game }),
  setGameOver: (game) => set({ gameOver: game, game, scoredGame: null }),
  dismissScored: () => set({ scoredGame: null }),
  setError: (msg) => set({ error: msg }),
  setPlayerScheme: (scheme) => {
    localStorage.setItem('medici:scheme', scheme)
    set({ playerScheme: scheme })
  },
  reset: () =>
    set({
      room: null,
      yourId: null,
      reconnectToken: null,
      game: null,
      scoredGame: null,
      gameOver: null,
      error: null,
    }),
}))
