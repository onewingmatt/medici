// Bot scheduler — 800ms setTimeout per bot action.
// CRITICAL: after every bot action (success or fallback), scheduleBot must run
// again so multi-bot games keep moving. afterMutation() in handlers.ts is the
// single choke point that guarantees this.
import {
  bid,
  currentBidderId,
  currentSelector,
  drawCard,
  pass,
  stopDraw,
} from '../shared/engine'
import { botAction, isBotsTurn } from '../shared/bot'
import type { ActionResult } from '../shared/types'
import type { Room } from './rooms'

const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 800)
export const FAST_BOT_DELAY_MS = 120
const botTimers = new Map<string, NodeJS.Timeout>()

// Hook called after a successful mutation (persist, broadcast, auto-score).
// Defined by handlers.ts to avoid a circular import.
let onAfterMutation: (room: Room) => void = () => {}

export function setOnAfterMutation(fn: (room: Room) => void): void {
  onAfterMutation = fn
}

export function clearBotTimer(code: string): void {
  const t = botTimers.get(code)
  if (t) {
    clearTimeout(t)
    botTimers.delete(code)
  }
}

// If it is a bot's turn right now, schedule its action.
export function scheduleBot(room: Room): void {
  if (!room || !room.game) return
  // Day-scoring summary is up — hold bot play until a human dismisses it.
  if (room.pausedForSummary) return
  const g = room.game
  if (g.phase !== 'draw' && g.phase !== 'auction') return

  let actorId: string | null = null
  if (g.phase === 'draw') actorId = currentSelector(g)?.id ?? null
  else actorId = currentBidderId(g)
  if (!actorId) return

  const rp = room.players.find((p) => p.id === actorId)
  if (!rp || !rp.isBot) return

  clearBotTimer(room.code)
  const delay = room.botDelayMs ?? BOT_DELAY_MS
  const timer = setTimeout(() => runBot(room, actorId), delay)
  botTimers.set(room.code, timer)
}

// Perform one legal bot action. Falls back to a guaranteed-legal move
// (stop/pass) if the chosen action was rejected, so the game never stalls.
function runBot(room: Room, botId: string): void {
  botTimers.delete(room.code)
  const g = room.game
  if (!g) return
  const rp = room.players.find((p) => p.id === botId)
  if (!rp || !rp.isBot) return

  if (!isBotsTurn(g, botId)) {
    onAfterMutation(room)
    return
  }

  const difficulty = rp.difficulty ?? 'medium'
  const action = botAction(g, botId, difficulty, Math.random)

  let result: ActionResult
  if (action.kind === 'draw') result = drawCard(g, botId)
  else if (action.kind === 'stop') result = stopDraw(g, botId)
  else if (action.kind === 'bid') result = bid(g, botId, action.amount)
  else result = pass(g, botId)

  if (!result.ok) {
    // Illegal move: force a safe legal move so play always advances.
    if (g.phase === 'draw') {
      result = stopDraw(g, botId)
      if (!result.ok) result = drawCard(g, botId) // e.g. "must draw at least one"
    } else if (g.phase === 'auction') {
      result = pass(g, botId)
    }
  }

  if (result.ok) {
    room.game = result.state
  } else {
    // Both the chosen action and the fallback failed — do not reschedule
    // (that would loop on the same state forever).
    console.error(
      `[medici] bot ${botId} stuck: ${action.kind} failed, fallback failed (${result.error})`,
    )
    return
  }
  onAfterMutation(room)
}
