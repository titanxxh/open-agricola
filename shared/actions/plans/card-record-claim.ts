import type { ActionDefinition, PlayerState, Resource } from '../../contract/types'
import { incCardUsed, readCardExtraData, writeCardExtraData } from '../../cards/helpers/card-state'

const recordsOf = (player: PlayerState, sourceCard: string, key: string): string[] => {
  const value = readCardExtraData<unknown>(player, sourceCard, key)
  return Array.isArray(value) && value.every((record): record is string => typeof record === 'string') ? value : []
}

export const createCardRecordClaimActions = (sourceCard: string, key: string, resourcesByRecord: Readonly<Record<string, Partial<Resource>>>, id: string, commitId: string): readonly ActionDefinition[] => {
  const commit: ActionDefinition = {
    id: commitId, nameKey: `cards.${sourceCard}.name`, descriptionKey: `cards.${sourceCard}.name`, roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
    execute: ({ player, params }) => {
      const record = params?.pair
      const records = recordsOf(player, sourceCard, key)
      if (typeof record !== 'string' || !records.includes(record)) return { type: 'fail', errorKey: 'log.actionFail' }
      const index = records.indexOf(record)
      const remaining = records.filter((_, candidate) => candidate !== index)
      writeCardExtraData(player, sourceCard, key, remaining)
      incCardUsed(player, sourceCard)
      return { type: 'ok', extraData: { [key]: remaining } }
    },
  }
  const claim: ActionDefinition = {
    id, nameKey: `cards.${sourceCard}.name`, descriptionKey: `cards.${sourceCard}.name`, roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
    previewEffect: ({ params }) => typeof params?.pair === 'string' && resourcesByRecord[params.pair]
      ? { kind: 'resourceMovement', resources: resourcesByRecord[params.pair]!, from: { kind: 'card', cardId: sourceCard }, to: { kind: 'player' } } : undefined,
    execute: ({ player, params }) => {
      const record = params?.pair
      const resources = typeof record === 'string' ? resourcesByRecord[record] : undefined
      if (!resources || typeof record !== 'string' || !recordsOf(player, sourceCard, key).includes(record)) return { type: 'fail', errorKey: 'log.actionFail' }
      return { type: 'flow', flow: { type: 'seq', children: [
        { type: 'leaf', actionId: 'gain', sourceCard, params: resources },
        { type: 'leaf', actionId: commitId, sourceCard, params: { pair: record } },
      ] } }
    },
  }
  return [claim, commit]
}
