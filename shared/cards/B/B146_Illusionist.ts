import { cardIdentityChoice } from '../../actions/helpers/card-choice'
import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, ActionDefinition, ActionFlow } from '../../contract/types'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'
import { cardEffectHandChangedEvent } from '../../session/private-hand-events'
import { playerHasCardCapability } from '../helpers/card-type'

const CARD_ID = 'B146_Illusionist'

const DISCARD_ACTION_ID = 'card_B146_Illusionist_discard-from-hand'
const HANDS = [
  { prefix: 'occ:', zone: 'occupationHand', kind: 'occupation' },
  { prefix: 'min:', zone: 'minorHand', kind: 'minor' },
] as const

const discardFromHandAction: ActionDefinition = {
  id: DISCARD_ACTION_ID,
  nameKey: 'actions.discard-from-hand.name',
  descriptionKey: 'actions.discard-from-hand.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    const options: ActionChoiceOption[] = HANDS.flatMap(({ prefix, zone, kind }) =>
      player[zone].map((id) => cardIdentityChoice(id, kind, `${prefix}${id}`)))
    if (options.length === 0) return { type: 'fail', errorKey: 'log.actionFail' }
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.interactionDiscardFromHand',
    }
  },
  resolveChoice: ({ player, emitPrivateEvent }, choice) => {
    const hand = HANDS.find(({ prefix }) => choice.startsWith(prefix))
    const cardId = hand && choice.slice(hand.prefix.length)
    if (!hand || !cardId || !player[hand.zone].includes(cardId)) return { type: 'fail', errorKey: 'log.actionFail' }
    player[hand.zone] = player[hand.zone].filter((id) => id !== cardId)
    emitPrivateEvent?.(cardEffectHandChangedEvent(player.id, [cardId], hand.kind, CARD_ID, DISCARD_ACTION_ID))
    return { type: 'ok' }
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
 * Rule:
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
 *   - If a played card prevents hand discard, skip.
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
  phases: ['before'],
  actionSpaces: 'all',
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (playerHasCardCapability(context.player, 'preventsHandDiscard')) return

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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B146_Illusionist = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Illusionist',
    deck: 'B',
    number: 146,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'Each time you use a building resource accumulation space, you can discard exactly 1 card from your hand to get 1 additional building resource of the accumulating type.',
      ],
    cost: {},
    players: '3+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B146_Illusionist_impl = B146_Illusionist.impl
