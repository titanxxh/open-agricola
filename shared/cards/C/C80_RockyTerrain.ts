import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C80_RockyTerrain'

/**
 * C80 Rocky Terrain — Each time you plow a field (tile or card), you can buy
 * 1 STONE for 1 FOOD.
 *
 * BGA: triggers on Plow / Improvement / Occupation events; the latter two
 * are gated by `PlayerCards::get($cardId)->isField()` so only "field card"
 * variants of improvements / occupations trigger the bonus.
 *
 * Implementation: plow listener is the canonical path. Improvement and
 * occupation listeners are registered as architectural placeholders — our
 * card model has no `isField` annotation; every BGA field-card is
 * implemented here as a regular minor / occupation, so these listeners
 * currently never fire (registered as §2.5 simplification — adding the
 * `isField` annotation is independent of C80 itself).
 */

const buyStoneForFood = (player: CardListenerContext['player']): ActionHookResult | void => {
  if (player.resources.food < 1) return
  return payGainNode({
    cardId: CARD_ID,
    cost: { food: 1 },
    gain: { stone: 1 },
  })
}

const plowListener: CardListenerRegistration = {
  id: 'C80-rocky-terrain-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (context: CardListenerContext): ActionHookResult | void =>
    buyStoneForFood(context.player),
}

// Placeholder — would only fire if the played card carried an `isField`
// marker. We never annotate cards that way (§2.5 simplification).
const improvementFieldCardListener: CardListenerRegistration = {
  id: 'C80-rocky-terrain-after-improvement-field-card',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    // No card in our registry declares `isField` — placeholder for parity
    // with BGA `onPlayerAfterImprovement` + `card->isField()` gate.
    return
  },
}

const occupationFieldCardListener: CardListenerRegistration = {
  id: 'C80-rocky-terrain-after-occupation-field-card',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation', 'play-occupation'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    // No card in our registry declares `isField` — placeholder for parity
    // with BGA `onPlayerAfterOccupation` + `card->isField()` gate.
    return
  },
}

export const C80_RockyTerrain = new MinorImprovement({
  id: CARD_ID,
  name: 'Rocky Terrain',
  deck: 'C',
  number: 80,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you plow a field (tile or card), you can also buy 1 <STONE> for 1 <FOOD>.'],
  cost: { food: 1 },
  players: '1+',
  newSet: true,
})

export const C80_RockyTerrain_impl = {
  listeners: [plowListener, improvementFieldCardListener, occupationFieldCardListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
