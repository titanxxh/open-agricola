import { collectAccumulatedResources } from '../effects/collect'
import type { ActionDefinition, Resource } from '../../contract/types'
import { deriveCanBeExecutedByFlow } from '../flow'

type AccumulatingActionConfig = {
  id: string
  nameKey: string
  descriptionKey: string
  roundAvailable: number
  gainPerRound: Partial<Resource>
  players?: number[]
}

export const createAccumulatingAction = (
  config: AccumulatingActionConfig,
): ActionDefinition => ({
  ...config,
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: ({ player, space }) => {
    collectAccumulatedResources(player, space)
    return { type: 'ok' }
  },
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'collect' }],
  },
})
