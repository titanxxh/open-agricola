import type { ComplexCost, CostModifierType, GameState, PaymentResourceMap, PaymentSolution } from '../../contract/types'

export type Cost = PaymentResourceMap | ComplexCost

export type Option = PaymentSolution

export type PaymentChoice = {
  optionIndex: number
}

export type PaymentCtx = {
  actionId: string
  costType: CostModifierType | 'none'
  sourceCard?: string
  spaceId?: string
  playedCards?: string[]
}

export type PaymentExecuteResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: PaymentExecuteError }

export type PaymentExecuteError =
  | 'invalid-choice'
  | 'cannot-afford'
  | 'unknown-option'
