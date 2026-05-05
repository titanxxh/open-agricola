import type { GameState } from '../game/types.ts'
import type {
  PlayerScoreSummary,
  ScoreCategoryResult,
  ScoreEntry,
} from '../logic/scoring.ts'
import { computeScores } from '../logic/scoring.ts'
import type { SolverInput, SolverResult } from '../logic/scoring-bonus-solver.ts'
import { solveBonusScoring } from '../logic/scoring-bonus-solver.ts'

export type { PlayerScoreSummary, ScoreCategoryResult, ScoreEntry }

/** Compute full per-player score summaries (one entry per player). */
function computeAll(state: GameState): PlayerScoreSummary[] {
  return computeScores(state)
}

/** Solve cross-player bonus scoring (which player wins each comparison). */
function solveBonus(input: SolverInput): SolverResult {
  return solveBonusScoring(input)
}

/** Single player's score breakdown by index. Throws on out-of-range. */
function breakdown(state: GameState, idx: number): PlayerScoreSummary {
  const all = computeScores(state)
  const entry = all[idx]
  if (!entry) throw new Error(`Scoring.breakdown: no player at index ${idx}`)
  return entry
}

/** Convenience: total score for a single player by index. */
function totalFor(state: GameState, idx: number): number {
  return breakdown(state, idx).total
}

/**
 * Cross-player scoring views. Exposed as a const namespace object (NOT a
 * `namespace` block — `erasableSyntaxOnly` forbids those). Top-level (NOT
 * under PlayerBoard) because scoring is inherently a multi-player query.
 * PR1 wrap-only over `logic/scoring*.ts`.
 */
export const Scoring = {
  computeAll,
  solveBonus,
  breakdown,
  totalFor,
} as const
