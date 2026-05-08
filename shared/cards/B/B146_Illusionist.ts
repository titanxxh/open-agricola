import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, ActionDefinition, ActionFlow } from '../../contract/types'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'
import { B146_Illusionist } from '../../cards-display/B/B146_Illusionist'
export { B146_Illusionist }

const CARD_ID = B146_Illusionist.id

const DISCARD_ACTION_ID = 'card_B146_Illusionist_discard-from-hand'

const discardFromHandAction: ActionDefinition = {
  id: DISCARD_ACTION_ID,
  nameKey: 'actions.discard-from-hand.name',
  descriptionKey: 'actions.discard-from-hand.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    const options: ActionChoiceOption[] = [
      ...player.occupationHand.map((id) => ({
        value: `occ:${id}`,
        labelKey: `occupations.${id}.name`,
      })),
      ...player.minorHand.map((id) => ({
        value: `min:${id}`,
        labelKey: `minors.${id}.name`,
      })),
    ]
    if (options.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.interactionDiscardFromHand',
    }
  },
  resolveChoice: ({ player }, choice) => {
    if (choice.startsWith('occ:')) {
      const cardId = choice.slice(4)
      if (!player.occupationHand.includes(cardId)) {
        return { type: 'fail', logKey: 'log.actionFail' }
      }
      player.occupationHand = player.occupationHand.filter((id) => id !== cardId)
      return { type: 'ok', logKey: 'log.cardEffectTrigger' }
    }
    if (choice.startsWith('min:')) {
      const cardId = choice.slice(4)
      if (!player.minorHand.includes(cardId)) {
        return { type: 'fail', logKey: 'log.actionFail' }
      }
      player.minorHand = player.minorHand.filter((id) => id !== cardId)
      return { type: 'ok', logKey: 'log.cardEffectTrigger' }
    }
    return { type: 'fail', logKey: 'log.actionFail' }
  },
}

registerAdHocAction(discardFromHandAction)

/**
 * B146 Illusionist (Occupation, 3+):
 *
 * "Each time you use a building resource accumulation space, you can
 *  discard exactly 1 card from your hand to get 1 additional building
 *  resource of the accumulating type."
 *
 * BGA (B146_Illusionist.php lines 32-62):
 *   - isListeningTo: isBeforeCollectEvent for WOOD / CLAY / REED / STONE.
 *   - onPlayerPlaceFarmer: if hand is empty or Lantern House is in play,
 *     skip. Otherwise return an optional SEQ [selectCard, gainNode(resource=1)].
 *   - actSelectCard: destroys the chosen card and moves it to the box.
 *
 * Implementation:
 *   - Listener on `collect` phase `before`. Fires for any space whose
 *     `space.resources` has >0 wood/clay/reed/stone (this naturally scopes
 *     to the building-resource accumulation spaces: forest, copse, grove,
 *     clay-pit, reed-bank, eastern-quarry, western-quarry, etc.).
 *   - If `C35_LanternHouse` is played, skip (BGA ruling).
 *   - If the union of occupationHand + minorHand is empty, skip.
 *   - Return optional seq: [ discard-from-hand, gain({ resource: 1 }) ]. The
 *     `discard-from-hand` action presents each hand card as a dynamic choice
 *     option. No new pending-action type needed.
 */

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

type BuildingResource = (typeof BUILDING_RESOURCES)[number]

const pickAccumulatingResource = (
  resources: Record<string, number>,
): BuildingResource | null => {
  for (const r of BUILDING_RESOURCES) {
    if ((resources[r] ?? 0) > 0) return r
  }
  return null
}

const listener: CardListenerRegistration = {
  id: 'B146-illusionist-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // BGA ruling: Lantern House disables Illusionist.
    if (context.player.occupationPlayed.includes('C35_LanternHouse')) return

    const hand = [
      ...(context.player.occupationHand ?? []),
      ...(context.player.minorHand ?? []),
    ]
    if (hand.length === 0) return

    const space = context.space
    if (!space) return
    const resource = pickAccumulatingResource(space.resources as Record<string, number>)
    if (!resource) return

    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: DISCARD_ACTION_ID,
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { [resource]: 1 },
        },
      ],
    }
    return {
      flow,
      sourceCard: CARD_ID,
    }
  },
}

export const B146_Illusionist_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
