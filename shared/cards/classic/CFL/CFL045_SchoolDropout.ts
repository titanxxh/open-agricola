import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getRoundPersonPlacementOrder } from '../../helpers/round-placement'
import { readCardExtraData, isCardFlagged } from '../../helpers/card-state'
import type { GameState, PlayerState, ActionFlow } from '../../../contract/types'
import { findFirstNewborn } from '../../../domain/player'

const CARD_ID = 'CFL045_SchoolDropout'

const consume = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-flag', flag: true },
})
const eligible = (state: GameState, player: PlayerState) => {
  if (state.roundPhase !== 'work' || isCardFlagged(player, CARD_ID) || !findFirstNewborn(player))
    return false
  if (readCardExtraData<number>(player, CARD_ID, 'growthRound') !== state.round) return false
  const ordinal = readCardExtraData<number>(player, CARD_ID, 'growthOrdinal') ?? 0
  return !getRoundPersonPlacementOrder(player)
    .slice(ordinal)
    .some((id) => state.roundActionOrder.includes(id))
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    countExtraTurns: (state, player) => (eligible(state, player) ? 1 : 0),
    contributeExtraTurn: (state, player) => {
      if (!eligible(state, player)) return
      return {
        type: 'xor',
        children: [
          {
            type: 'seq',
            choiceLabelKey: 'ui.interactionUseAbility',
            children: [
              consume(),
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'promote-first-newborn' },
              },
              { type: 'leaf', actionId: 'place-farmer', sourceCard: CARD_ID },
            ],
          },
          { ...consume(), choiceLabelKey: 'ui.interactionDecline' },
        ],
      }
    },
  },
  listeners: [
    {
      id: CARD_ID + '-growth',
      cardIds: [CARD_ID],
      actions: ['family-growth'],
      phases: ['after'],
      handler: ({ state, player }) =>
        state.roundPhase !== 'work'
          ? undefined
          : {
              flow: {
                type: 'seq',
                children: [
                  {
                    type: 'leaf',
                    actionId: 'special-effect',
                    sourceCard: CARD_ID,
                    params: { kind: 'set-extra-data', key: 'growthRound', value: state.round },
                  },
                  {
                    type: 'leaf',
                    actionId: 'special-effect',
                    sourceCard: CARD_ID,
                    params: {
                      kind: 'set-extra-data',
                      key: 'growthOrdinal',
                      value: getRoundPersonPlacementOrder(player).length,
                    },
                  },
                  {
                    type: 'leaf',
                    actionId: 'special-effect',
                    sourceCard: CARD_ID,
                    params: { kind: 'set-flag', flag: false },
                  },
                ],
              },
            },
    },
  ],
} satisfies CardImpl

export const CFL045_SchoolDropout = defineOccupationCard({
  meta: {
    id: 'CFL045_SchoolDropout',
    name: 'School Dropout',
    deck: 'CFL',
    number: 45,
    players: '1+',
    desc: [
      'If you take a Family Growth action during a work phase and none of your subsequent people use a round 1–14 action space, after your other people you may immediately use the newborn as an adult, including on a round space.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL045.png',
  },
  impl: cardImpl,
})
