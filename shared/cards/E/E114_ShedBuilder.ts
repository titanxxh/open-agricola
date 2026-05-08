import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getStableTilesBuiltThisAction } from '../helpers/action-snapshot'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E114_ShedBuilder'

// E114 Shed Builder: When you build your 1st and 2nd stable, you get 1 GRAIN.
// When you build your 3rd and 4th stable, you get 1 VEGETABLE.
// (This does not apply to stables you have already built.)
const listener: CardListenerRegistration = {
  id: 'E114-shed-builder-after-stables',
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
      if (i === 1 || i === 2) gains.grain = (gains.grain ?? 0) + 1
      if (i === 3 || i === 4) gains.vegetable = (gains.vegetable ?? 0) + 1
    }
    if (Object.keys(gains).length === 0) return
    return { flow: gainLeaf(CARD_ID, gains), sourceCard: CARD_ID }
  },
}

export const E114_ShedBuilder = new Occupation({
  id: CARD_ID,
  name: 'Shed Builder',
  deck: 'E',
  number: 114,
  category: 'CROPS_-_GRAIN_AND_VEGETABLE',
  desc: [
    'When you build your 1st and 2nd stable, you get 1 <GRAIN>. When you build your 3rd and 4th stable, you get 1 <VEGETABLE>. (This does not apply to stables you have already built.)',
  ],
  cost: {},
  players: '1+',
})

export const E114_ShedBuilder_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
