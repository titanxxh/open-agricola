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
 * 'merged' is not loadable yet: the merge transition does not exist until the
 * GitHub review sync (#640), and the merged-window serving rule (keep serving
 * the approved snapshot until built_in takes over) lands together with it in
 * #642 — extending this predicate ahead of that would ship untested behaviour.
 */
export const isLoadableLive = (
  row: { review_status: string; live: number },
): boolean => row.review_status === 'approved' && row.live === 1
