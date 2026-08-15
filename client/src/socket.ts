// Socket wrapper — wires server events into the store, manages the
// localStorage reconnect token with a stale-token timeout.
import { io, type Socket } from 'socket.io-client'
import { useStore } from './store'
import type { ClientGame, RoomState } from './types'
export let socket: Socket | null = null

const TOKEN_KEY = 'medici:room'
const STALE_TIMEOUT_MS = 3000

interface SavedRoom {
  code: string
  token: string
}

function loadSavedRoom(): SavedRoom | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedRoom
    if (!parsed.code || !parsed.token) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSavedRoom(code: string, token: string): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ code, token }))
}

export function clearSavedRoom(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function connect(): void {
  if (socket) return
  socket = io()

  socket.on('connect', () => {
    useStore.getState().setConnected(true)
    const saved = loadSavedRoom()
    if (saved) {
      // Attempt reconnection; clear the stale token if no room answers in time.
      socket!.emit('room:reconnect', { code: saved.code, reconnectToken: saved.token })
      setTimeout(() => {
        if (!useStore.getState().room) clearSavedRoom()
      }, STALE_TIMEOUT_MS)
    }
  })

  socket.on('disconnect', () => {
    useStore.getState().setConnected(false)
  })

  socket.on('room:state', (data: RoomState) => {
    useStore.getState().setRoom(data)
    if (data.reconnectToken && data.code) {
      saveSavedRoom(data.code, data.reconnectToken)
    }
  })

  socket.on('game:board', ({ game }: { game: ClientGame }) => {
    useStore.getState().setGame(game)
  })

  socket.on('game:scored', ({ game }: { game: ClientGame }) => {
    useStore.getState().setScored(game)
  })

  socket.on('game_over', ({ game }: { game: ClientGame }) => {
    useStore.getState().setGameOver(game)
  })

  socket.on('error', (data: { message?: string }) => {
    useStore.getState().setError(data.message ?? 'Something went wrong')
    setTimeout(() => useStore.getState().setError(null), 4000)
  })
}

export function emit(event: string, payload?: unknown): void {
  socket?.emit(event, payload)
}
