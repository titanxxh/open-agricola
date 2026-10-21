import type { FarmOperationResult } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'

type ConstructionContext = Pick<CardListenerContext, 'result' | 'player' | 'triggerPlayer'>

/** Only committed receipts owned by this host and its builder, never nested events. */
const operations = (context: ConstructionContext) => {
  const result = context.result
  const builder = context.triggerPlayer ?? context.player
  return result?.type === 'ok' || result?.type === 'flow'
    ? (result.farmOperations ?? []).filter(operation => operation.playerId === builder.id) : []
}

export const getActionRoomConstructions = (context: ConstructionContext): Array<Extract<FarmOperationResult, { kind: 'rooms' }>> =>
  operations(context).flatMap(operation => operation.kind === 'rooms' ? [operation] : [])

export const getRoomsBuiltThisAction = (context: ConstructionContext): number =>
  getActionRoomConstructions(context).reduce((count, operation) => count + operation.positions.length, 0)

export const getActionStableConstructions = (context: ConstructionContext) =>
  operations(context).flatMap(operation => operation.kind === 'stables' ? operation.stables : [])
