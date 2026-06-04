import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { sumActionSpaceMovedToTriggerPlayer } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E140_Carter'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const isBuildingResourceSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0 ||
  (space.gainPerRound?.clay ?? 0) > 0 ||
  (space.gainPerRound?.reed ?? 0) > 0 ||
  (space.gainPerRound?.stone ?? 0) > 0

const afterCollectListener: CardListenerRegistration = {
  id: 'E140-carter-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const triggerRound = readCardExtraData<number>(context.player, CARD_ID, 'triggerRound')
    if (triggerRound == null || context.state.round !== triggerRound) return
    if (!isBuildingResourceSpace(context.space)) return

    let buildingResourceCount = 0
    for (const res of BUILDING_RESOURCES) {
      buildingResourceCount += sumActionSpaceMovedToTriggerPlayer(context, res)
    }
    if (buildingResourceCount <= 0) return

    return {
      flow: gainLeaf(CARD_ID, { food: buildingResourceCount }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterCollectListener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const triggerRound = state.round + 1
    writeCardExtraData(player, CARD_ID, 'triggerRound', triggerRound)
    writeCardInfobox(player, CARD_ID, `Active: Round ${triggerRound}`)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E140_Carter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Carter',
    deck: 'E',
    number: 140,
    desc: ['Next round, each time you use a building resource accumulation space, you also get 1 <FOOD> for each building resource that you take from the space.'],
    cost: {},
    players: '3+',
    category: 'FOOD',
  },
  impl: cardImpl,
})

export const E140_Carter_impl = E140_Carter.impl
