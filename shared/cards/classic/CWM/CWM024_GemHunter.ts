import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { returnToSpaceThenGainFlow } from '../../helpers/pay-gain-node'
import { createEventQuery } from '../../../events/query'

const CARD_ID = 'CWM024_GemHunter'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-clay',
      cardIds: [CARD_ID],
      actions: ['collect'],
      phases: ['after'],
      handler: (context) => {
        if (!(context.space.gainPerRound.clay ?? 0)) return
        const clay = createEventQuery(context.actionEvents ?? [])
          .filter('resource.moved')
          .filter(
            (e) =>
              e.from.kind === 'actionSpace' &&
              e.from.spaceId === context.space.id &&
              e.to.kind === 'player' &&
              e.to.playerId === context.player.id,
          )
          .reduce((sum, e) => sum + (e.resources.clay ?? 0), 0)
        if (!clay) return
        return context.state.round <= 9 && clay >= 3
          ? returnToSpaceThenGainFlow({ cardId: CARD_ID, cost: { clay: 1 }, gain: { stone: 1 } })
          : { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { stone: 1 }) }
      },
    },
  ],
} satisfies CardImpl

export const CWM024_GemHunter = defineOccupationCard({
  meta: {
    id: 'CWM024_GemHunter',
    name: "Gem Hunter",
    deck: 'CWM',
    number: 24,
    desc: ["Whenever you receive <CLAY> from an accumulation space, you also get 1 <STONE>. In round 9 or earlier, if that space has at least 3 <CLAY>, you must leave 1 <CLAY> there to get that <STONE>."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM024.png',
  },
  impl: cardImpl,
})

export const CWM024_GemHunter_impl = CWM024_GemHunter.impl
