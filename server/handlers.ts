// Socket.IO event handlers. Server-authoritative: all validation lives in the
// engine; handlers just auth the player, call the engine, and broadcast.
import type { Server, Socket } from 'socket.io'
import { bid, createGame, drawCard, pass, stopDraw } from '../shared/engine'
import { scoreDay } from '../shared/scoring'
import type { GameState } from '../shared/types'
import {
  type Room,
  broadcastRoom,
  createRoom,
  findPlayerByToken,
  getRoom,
  getRoomBySocket,
  joinRoom,
  newRoomPlayer,
  save,
} from './rooms'
import { clearBotTimer, FAST_BOT_DELAY_MS, scheduleBot, setOnAfterMutation } from './botScheduler'

const MIN_PLAYERS = Number(process.env.MIN_PLAYERS ?? 2)

// Strip hidden state (deck identities) before sending to clients.
function serializeGame(g: GameState) {
  return {
    ...g,
    deck: undefined,
    removed: undefined,
    deckCount: g.deck.length,
    removedCount: g.removed.length,
  }
}

function roomPublic(room: Room) {
  return {
    code: room.code,
    hostId: room.hostId,
    inGame: !!room.game,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      difficulty: p.difficulty,
      disconnected: p.disconnected,
    })),
  }
}

// True when at least one human player has a live socket (pause only makes
// sense if someone is actually looking at the summary).
function hasConnectedHuman(room: Room): boolean {
  return room.players.some((p) => !p.isBot && p.socketId != null)
}

// The single post-mutation choke point: persist → broadcast → auto-score →
// schedule next bot. Registered with the bot scheduler so bots route through
// the same broadcast path.
function afterMutation(room: Room): void {
  save(room)
  if (!room.game) return
  broadcastRoom(room, 'game:board', { game: serializeGame(room.game) })

  if (room.game.phase === 'scoring') {
    const scored = scoreDay(room.game, Math.random)
    room.game = scored
    save(room)
    broadcastRoom(room, 'game:scored', { game: serializeGame(scored) })
    if (scored.phase === 'game_over') {
      broadcastRoom(room, 'game_over', {
        results: scored.finalResults,
        game: serializeGame(scored),
      })
    } else if (hasConnectedHuman(room)) {
      // Day is fully played and scored — hold bot play until a human
      // dismisses the summary (game:continue). No bots act under the overlay.
      room.pausedForSummary = true
      clearBotTimer(room.code)
      save(room)
      return
    }
  }
  scheduleBot(room)
}

export function registerHandlers(io: Server): void {
  setOnAfterMutation(afterMutation)
  io.on('connection', (socket: Socket) => {
    // ------------------------------------------------------------------
    // Lobby
    // ------------------------------------------------------------------
    socket.on('room:create', ({ playerName } = {}) => {
      const name = String(playerName ?? '').trim().slice(0, 24) || 'Player'
      const { room, host } = createRoom(name)
      host.socketId = socket.id
      save(room)
      socket.emit('room:state', {
        ...roomPublic(room),
        reconnectToken: host.reconnectToken,
        yourId: host.id,
      })
      broadcastRoom(room, 'room:state', roomPublic(room))
    })

    socket.on('room:join', ({ code, playerName } = {}) => {
      const name = String(playerName ?? '').trim().slice(0, 24) || 'Player'
      const res = joinRoom(String(code ?? ''), name)
      if (!res.ok) {
        socket.emit('error', { message: res.error })
        return
      }
      res.player.socketId = socket.id
      save(res.room)
      socket.emit('room:state', {
        ...roomPublic(res.room),
        reconnectToken: res.player.reconnectToken,
        yourId: res.player.id,
      })
      broadcastRoom(res.room, 'room:state', roomPublic(res.room))
    })

    socket.on('room:reconnect', ({ code, reconnectToken } = {}) => {
      const found = findPlayerByToken(String(reconnectToken ?? ''))
      if (!found) return // stale token — fail silently
      const { room, player } = found
      if (player.socketId && player.socketId !== socket.id) {
        // Another live tab already owns this identity — let the new tab start fresh.
        socket.emit('error', { message: 'This player is already connected' })
        return
      }
      player.socketId = socket.id
      player.disconnected = false
      save(room)
      socket.emit('room:state', {
        ...roomPublic(room),
        reconnectToken: player.reconnectToken,
        yourId: player.id,
      })
      if (room.game) {
        socket.emit('game:board', { game: serializeGame(room.game) })
        if (room.game.phase === 'game_over') {
          socket.emit('game_over', {
            results: room.game.finalResults,
            game: serializeGame(room.game),
          })
        }
      }
      broadcastRoom(room, 'room:state', roomPublic(room))
      scheduleBot(room)
    })

    socket.on('room:leave', () => {
      const room = getRoomBySocket(socket.id)
      if (!room) return
      const player = room.players.find((p) => p.socketId === socket.id)
      if (!player) return
      if (!room.game) {
        // Lobby: remove entirely. Host leaving hands off or closes.
        room.players = room.players.filter((p) => p.id !== player.id)
        if (room.players.length === 0) {
          // room gets cleaned by the cleanup timer
        } else if (room.hostId === player.id) {
          room.hostId = room.players[0].id
        }
        save(room)
        broadcastRoom(room, 'room:state', roomPublic(room))
      } else {
        // In game: mark disconnected, keep ship/money/tracks.
        player.socketId = null
        player.disconnected = true
        save(room)
        broadcastRoom(room, 'room:state', roomPublic(room))
        scheduleBot(room)
      }
    })

    socket.on('add_bot', ({ difficulty } = {}) => {
      const room = getRoomBySocket(socket.id)
      if (!room) return
      if (room.game) {
        socket.emit('error', { message: 'Game already started' })
        return
      }
      if (room.players.length >= 6) {
        socket.emit('error', { message: 'Room is full' })
        return
      }
      const d = difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'medium'
      const bot = newRoomPlayer(`Bot ${room.players.filter((p) => p.isBot).length + 1}`, true, d)
      room.players.push(bot)
      save(room)
      broadcastRoom(room, 'room:state', roomPublic(room))
    })

    socket.on('remove_bot', ({ playerId } = {}) => {
      const room = getRoomBySocket(socket.id)
      if (!room) return
      if (room.game) return
      const bot = room.players.find((p) => p.id === playerId && p.isBot)
      if (bot) {
        room.players = room.players.filter((p) => p.id !== bot.id)
        save(room)
        broadcastRoom(room, 'room:state', roomPublic(room))
      }
    })

    // ------------------------------------------------------------------
    // Game
    // ------------------------------------------------------------------
    socket.on('game:start', () => {
      const room = getRoomBySocket(socket.id)
      if (!room) return
      if (room.game) {
        socket.emit('error', { message: 'Game already started' })
        return
      }
      if (room.players.length < MIN_PLAYERS) {
        socket.emit('error', { message: `Need at least ${MIN_PLAYERS} players` })
        return
      }
      room.game = createGame(
        room.players.map((p) => ({ id: p.id, name: p.name })),
        Math.random,
      )
      // Propagate bot flags by index (room.players order === game.players order)
      for (let i = 0; i < room.players.length; i++) {
        const rp = room.players[i]
        const gp = room.game.players[i]
        if (gp && rp.isBot) {
          gp.isBot = true
          gp.difficulty = rp.difficulty
        }
      }
      save(room)
      broadcastRoom(room, 'room:state', roomPublic(room))
      broadcastRoom(room, 'game:board', { game: serializeGame(room.game) })
      scheduleBot(room)
    })

    socket.on('game:draw', () => {
      const room = getRoomBySocket(socket.id)
      const player = room?.players.find((p) => p.socketId === socket.id)
      if (!room || !room.game || !player) return
      const res = drawCard(room.game, player.id)
      if (!res.ok) {
        socket.emit('error', { message: res.error })
        return
      }
      room.game = res.state
      afterMutation(room)
    })

    socket.on('game:stopDraw', () => {
      const room = getRoomBySocket(socket.id)
      const player = room?.players.find((p) => p.socketId === socket.id)
      if (!room || !room.game || !player) return
      const res = stopDraw(room.game, player.id)
      if (!res.ok) {
        socket.emit('error', { message: res.error })
        return
      }
      room.game = res.state
      afterMutation(room)
    })

    socket.on('auction:bid', ({ amount } = {}) => {
      const room = getRoomBySocket(socket.id)
      const player = room?.players.find((p) => p.socketId === socket.id)
      if (!room || !room.game || !player) return
      const res = bid(room.game, player.id, Number(amount))
      if (!res.ok) {
        socket.emit('error', { message: res.error })
        return
      }
      room.game = res.state
      afterMutation(room)
    })

    socket.on('auction:pass', () => {
      const room = getRoomBySocket(socket.id)
      const player = room?.players.find((p) => p.socketId === socket.id)
      if (!room || !room.game || !player) return
      const res = pass(room.game, player.id)
      if (!res.ok) {
        socket.emit('error', { message: res.error })
        return
      }
      room.game = res.state
      afterMutation(room)
    })

    socket.on('game:restart', () => {
      const room = getRoomBySocket(socket.id)
      if (!room) return
      if (!room.game || room.game.phase !== 'game_over') return
      room.game = createGame(
        room.players.map((p) => ({ id: p.id, name: p.name })),
        Math.random,
      )
      for (let i = 0; i < room.players.length; i++) {
        const rp = room.players[i]
        const gp = room.game.players[i]
        if (gp && rp.isBot) {
          gp.isBot = true
          gp.difficulty = rp.difficulty
        }
      }
      room.pausedForSummary = false
      save(room)
      broadcastRoom(room, 'game:board', { game: serializeGame(room.game) })
      scheduleBot(room)
    })

    // A human dismissed the day-scoring summary — release the bot hold.
    socket.on('game:continue', () => {
      const room = getRoomBySocket(socket.id)
      if (!room || !room.game) return
      if (!room.pausedForSummary) return
      room.pausedForSummary = false
      save(room)
      scheduleBot(room)
    })

    // Speed up / slow down bot play for this room (e.g. when the player's
    // ship is full and they are out of the round).
    socket.on('game:setSpeed', ({ fast } = {}) => {
      const room = getRoomBySocket(socket.id)
      if (!room || !room.game) return
      const next = fast ? FAST_BOT_DELAY_MS : 800
      if (room.botDelayMs === next) return
      room.botDelayMs = next
      save(room)
      clearBotTimer(room.code)
      scheduleBot(room) // re-schedule any pending bot at the new delay
    })

    // ------------------------------------------------------------------
    // Disconnect
    // ------------------------------------------------------------------
    socket.on('disconnect', () => {
      const room = getRoomBySocket(socket.id)
      if (!room) return
      const player = room.players.find((p) => p.socketId === socket.id)
      if (!player) return
      if (!room.game) {
        room.players = room.players.filter((p) => p.id !== player.id)
        if (room.hostId === player.id && room.players.length > 0) {
          room.hostId = room.players[0].id
        }
        save(room)
        broadcastRoom(room, 'room:state', roomPublic(room))
      } else {
        player.socketId = null
        player.disconnected = true
        save(room)
        broadcastRoom(room, 'room:state', roomPublic(room))
        scheduleBot(room)
      }
    })
  })
}
