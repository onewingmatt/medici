// Socket.IO event handlers. Server-authoritative: all validation lives in the
// engine; handlers just auth the player, call the engine, and broadcast.
import type { Server, Socket } from 'socket.io'
import { bid, createGame, drawCard, pass, stopDraw } from '../shared/engine'
import { scoreDay } from '../shared/scoring'
import type { ActionResult, GameState } from '../shared/types'
import {
  type Room,
  broadcastRoom,
  createRoom,
  findPlayerByToken,
  getRoom,
  getRoomBySocket,
  joinRoom,
  newRoomPlayer,
  rooms,
  save,
} from './rooms'
import { deleteRoom } from './db'
import { clearBotTimer, BOT_DELAY_MS, FAST_BOT_DELAY_MS, scheduleBot, setOnAfterMutation } from './botScheduler'

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

// Advance the game past any player whose turn it currently is but who has
// disconnected. The engine refuses actions from disconnected players and the
// bid/selector rotation only skips them on FUTURE turns, so without this a
// mid-game disconnect on your turn would stall the room forever. Auto-plays
// them legally: selector draws one card (if needed) and stops; bidder passes.
// Returns true if any action was taken.
function advancePastDisconnected(room: Room): boolean {
  let moved = false
  let guard = 0
  while (guard++ < 64) {
    const g = room.game
    if (!g) return moved
    let actorId: string | null = null
    if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex] ?? null
    else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
    else return moved
    if (!actorId) return moved
    const rp = room.players.find((p) => p.id === actorId)
    if (!rp || !rp.disconnected) return moved
    const gp = g.players.find((p) => p.id === actorId)
    if (!gp) return moved
    // The engine clones state, so flipping the flag must happen on the state
    // we feed IN, and be restored on the state we get OUT — otherwise the
    // returned state has the disconnected player marked connected again and
    // the loop re-skips the same player forever.
    gp.disconnected = false // engine blocks actions from disconnected players
    let result: ActionResult
    if (g.phase === 'draw') {
      let s = g
      if (s.group.length === 0) {
        const r1 = drawCard(s, actorId)
        if (!r1.ok) {
          gp.disconnected = true
          return moved
        }
        s = r1.state
      }
      const r2 = stopDraw(s, actorId)
      if (!r2.ok) {
        gp.disconnected = true
        return moved
      }
      result = r2
    } else {
      result = pass(g, actorId)
    }
    if (!result.ok) return moved
    room.game = result.state
    const restored = room.game.players.find((p) => p.id === actorId)
    if (restored) restored.disconnected = true
    moved = true
  }
  return moved
}

// Keep the engine's player flag in sync with the room's — the selector
// rotation and bid order read the GAME player's disconnected flag, so a
// stale value makes the engine skip (or refuse) a player who actually
// reconnected. Must mirror every room-player flag change.
function syncGameDisconnected(room: Room, playerId: string, value: boolean): void {
  const gp = room.game?.players.find((p) => p.id === playerId)
  if (gp) gp.disconnected = value
}

// The single post-mutation choke point: persist → broadcast → auto-score →
// schedule next bot. Registered with the bot scheduler so bots route through
// the same broadcast path.
function afterMutation(room: Room): void {
  // A mutation may have advanced the turn to a disconnected player (e.g. a
  // bidder who left mid-auction). Skip them before broadcasting so play
  // never stalls on an absent player.
  if (room.game) advancePastDisconnected(room)
  save(room)
  if (!room.game) return
  broadcastRoom(room, 'game:board', { game: serializeGame(room.game) })

  if (room.game.phase === 'scoring') {
    const scored = scoreDay(room.game, Math.random)
    room.game = scored
    // The new day can start with a disconnected selector; skip them too.
    if (scored.phase !== 'game_over') advancePastDisconnected(room)
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
      // The skip logic may have marked the game player disconnected; clear
      // it or the engine will keep skipping this player's turns.
      syncGameDisconnected(room, player.id, false)
      // A reconnecting player has no overlay to dismiss (fresh page or tab),
      // so release any summary hold to avoid a frozen-looking game.
      room.pausedForSummary = false
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
        // Tell the leaver to drop the room UI (they are no longer in the
        // broadcast list, so they would otherwise sit on a stale room view).
        socket.emit('room:left')
      } else {
        // In game: mark disconnected, keep ship/money/tracks.
        player.socketId = null
        player.disconnected = true
        syncGameDisconnected(room, player.id, true)
        save(room)
        broadcastRoom(room, 'room:state', roomPublic(room))
        // Drop the leaver's room UI + saved token so a refresh doesn't rejoin.
        socket.emit('room:left')
        // afterMutation advances past this player's turn if it is up.
        if (!hasConnectedHuman(room)) room.pausedForSummary = false
        afterMutation(room)
      }
    })

    // Host closes the room for everyone: room is deleted, all clients reset.
    socket.on('room:close', () => {
      const room = getRoomBySocket(socket.id)
      if (!room) return
      const player = room.players.find((p) => p.socketId === socket.id)
      if (!player || player.id !== room.hostId) return
      for (const p of room.players) {
        if (p.socketId) {
          const s = io.sockets.sockets.get(p.socketId)
          if (s) s.emit('room:closed')
        }
      }
      rooms.delete(room.code)
      deleteRoom(room.code)
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
        if (gp) gp.disconnected = rp.disconnected
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
        if (gp) gp.disconnected = rp.disconnected
      }
      room.pausedForSummary = false
      save(room)
      broadcastRoom(room, 'game:board', { game: serializeGame(room.game) })
      // afterMutation advances past any disconnected player in the fresh game
      // and schedules the first bot.
      afterMutation(room)
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
      const next = fast ? FAST_BOT_DELAY_MS : BOT_DELAY_MS
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
        syncGameDisconnected(room, player.id, true)
        save(room)
        broadcastRoom(room, 'room:state', roomPublic(room))
        // Keep the game moving past this player's turn if it is up.
        if (!hasConnectedHuman(room)) room.pausedForSummary = false
        afterMutation(room)
      }
    })
  })
}
