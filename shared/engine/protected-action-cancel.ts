import type { ActionExecutionResult } from '../contract/types'

const protectedActionCancelErrorKeys: Record<string, string> = {
  plow: 'log.action',
  sow: 'log.action',
  selection: 'log.action',
  construct: 'log.buildRoomFail',
  stables: 'log.buildStableFail',
  fence: 'log.fencingFail',
  reorganize: 'log.reorganizeFail',
}

export const rejectProtectedActionCancel = (
  actionId: string | null | undefined,
  choice: string,
): ActionExecutionResult | null => {
  if (choice !== 'cancel' || !actionId) return null
  const errorKey = protectedActionCancelErrorKeys[actionId]
  if (!errorKey) return null
  return { type: 'fail', errorKey, recoverable: true }
}

export const isProtectedActionCancel = (
  actionId: string | null | undefined,
  choice: string,
): boolean => rejectProtectedActionCancel(actionId, choice) !== null
