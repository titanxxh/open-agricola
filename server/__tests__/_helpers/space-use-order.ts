import { expect } from 'vitest'
import type { SessionResponse } from '../../game/authoritative-session'

type GameEvent = SessionResponse['state']['events'][number]

const lastIndex = (events: GameEvent[], match: (event: GameEvent) => boolean): number => {
  for (let index = events.length - 1; index >= 0; index--) if (match(events[index]!)) return index
  return -1
}

const isHostCollect = (event: GameEvent, spaceId: string): boolean =>
  event.type === 'resource.moved' && event.reason === 'collect'
  && event.from.kind === 'actionSpace' && event.from.spaceId === spaceId

const isCardEvent = (event: GameEvent, cardId: string, type: GameEvent['type']): boolean =>
  event.type === type && (event.sourceCardId === cardId || ('cardId' in event && event.cardId === cardId))

/**
 * Asserts that the card's latest `type` event comes before the latest collect
 * from `spaceId`: the card's effect resolved before the host took the goods.
 */
export function expectCardEffectBeforeHostCollect(
  response: SessionResponse,
  { cardId, spaceId, type }: { cardId: string; spaceId: string; type: GameEvent['type'] },
): void {
  const { events } = response.state
  const effect = lastIndex(events, event => isCardEvent(event, cardId, type))
  const host = lastIndex(events, event => isHostCollect(event, spaceId))
  expect(effect, `${cardId} ${type} event`).toBeGreaterThanOrEqual(0)
  expect(host, `${spaceId} collect event`).toBeGreaterThanOrEqual(0)
  expect(effect, `${cardId} ${type} should precede the ${spaceId} collect`).toBeLessThan(host)
}
