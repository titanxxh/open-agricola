import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getStableTilesBuiltThisAction } from '../helpers/action-snapshot'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { D168_Stockman } from '../../cards-display/D/D168_Stockman'
export { D168_Stockman }

const CARD_ID = D168_Stockman.id

const listener: CardListenerRegistration = {
  id: 'D168-stockman-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const builtThisAction = getStableTilesBuiltThisAction(context.player)
    if (builtThisAction <= 0) return
    const nAfter = context.player.stableTiles.length
    const nBefore = nAfter - builtThisAction
    const gains: Partial<Resource> = {}
    for (let i = nBefore + 1; i <= nAfter; i++) {
      if (i === 2) gains.cattle = (gains.cattle ?? 0) + 1
      if (i === 3) gains.boar = (gains.boar ?? 0) + 1
      if (i === 4) gains.sheep = (gains.sheep ?? 0) + 1
    }
    if (Object.keys(gains).length === 0) return
    return { flow: gainLeaf(CARD_ID, gains), sourceCard: CARD_ID }
  },
}

export const D168_Stockman_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
