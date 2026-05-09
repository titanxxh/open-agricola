import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import { isFieldCard } from '../catalog'
import type { CardImpl } from '../registry'
import { C80_RockyTerrain } from '../../cards-display/C/C80_RockyTerrain'

const CARD_ID = C80_RockyTerrain.id

/**
 * C80 Rocky Terrain (BGA `Cards/C/C80_RockyTerrain.php`):
 *   "Each time you plow a field (tile or card), you can also buy 1 STONE for 1 FOOD."
 *
 * Mirrors the BGA isListeningTo: Plow / Improvement / Occupation, with the
 * latter two gated on the played card carrying `field=true` (BGA ruling
 * "Playing field cards counts as plowing a field"). We mirror via the
 * generic `isField` metadata flag (Sprint 7d basis) plus three listeners:
 *   - after `plow`             — always fires (field tile plow)
 *   - after `improvement-any`  — fires when the built improvement isField
 *   - after `play-occupation`  — fires when the played occupation isField
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

const improvementFieldListener: CardListenerRegistration = {
  id: 'C80-rocky-terrain-after-improvement-field',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice ?? ''
    const builtId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!builtId || !isFieldCard(builtId)) return
    return buyStoneForFood(context.player)
  },
}

const occupationFieldListener: CardListenerRegistration = {
  id: 'C80-rocky-terrain-after-occupation-field',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const playedId = context.choice
    if (!playedId || !isFieldCard(playedId)) return
    return buyStoneForFood(context.player)
  },
}

export const C80_RockyTerrain_impl = {
  listeners: [plowListener, improvementFieldListener, occupationFieldListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
