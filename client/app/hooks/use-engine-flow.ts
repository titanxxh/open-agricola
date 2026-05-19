import type { ActionChoiceOption } from '../../../shared/contract/types'

export type EngineProgress =
  | { type: 'choice'; choice: ActionChoiceOption[]; promptKey?: string }
  | { type: 'done' }
  | { type: 'fail'; errorKey: string }
  | { type: 'reorg'; playerIndex: number; spaceId: string }
