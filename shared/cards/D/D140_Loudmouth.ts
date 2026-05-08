import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D140_Loudmouth'

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'stone', 'reed']
const ANIMAL_RESOURCES: (keyof Resource)[] = ['sheep', 'boar', 'cattle']

// D140 Loudmouth: Each time you take at least 4 building resources or 4 animals from an
// accumulation space, you also get 1 FOOD.
const listener: CardListenerRegistration = {
  id: 'D140-loudmouth-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gained = context.result?.type === 'ok' ? (context.result.resourcesGained ?? {}) : {}
    const buildingTotal = BUILDING_RESOURCES.reduce((sum, r) => sum + (gained[r] ?? 0), 0)
    const animalTotal = ANIMAL_RESOURCES.reduce((sum, r) => sum + (gained[r] ?? 0), 0)
    if (buildingTotal < 4 && animalTotal < 4) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

export const D140_Loudmouth = new Occupation({
  id: CARD_ID,
  name: 'Loudmouth',
  deck: 'D',
  number: 140,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you take at least 4 building resources or 4 animals from an accumulation space, you also get 1 <FOOD>.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})

export const D140_Loudmouth_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
