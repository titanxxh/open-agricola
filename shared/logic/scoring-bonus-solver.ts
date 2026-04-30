import type { GameState, PlayerState, Resource } from '../game/types'
import type {
  BonusScoringContext,
  BonusScoreHandler,
  CostedBonusHandler,
} from '../cards/card-effects'

export type SolverInput = {
  state: GameState
  player: PlayerState
  ctx: BonusScoringContext
  freeHandlers: { cardId: string; handler: BonusScoreHandler }[]
  costedHandlers: { cardId: string; handler: CostedBonusHandler }[]
}

export type SolverEntry = {
  cardId: string
  score: number
  cost: Partial<Resource>
}

export type SolverResult = {
  entries: SolverEntry[]
  totalScore: number
  totalCost: Partial<Resource>
}

export function solveBonusScoring(_input: SolverInput): SolverResult {
  // Stub — replaced in Task 3
  return { entries: [], totalScore: 0, totalCost: {} }
}
