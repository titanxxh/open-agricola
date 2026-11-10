import type { FarmOperationResult } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'

type ConstructionContext = Pick<CardListenerContext, 'result' | 'player' | 'triggerPlayer'>

/** Only this host's committed receipts; farm ownership does not change its builder. */
const operations = (context: ConstructionContext, ownerPlayerId?: string) => {
  const result = context.result
  return result?.type === 'ok' || result?.type === 'flow'
    ? (result.farmOperations ?? []).filter(operation => ownerPlayerId === undefined || operation.playerId === ownerPlayerId) : []
}

export const getActionRoomConstructions = (context: ConstructionContext, ownerPlayerId?: string): Array<Extract<FarmOperationResult, { kind: 'rooms' }>> =>
  operations(context, ownerPlayerId).flatMap(operation => operation.kind === 'rooms' ? [operation] : [])

export const getRoomsBuiltThisAction = (context: ConstructionContext, ownerPlayerId?: string): number =>
  getActionRoomConstructions(context, ownerPlayerId).reduce((count, operation) => count + operation.positions.length, 0)

export const getActionStableConstructions = (context: ConstructionContext, ownerPlayerId?: string) =>
  operations(context, ownerPlayerId).flatMap(operation => operation.kind === 'stables' ? operation.stables : [])
