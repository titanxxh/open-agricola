import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { getPlayedCardDefinitions } from '../../helpers/card-type'
import { getPrintedImprovementResourceCost } from '../../../actions/helpers/improvement-helpers'

const CARD_ID = 'CWM046_StoneCurator'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-stone',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['after'],
      handler: (context) =>
        (context.space?.gainPerRound?.stone ?? 0) > 0
          ? { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { food: 1 }) }
          : undefined,
    },
  ],
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) =>
      Math.floor((player.houseType === 'stone' ? player.rooms : 0) / 2) +
      Math.floor(
        getPlayedCardDefinitions(player).filter(
          (c) =>
            getPrintedImprovementResourceCost(c.id, 'stone') > 0 &&
            !player.occupationPlayed.includes(c.id),
        ).length / 2,
      ),
  },
} satisfies CardImpl

export const CWM046_StoneCurator = defineOccupationCard({
  meta: {
    id: 'CWM046_StoneCurator',
    name: "Stone Curator",
    deck: 'CWM',
    number: 46,
    desc: ["Whenever you use a <STONE> accumulation space, you also get 1 <FOOD>. At the end of the game, get 1 bonus <SCORE> per 2 stone rooms and per 2 improvements whose printed cost includes <STONE>."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM046.png',
  },
  impl: cardImpl,
})

export const CWM046_StoneCurator_impl = CWM046_StoneCurator.impl
