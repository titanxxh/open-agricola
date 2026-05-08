import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C112_Thresher } from '../../cards-display/C/C112_Thresher'

const CARD_ID = C112_Thresher.id

/**
 * C112 Thresher — Occupation
 *
 * Before using Grain Utilization, Farmland, or Cultivation, you can
 * optionally buy 1 grain for 1 food.
 *
 * BGA `C112_Thresher::onPlayerPlaceFarmer` (PlaceFarmer event on Farmland /
 * GrainUtilization / Cultivation) returns an optional SEQ(pay 1 food, gain 1
 * grain) — i.e. the player exchanges food → grain so they can sow even when
 * starting with 0 grain. We mirror it as a `before` listener on the three
 * trigger space IDs, returning an optional `payGainNode({ food → grain })`.
 *
 * BGA `C112_Thresher::onPlayerIsDoable` flips doability for SOW / EXCHANGE
 * to true when the player can pay 1 food (so the action card itself does not
 * appear undoable on a board with sow as its only inner option). Mirror it
 * as an `isDoable` listener on `sow` (we do not currently model EXCHANGE as
 * a board-action subnode of these spaces).
 *
 * Players: 1+.
 */
const TRIGGER_SPACE_IDS = ['grain-utilization', 'farmland', 'cultivation']

const beforeListener: CardListenerRegistration = {
  id: 'C112-thresher-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: TRIGGER_SPACE_IDS,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if ((context.player.resources.food ?? 0) < 1) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 1 },
      gain: { grain: 1 },
    })
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'C112-thresher-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if ((context.player.resources.food ?? 0) < 1) return
    // Player has 1+ food → before-hook will buy them 1 grain, after which
    // sow becomes possible (assuming an empty field exists). Empty-field
    // gating is left to the actual sow leaf at runtime; here we only need
    // to unblock the doability check so the engine doesn't short-circuit
    // the parent OR.
    return { doable: true }
  },
}

export const C112_Thresher_impl = {
  listeners: [beforeListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
