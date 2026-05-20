import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E140_Carter } from '../../cards-display/E/E140_Carter'

const CARD_ID = E140_Carter.id

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const isBuildingResourceSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0 ||
  (space.gainPerRound?.clay ?? 0) > 0 ||
  (space.gainPerRound?.reed ?? 0) > 0 ||
  (space.gainPerRound?.stone ?? 0) > 0

const actionSpaceResourceMovedToTriggerPlayer = (
  context: CardListenerContext,
  resource: (typeof BUILDING_RESOURCES)[number],
) =>
  sumResourceMovedToPlayer(
    context.actionEvents ?? context.transactionEvents,
    resource,
    (context.triggerPlayer ?? context.player).id,
    (event) => event.from.kind === 'actionSpace',
  )

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
      buildingResourceCount += actionSpaceResourceMovedToTriggerPlayer(context, res)
    }
    if (buildingResourceCount <= 0) return

    return {
      flow: gainLeaf(CARD_ID, { food: buildingResourceCount }),
      sourceCard: CARD_ID,
    }
  },
}

export const E140_Carter_impl = {
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
