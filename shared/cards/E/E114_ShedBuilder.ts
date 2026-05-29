import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getStableTilesBuiltThisAction } from '../helpers/action-snapshot'
import { getOrdinaryStableCount } from '../../domain/stables'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { E114_ShedBuilder } from '../../cards-display/E/E114_ShedBuilder'

const CARD_ID = E114_ShedBuilder.id

const listener: CardListenerRegistration = {
  id: 'E114-shed-builder-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const builtThisAction = getStableTilesBuiltThisAction(context.player)
    if (builtThisAction <= 0) return
    const nAfter = getOrdinaryStableCount(context.player)
    const nBefore = nAfter - builtThisAction
    const gains: Partial<Resource> = {}
    for (let i = nBefore + 1; i <= nAfter; i++) {
      if (i === 1 || i === 2) gains.grain = (gains.grain ?? 0) + 1
      if (i === 3 || i === 4) gains.vegetable = (gains.vegetable ?? 0) + 1
    }
    if (Object.keys(gains).length === 0) return
    return { flow: gainLeaf(CARD_ID, gains), sourceCard: CARD_ID }
  },
}

export const E114_ShedBuilder_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
