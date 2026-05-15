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
 * BGA: `onPlayerComputeReplaceImprovement` returns `bakeBreadNode()` — i.e.
 * the minor-improvement action is REPLACED by bake-bread (not appended). BGA
 * also forces `onPlayerIsDoable` to keep the underlying improvement action
 * doable so the player can pick the space even with no minor cards in hand,
 * and `onPlayerComputeArgsPlaceFarmer` adds ActionMajorImprovement to the
 * minor-action pool (so a major-improvement space can also be retargeted to
 * bake-bread).
 *
 * Implementation:
 *   1. `computeReplace` listener on `minor-improvement` with
 *      `decline + alternativeFlow: bake-bread leaf` (mirrors B103 / B26 style).
 *   2. `isDoable` listener on `minor-improvement` to flip `doable` to true
 *      when the player has no minor cards but C140 still lets them bake.
 *   3. ActionMajorImprovement → minor-action merger NOT implemented (would
 *      require a new "merge action card pool" extension point — see §2.5).
 */
const computeReplaceListener: CardListenerRegistration = {
  id: 'C140-packaging-artist-replace-minor-improvement',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
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
  actions: ['minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
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
