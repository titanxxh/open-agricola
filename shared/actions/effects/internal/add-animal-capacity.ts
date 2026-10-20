import type { ActionDefinition } from '../../../contract/types'
import { initCardState } from '../../../cards/helpers/card-state'
export const addAnimalCapacityAction: ActionDefinition = {
  id: 'add-animal-capacity', nameKey: 'actions.store-on-card.name', descriptionKey: 'actions.store-on-card.description',
  roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
  previewEffect: ({ params }) => typeof params?.amount === 'number' && typeof params.capacityPerUnit === 'number'
    ? { kind: 'animalCapacity', amount: params.amount * params.capacityPerUnit } : undefined,
  execute: ({ player, sourceCard, params }) => {
    if (!sourceCard || typeof params?.counter !== 'string' || typeof params.amount !== 'number' || !Number.isSafeInteger(params.amount) || params.amount <= 0 ||
        typeof params.capacityPerUnit !== 'number' || !Number.isSafeInteger(params.capacityPerUnit) || params.capacityPerUnit <= 0) return { type: 'fail', errorKey: 'log.actionFail' }
    const counters = initCardState(player, sourceCard)
    counters[params.counter] = (counters[params.counter] ?? 0) + params.amount
    return { type: 'ok', extraData: { stored: { [params.counter]: params.amount } } }
  },
}
