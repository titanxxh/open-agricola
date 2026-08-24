import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionDefinition, BonusModifier } from '../../contract/types'
import { getRenovation } from '../../actions/effects/renovation'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'E087_MasterRenovator'
const POP_MODIFIER_ACTION_ID = 'card_E087_MasterRenovator_popModifier'
/**
 * Rule: `Utils::addBonusChoices($args['costs'], [[WOOD=>-1],[CLAY=>-1],
 * [STONE=>-1],[REED=>-1]], $this->id)` gated on `isFlagged()`. The flag is
 * set/cleared via `flagCardNode()`/`unflagCardNode()` wrapping the
 * RENOVATION leaf inside the SEQ returned from `onPlayerEndWorkPhase`.
 *
 * Our equivalent: push a BonusModifier with 4 choices into player.activeModifiers
 * before returning the SEQ flow, and pop via:
 *   1. a card-local action returned by the `after:renovate-house` listener
 *   2. `onAfterRoundEnd` safety net (covers SEQ skip path).
 */
const E087_BONUS_MODIFIER: BonusModifier = {
  type: 'bonus',
  cardId: CARD_ID,
  appliesTo: ['renovation'],
  optional: false,
  choices: [
    { discount: { wood: 1 }, sources: [CARD_ID] },
    { discount: { clay: 1 }, sources: [CARD_ID] },
    { discount: { stone: 1 }, sources: [CARD_ID] },
    { discount: { reed: 1 }, sources: [CARD_ID] },
  ],
}

const popModifier = (player: { activeModifiers: { cardId: string }[] }) => {
  player.activeModifiers = player.activeModifiers.filter(
    (m) => m.cardId !== CARD_ID,
  ) as typeof player.activeModifiers
}

const pushModifier = (player: {
  activeModifiers: { cardId: string }[]
}) => {
  popModifier(player)
  player.activeModifiers.push(E087_BONUS_MODIFIER as never)
}

const popModifierAction: ActionDefinition = {
  id: POP_MODIFIER_ACTION_ID,
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => player.occupationPlayed.includes(CARD_ID),
  execute: ({ player }) => {
    popModifier(player as never)
    return { type: 'ok' }
  },
}

registerAdHocAction(popModifierAction)

const afterRenovateListener: CardListenerRegistration = {
  id: 'E87-master-renovator-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    return {
      flow: {
        type: 'leaf',
        actionId: POP_MODIFIER_ACTION_ID,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterRenovateListener],
  effect: {
    id: CARD_ID,
    onStartReturnHome: (state, player) => {
      if (state.round !== 7 && state.round !== 9) return
      if (player.houseType === 'stone') return
      const renovation = getRenovation(player)
      if (!renovation) return
      pushModifier(player as never)
      return {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'renovate-house',
            optional: true,
            sourceCard: CARD_ID,
          },
        ],
      }
    },
    onAfterRoundEnd: (_state, player) => {
      popModifier(player as never)
      return undefined
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E087_MasterRenovator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Master Renovator',
    deck: 'E',
    number: 87,
    category: 'FARMYARD_-_HOUSE_BUILDING_OR_RENOVATION',
    desc: [
        'At the end of the work phases of rounds 7 and 9, you can take a __Renovation__ action without placing a person and pay 1 building resource of your choice less.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E087_MasterRenovator_impl = E087_MasterRenovator.impl
