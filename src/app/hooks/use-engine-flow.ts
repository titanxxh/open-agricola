import type { ActionChoiceOption } from '../../../shared/game/types'

export type EngineProgress =
  | { type: 'choice'; choice: ActionChoiceOption[]; promptKey?: string }
  | { type: 'done' }
  | { type: 'fail'; logKey: string }
  | { type: 'reorg'; playerIndex: number; spaceId: string }
