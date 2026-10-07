import type { PostgresDatabase } from '../database/postgres'
import { approveReviewedVersion, invalidateReviewedCard, markCardMerged } from '../workshop-drafts'
import { breaksReviewGateWithoutApproval, findApprovedHeadReview, findApprovedMergedHeadReview, githubPrStatus, type WorkshopReviewSnapshot } from './github-review-provider'

export type ReviewProvider = {
  getPullRequestSnapshot(prNumber: number): Promise<WorkshopReviewSnapshot>
}

type ReviewBinding = {
  id: string
  revision: number
  approvedCommitSha: string | null
  approvedVersionId: string | null
  reviewCommitSha: string | null
  reviewVersionId: string | null
  updatedAt: number
}

export const loadReviewBinding = async (
  db: PostgresDatabase,
  cardId: string,
  prUrl: string,
): Promise<Awaited<ReviewBinding | undefined>> => (await db.prepare(`
  SELECT id,
         draft_revision AS revision,
         approved_commit_sha AS "approvedCommitSha",
         approved_version_id AS "approvedVersionId",
         review_commit_sha AS "reviewCommitSha",
         review_version_id AS "reviewVersionId",
         updated_at AS "updatedAt"
  FROM workshop_cards
  WHERE id = ? AND github_pr_url = ?
`).get(cardId, prUrl)) as ReviewBinding | undefined

export const reconcileReviewSnapshot = async (
  db: PostgresDatabase,
  prUrl: string,
  snapshot: WorkshopReviewSnapshot,
  expectedBinding: ReviewBinding,
): Promise<Awaited<number>> => {
  if (snapshot.headRefOid !== expectedBinding.reviewCommitSha) {
    return (await invalidateReviewedCard(db, {
      prUrl,
      prStatus: githubPrStatus(snapshot),
      expectedBinding,
    }))
  }
  const approvedReview = findApprovedHeadReview(snapshot)
    ?? findApprovedMergedHeadReview(snapshot)
  if (approvedReview) {
    const approved = (await approveReviewedVersion(db, {
      prUrl,
      commitSha: snapshot.headRefOid,
      reviewId: approvedReview.id,
      expectedBinding,
    }))
    // Both the approval and merge webhooks may have been missed: the snapshot
    // already reads MERGED. Graduate right here — approveReviewedVersion just
    // reset github_pr_status to 'open', so reconcilePendingMerges would never
    // see this row as pending.
    if (approved > 0 && snapshot.state === 'MERGED') {
      ;(await markCardMerged(db, { prUrl }))
    }
    return approved
  }
  return expectedBinding.approvedVersionId !== null
    || breaksReviewGateWithoutApproval(snapshot)
    ? (await invalidateReviewedCard(db, {
        prUrl,
        prStatus: githubPrStatus(snapshot),
        expectedBinding,
      }))
    : 0
}

