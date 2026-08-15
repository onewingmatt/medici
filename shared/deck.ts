// Deck construction and shuffling.
import { CARD_VALUES, COMMODITIES, GOLD_VALUE } from './constants'
import type { Card } from './types'

export type RNG = () => number // returns [0, 1)

export function buildDeck(): Card[] {
  const cards: Card[] = []
  for (const commodity of COMMODITIES) {
    CARD_VALUES.forEach((value, i) => {
      cards.push({ id: `${commodity}-${value}-${i}`, commodity, value })
    })
  }
  cards.push({ id: 'gold-10-0', commodity: 'gold', value: GOLD_VALUE })
  return cards
}

// Fisher-Yates with injected RNG (deterministic under a seeded RNG).
export function shuffle<T>(arr: T[], rng: RNG): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
