import type { ActionDefinition } from '../../../contract/types'
import { getAssignedAnimalsByType } from '../../../domain/animals'
import { readCardExtraData, writeCardExtraData } from '../../../cards/helpers/card-state'
import { gainAction } from '../gain'

export const lieAnimalAction: ActionDefinition = {
  id: 'lie-animal', nameKey: 'actions.selection.name', descriptionKey: 'actions.selection.description',
  roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
  previewEffect: ({ params }) => params?.animal === 'horse' && typeof params.amount === 'number' && typeof params.fuel === 'number'
    ? { kind: 'animalPose', animal: 'horse', amount: params.amount, pose: 'lying', resourcesGained: { fuel: params.fuel } } : undefined,
  execute: context => {
    const { params, player, state, sourceCard } = context
    if (!sourceCard || params?.animal !== 'horse' || typeof params.counter !== 'string' || typeof params.amount !== 'number' ||
        !Number.isSafeInteger(params.amount) || params.amount <= 0 || typeof params.fuel !== 'number' || params.fuel <= 0) return { type: 'fail', errorKey: 'log.actionFail' }
    const lying = readCardExtraData<number>(player, sourceCard, params.counter) ?? 0
    if ((getAssignedAnimalsByType(player, state).horse ?? 0) - lying < params.amount) return { type: 'fail', errorKey: 'log.actionFail' }
    writeCardExtraData(player, sourceCard, params.counter, lying + params.amount)
    return gainAction.execute({ ...context, params: { fuel: params.fuel } })
  },
}
