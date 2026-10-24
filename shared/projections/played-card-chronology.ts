import type { GameState, PlayerState } from '../contract/types'
import { getPlayedCardKeys } from '../domain/player'

/** Snapshot-only order, derived before the complete effective event history is windowed. */
export const projectPlayedCardChronology = (
  state: Pick<GameState, 'events'>,
  player: PlayerState,
): string[] => {
  const inPlay = new Set(getPlayedCardKeys(player))
  const entries = new Set<string>()
  for (const event of state.events) {
    let cardKey: string
    if (event.type === 'card.played' && event.actorPlayerId === player.id) {
      cardKey = `${event.cardType}:${event.cardId}`
    } else if (event.type === 'card.swappedWithBoard' && event.playerId === player.id) {
      cardKey = `major:${event.toPlayerCardId}`
    } else {
      continue
    }
    if (!inPlay.has(cardKey)) continue
    entries.delete(cardKey)
    entries.add(cardKey)
  }
  // Dev/setup can preload cards without an entry event. Keep those visible as
  // an undated prefix, without inventing a position among recorded entries.
  return [...inPlay].filter(key => !entries.has(key)).concat([...entries])
}
