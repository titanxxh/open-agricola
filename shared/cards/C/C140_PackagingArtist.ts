import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C140_PackagingArtist'
/**
 * C140 Packaging Artist — Each time you get a Minor Improvement action, you
 * can take a Bake Bread action instead.
 *
 * Rule: `onPlayerComputeReplaceImprovement` returns `bakeBreadNode`. the reference's
 * `onPlayerComputeArgsPlaceFarmer` adds the Major Improvement space to the
 * placeFarmer pool, so a major-improvement space can also be retargeted to
 * bake-bread. The reference `onPlayerIsDoable` forces the underlying action doable so
 * the player can pick the space even with no minor cards in hand.
 *
 * Implementation:
 *   1. `computeReplace` listener registered on BOTH `minor-improvement` and
 *      `improvement-any` (the latter is this project's Major Improvement
 *      space — same shape B103 FieldMerchant uses). Returns
 *      `decline + alternativeFlow: bake-bread leaf`.
 *   2. `isDoable` listener on both actions, force `doable: true` so the
 *      player can place a farmer there even when no real improvement is
 *      affordable / available. Maps the reference `ignoreResources: true`.
 *   3. Both handlers bail out on `actionContext.checkedReplaceAction === true`
 *      so picking the original branch from the inserted XOR does not re-fire
 *      this listener and cause infinite XOR insertion. The engine
 *      (`shared/engine/nodes/interaction-helpers.ts buildReplaceChoiceFlow`)
 *      marks the original leaf with `checkedReplaceAction: true` but does NOT
 *      add the listener id to `skipComputeReplaceListenerIds`, so this guard
 *      is listener-side responsibility.
 *
 * Note: listener IDs keep the legacy `*-minor-improvement` suffix despite now
 * covering `improvement-any` too — they are pure string keys (test lookup +
 * skip-listener tracking), not behavior-affecting.
 */
const computeReplaceListener: CardListenerRegistration = {
  id: 'C140-packaging-artist-replace-minor-improvement',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    if (context.actionContext?.checkedReplaceAction) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'leaf',
        actionId: 'bake-bread',
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'C140-packaging-artist-isdoable-minor-improvement',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    if (context.actionContext?.checkedReplaceAction) return
    if (context.doable) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [computeReplaceListener, isDoableListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C140_PackagingArtist = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Packaging Artist',
    deck: 'C',
    number: 140,
    category: 'FOOD_PROVIDER',
    desc: [
        'When you play this card, you immediately get 1 <GRAIN>. Each time you get a __Minor Improvement__ action, you can take a __Bake Bread__ action instead.',
      ],
    cost: {},
    players: '3+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const C140_PackagingArtist_impl = C140_PackagingArtist.impl
