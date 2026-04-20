import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D146_Porter'

// Building resources that can trigger the bonus
const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const listener: CardListenerRegistration = {
  id: 'D146-porter-after-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.result?.type !== 'ok') return
    const gained = context.result.resourcesGained
    if (!gained) return
    // Find any building resource with 4+ collected
    const gain: Partial<Resource> = {}
    let triggered = false
    for (const res of BUILDING_RESOURCES) {
      if ((gained[res] ?? 0) >= 4) {
        gain[res] = (gain[res] ?? 0) + 1
        triggered = true
      }
    }
    if (!triggered) return
    gain.food = (gain.food ?? 0) + 1
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

export const D146_Porter = new Occupation({
  id: CARD_ID,
  name: 'Porter',
  deck: 'D',
  number: 146,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you take at least 4 of the same building resource from an accumulation space, you get 1 additional building resource of the accumulating type and 1 <FOOD>',
  ],
  cost: {},
  players: '3+',
  implemented: true,
})

export const D146_Porter_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
