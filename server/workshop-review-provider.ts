/**
 * Review-decision provider seam (PRD #634 §7, #638).
 *
 * publish() re-verifies the atomic snapshot rule at the moment the card goes
 * live: the approving review's commit, the PR head and the platform-pinned
 * content must agree (#629). Where that data comes from is provider-specific:
 * the GitHub GraphQL implementation arrives with the review sync (#640);
 * tests inject deterministic providers.
 *
 * Without a provider (production until #640) publish falls back to the local
 * state check only — harmless because 'approved' itself is unreachable until
 * the sync exists.
 */
export type ReviewSnapshot = {
  /** GitHub-side aggregated decision for the card's review PR. */
  decision: 'approved' | 'changes_requested' | 'review_required' | 'unknown'
  /** Commit oid the approving review is bound to (null when none). */
  approvedCommitSha: string | null
  /** Current PR head oid (null when the PR cannot be read). */
  headCommitSha: string | null
}

export type ReviewDecisionProvider = {
  getSnapshot(input: { cardDbId: string; prUrl: string | null }): ReviewSnapshot
}

let provider: ReviewDecisionProvider | null = null

export const setReviewDecisionProvider = (next: ReviewDecisionProvider | null): void => {
  provider = next
}

export const getReviewDecisionProvider = (): ReviewDecisionProvider | null => provider
