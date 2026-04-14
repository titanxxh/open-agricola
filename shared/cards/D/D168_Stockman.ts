import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getStableTilesBuiltThisAction } from '../helpers/action-snapshot'
import type { Resource } from '../../game/types'

const CARD_ID = 'D168_Stockman'

// D168 Stockman: When you build your 2nd/3rd/4th stable, you immediately get
// 1 CATTLE/PIG/SHEEP, even if built on the same turn (but not retroactively).
const listener: CardListenerRegistration = {
  id: 'D168-stockman-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
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

registerCardListener(listener)

export const D168_Stockman = new Occupation({
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
})
