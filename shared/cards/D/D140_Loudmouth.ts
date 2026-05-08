import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { D140_Loudmouth } from '../../cards-display/D/D140_Loudmouth'
export { D140_Loudmouth }

const CARD_ID = D140_Loudmouth.id

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'stone', 'reed']

const ANIMAL_RESOURCES: (keyof Resource)[] = ['sheep', 'boar', 'cattle']

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

export const D140_Loudmouth_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
