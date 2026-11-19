import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData } from '../../helpers/card-state'
import { payGainFlow } from '../../helpers/pay-gain-node'
import { jumpLeaf } from '../../helpers/jump-leaf'
import { createEventQuery } from '../../../events/query'
import type { Resource } from '../../../contract/types'

const CARD_ID = 'CWM048_SundayWorker'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-repeat',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['after'],
      handler: (context) => {
        if (
          ![7, 14].includes(context.state.round) ||
          readCardExtraData(context.player, CARD_ID, 'usedRound') === context.state.round
        )
          return
        const resources: Partial<Resource> = {}
        for (const event of createEventQuery(context.actionEvents ?? []).filter('resource.moved')) {
          if (
            event.from.kind !== 'actionSpace' ||
            event.from.spaceId !== context.space.id ||
            event.to.kind !== 'player' ||
            event.to.playerId !== context.player.id
          )
            continue
          for (const [key, amount] of Object.entries(event.resources))
            if (amount)
              resources[key as keyof Resource] = (resources[key as keyof Resource] ?? 0) + amount
        }
        const repeat = jumpLeaf({ sourceCard: CARD_ID, targetSpaceId: context.space.id })
        if (repeat.type === 'leaf' && Object.values(context.space.gainPerRound).some((n) => n > 0))
          repeat.actionContext = {
            ...repeat.actionContext,
            replaySpaceId: context.space.id,
            replayResources: resources,
          }
        return {
          sourceCard: CARD_ID,
          flow: payGainFlow({
            cardId: CARD_ID,
            cost: { food: 1 },
            followUp: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-extra-data', key: 'usedRound', value: context.state.round },
              },
              repeat,
            ],
          }),
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM048_SundayWorker = defineOccupationCard({
  meta: {
    id: 'CWM048_SundayWorker',
    name: "Sunday Worker",
    deck: 'CWM',
    number: 48,
    desc: ["Once in round 7 and once in round 14, after using an action space, you may pay 1 food to immediately use it again. For an accumulation space, you receive its accumulated resources twice. This may trigger on the action that plays this card in round 7 or 14."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM048.png',
  },
  impl: cardImpl,
})

export const CWM048_SundayWorker_impl = CWM048_SundayWorker.impl
