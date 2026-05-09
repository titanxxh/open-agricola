import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'
import type { CardImpl } from '../registry'
import { A107_Catcher } from '../../cards-display/A/A107_Catcher'

const CARD_ID = A107_Catcher.id

const isBuildingResourceSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0 ||
  (space.gainPerRound?.clay ?? 0) > 0 ||
  (space.gainPerRound?.reed ?? 0) > 0 ||
  (space.gainPerRound?.stone ?? 0) > 0

const countBuildingResources = (space: CardListenerContext['space']): number =>
  (space.resources?.wood ?? 0) +
  (space.resources?.clay ?? 0) +
  (space.resources?.reed ?? 0) +
  (space.resources?.stone ?? 0)

const listener: CardListenerRegistration = {
  id: 'A107-catcher-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isBuildingResourceSpace(context.space)) return
    // getRoundPlacementOrder includes the current placement (after place-farmer)
    const placed = getRoundPlacementOrder(context.player).length
    const n = countBuildingResources(context.space)
    if (
      (placed === 1 && n === 5) ||
      (placed === 2 && n === 4) ||
      (placed === 3 && n === 3)
    ) {
      return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
    }
  },
}

export const A107_Catcher_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
