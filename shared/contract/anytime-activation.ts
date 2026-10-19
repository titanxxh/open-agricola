import type { ActionFlow } from './types'

export type AnytimeTurnAffiliation =
  | { kind: 'inside-turn' | 'after-turn'; token: number }
  | { kind: 'before-turn' | 'outside-turn' }

export type AnytimeActivation = {
  id: string
  turn: AnytimeTurnAffiliation
  parentId?: string
}

export type AnytimeActivationFlow = ActionFlow & { type: 'seq'; anytimeActionId: string }

export const parseAnytimeTurnAffiliation = (value: unknown): AnytimeTurnAffiliation => {
  if (!value || typeof value !== 'object' || !('kind' in value)) throw new Error('Invalid anytime Turn affiliation')
  switch (value.kind) {
    case 'inside-turn':
    case 'after-turn':
      if (!('token' in value) || typeof value.token !== 'number' || !Number.isSafeInteger(value.token)
        || value.token < 1 || Object.keys(value).some(key => key !== 'kind' && key !== 'token')) {
        throw new Error('Invalid anytime Turn token')
      }
      return { kind: value.kind, token: value.token }
    case 'before-turn':
    case 'outside-turn':
      if (Object.keys(value).some(key => key !== 'kind')) throw new Error('Unexpected anytime Turn token')
      return { kind: value.kind }
    default:
      throw new Error('Invalid anytime Turn affiliation')
  }
}

export const parseAnytimeActivation = (value: unknown): AnytimeActivation => {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !value.id
    || !('turn' in value) || Object.keys(value).some(key => key !== 'id' && key !== 'turn' && key !== 'parentId')) {
    throw new Error('Invalid anytime activation')
  }
  const turn = parseAnytimeTurnAffiliation(value.turn)
  if ('parentId' in value) {
    if (typeof value.parentId !== 'string' || !value.parentId) throw new Error('Invalid parent anytime activation')
    return { id: value.id, turn, parentId: value.parentId }
  }
  return { id: value.id, turn }
}
