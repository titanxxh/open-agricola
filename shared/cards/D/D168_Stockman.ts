import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getStableTilesBuiltThisAction } from '../helpers/action-snapshot'
import { getStableCountForCards } from '../../domain/stables'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D168_Stockman'
const listener: CardListenerRegistration = {
  id: 'D168-stockman-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const builtThisAction = getStableTilesBuiltThisAction(context.player)
    if (builtThisAction <= 0) return
    const nAfter = getStableCountForCards(context.player)
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D168_Stockman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stockman',
    deck: 'D',
    number: 168,
    category: 'LIVESTOCK_PROVIDER',
    desc: [
        'When you build your 2nd/3rd/4th stable, you immediately get 1 <CATTLE>/<PIG>/<SHEEP>, even if built on the same turn (but not retroactively).',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const D168_Stockman_impl = D168_Stockman.impl
