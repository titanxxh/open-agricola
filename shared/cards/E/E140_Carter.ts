import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E140_Carter'

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const isBuildingResourceSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0 ||
  (space.gainPerRound?.clay ?? 0) > 0 ||
  (space.gainPerRound?.reed ?? 0) > 0 ||
  (space.gainPerRound?.stone ?? 0) > 0

/**
 * E140 Carter: Next round, each time you use a building resource accumulation space,
 * you also get 1 food for each building resource that you take from the space.
 *
 * One-time, one-round effect: active only during triggerRound.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const triggerRound = state.round + 1
    writeCardExtraData(player, CARD_ID, 'triggerRound', triggerRound)
    writeCardInfobox(player, CARD_ID, `Active: Round ${triggerRound}`)
  },
})

const afterCollectListener: CardListenerRegistration = {
  id: 'E140-carter-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const triggerRound = readCardExtraData<number>(context.player, CARD_ID, 'triggerRound')
    if (triggerRound == null || context.state.round !== triggerRound) return
    if (!isBuildingResourceSpace(context.space)) return

    const gained =
      context.result?.type === 'ok' ? context.result.resourcesGained : undefined
    if (!gained) return

    let buildingResourceCount = 0
    for (const res of BUILDING_RESOURCES) {
      buildingResourceCount += gained[res] ?? 0
    }
    if (buildingResourceCount <= 0) return

    return {
      flow: gainLeaf(CARD_ID, { food: buildingResourceCount }),
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterCollectListener)

export const E140_Carter = new Occupation({
  id: CARD_ID,
  name: 'Carter',
  deck: 'E',
  number: 140,
  desc: ['Next round, each time you use a building resource accumulation space, you also get 1 <FOOD> for each building resource that you take from the space.'],
  cost: {},
  players: '3+',
})
