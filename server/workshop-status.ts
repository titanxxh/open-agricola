/**
 * Two-axis workshop card status (PRD #634).
 *
 * Review axis: how far the card is through the PR review gate.
 * Live axis: whether the author has toggled the approved card online.
 *
 * Hard invariant: a card may only be live while review_status is 'approved'
 * ('merged' cards keep serving their approved snapshot until the built-in
 * registry takes over — see #642).
 */
import type { WorkshopReviewStatus } from '../shared/contract/workshop'

export type ReviewStatus = WorkshopReviewStatus

export const REVIEW_STATUSES: readonly ReviewStatus[] = [
  'unsubmitted',
  'in_review',
  'approved',
  'stale',
  'merged',
]

export const isReviewStatus = (value: unknown): value is ReviewStatus =>
  typeof value === 'string' && (REVIEW_STATUSES as readonly string[]).includes(value)

/** Only an approved card may be toggled live by its author. */
export const canGoLive = (reviewStatus: string): boolean => reviewStatus === 'approved'

/**
 * Whether a card row may be loaded into a real room (or shown in the public
 * gallery). Rooms only ever run the approved snapshot of a live card.
 *
 * Merged window (#642): a live card that graduated into the main repository
 * keeps serving its approved snapshot until a release containing it ships —
 * detected at startup via built_in, after which the built-in registry takes
 * over and the workshop snapshot retires.
 */
export const isLoadableLive = (
  row: { review_status: string; live: number; built_in?: number },
): boolean => row.live === 1 && (
  row.review_status === 'approved'
  || (row.review_status === 'merged' && row.built_in === 0)
)
