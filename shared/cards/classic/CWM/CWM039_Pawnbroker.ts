import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { getCardDefinitionById } from '../../helpers/card-type'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { gainLeaf } from '../../helpers/pay-gain-node'
import type { PlayerState } from '../../../contract/types'

const CARD_ID = 'CWM039_Pawnbroker'

const pledges = (player: PlayerState) =>
  readCardExtraData<Record<string, number>>(player, CARD_ID, 'pledges') ?? {}
const eligible = (player: PlayerState) =>
  [...player.improvements, ...player.minorPlayed].filter(
    (id) => (getCardDefinitionById(id)?.vp ?? 0) > (pledges(player)[id] ?? 0),
  )
const PLEDGE = 'card_' + CARD_ID + '_pledge'
registerAdHocAction({
  id: PLEDGE,
  nameKey: 'actions.exchange.name',
  descriptionKey: 'actions.exchange.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params }) => {
    const cardId = params?.cardId
    if (typeof cardId !== 'string' || !eligible(player).includes(cardId))
      return { type: 'fail', errorKey: 'log.exchangeFail' }
    const current = pledges(player)
    writeCardExtraData(player, CARD_ID, 'pledges', {
      ...current,
      [cardId]: (current[cardId] ?? 0) + 1,
    })
    return { type: 'flow', flow: gainLeaf(CARD_ID, { food: 3 }) }
  },
})
const cardImpl = {
  effect: {
    id: CARD_ID,
    protectedImprovementIds: (player) => Object.keys(pledges(player)),
    computeBonusScore: (_state, player) =>
      -Object.values(pledges(player)).reduce((n, vp) => n + vp, 0),
  },
  listeners: [
    {
      id: CARD_ID + '-pledge',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ player }) => {
        const cards = eligible(player)
        return cards.length
          ? {
              sourceCard: CARD_ID,
              flow: {
                type: 'xor',
                children: cards.map((cardId) => ({
                  type: 'leaf',
                  actionId: PLEDGE,
                  sourceCard: CARD_ID,
                  choiceLabelKey: `cards.${cardId}.name`,
                  params: { cardId },
                })),
              },
            }
          : undefined
      },
    },
  ],
} satisfies CardImpl

export const CWM039_Pawnbroker = defineOccupationCard({
  meta: {
    id: 'CWM039_Pawnbroker',
    name: "Pawnbroker",
    deck: 'CWM',
    number: 39,
    desc: ["At any time, you may convert 1 printed point on an improvement in front of you into 3 food. You can no longer remove or return that improvement."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM039.png',
  },
  impl: cardImpl,
})

export const CWM039_Pawnbroker_impl = CWM039_Pawnbroker.impl
