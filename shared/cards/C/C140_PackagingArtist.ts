import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C140_PackagingArtist } from '../../cards-display/C/C140_PackagingArtist'

const CARD_ID = C140_PackagingArtist.id

/**
 * C140 Packaging Artist — Each time you get a Minor Improvement action, you
 * can take a Bake Bread action instead.
 *
 * BGA: `onPlayerComputeReplaceImprovement` returns `bakeBreadNode()`. BGA's
 * `onPlayerComputeArgsPlaceFarmer` adds the Major Improvement space to the
 * placeFarmer pool, so a major-improvement space can also be retargeted to
 * bake-bread. BGA `onPlayerIsDoable` forces the underlying action doable so
 * the player can pick the space even with no minor cards in hand.
 *
 * Implementation:
 *   1. `computeReplace` listener registered on BOTH `minor-improvement` and
 *      `improvement-any` (the latter is this project's Major Improvement
 *      space — same shape B103 FieldMerchant uses). Returns
 *      `decline + alternativeFlow: bake-bread leaf`.
 *   2. `isDoable` listener on both actions, force `doable: true` so the
 *      player can place a farmer there even when no real improvement is
 *      affordable / available. Maps BGA `ignoreResources: true`.
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

export const C140_PackagingArtist_impl = {
  listeners: [computeReplaceListener, isDoableListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
