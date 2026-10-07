import { WorkshopGitHubApp, type WorkshopAppOptions } from '../workshop-pr/github-app'

const API = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 15_000

export type WorkshopReviewSnapshot = {
  reviewDecision: string | null
  headRefOid: string
  baseRefName: string
  state: string
  isDraft: boolean
  reviews: Array<{
    id: string
    state: string
    commitOid: string | null
    authorCanPushToRepository: boolean
  }>
}

export const isReviewTargetEligible = (
  snapshot: WorkshopReviewSnapshot,
): boolean => snapshot.state === 'OPEN'
  && !snapshot.isDraft
  && snapshot.baseRefName === 'main'

const hasBlockingChangesRequest = (
  snapshot: WorkshopReviewSnapshot,
): boolean => snapshot.reviewDecision === 'CHANGES_REQUESTED'
  || snapshot.reviews.some(review =>
    review.state === 'CHANGES_REQUESTED' && review.authorCanPushToRepository,
  )

export const githubPrStatus = (
  snapshot: WorkshopReviewSnapshot,
): 'open' | 'merged' | 'closed' => snapshot.state === 'MERGED'
  // 'merged' means "a graduation-relevant merge fact": a PR retargeted away
  // from main and merged never enters the built-in registry, so reporting it
  // as 'merged' would arm reconcilePendingMerges with a false graduation.
  ? (snapshot.baseRefName === 'main' ? 'merged' : 'closed')
  : snapshot.state === 'CLOSED'
    ? 'closed'
    : 'open'

export const breaksReviewGateWithoutApproval = (
  snapshot: WorkshopReviewSnapshot,
): boolean => snapshot.state === 'MERGED'
  // A merge into any branch other than main never reaches the built-in
  // registry, so it cannot graduate — treat it like an unmerged close.
  ? snapshot.baseRefName !== 'main'
  : !isReviewTargetEligible(snapshot)
    || hasBlockingChangesRequest(snapshot)
    || snapshot.reviewDecision === 'APPROVED'

export const findApprovedHeadReview = (
  snapshot: WorkshopReviewSnapshot,
): WorkshopReviewSnapshot['reviews'][number] | undefined =>
  (snapshot.reviewDecision === null || snapshot.reviewDecision === 'APPROVED')
  && !hasBlockingChangesRequest(snapshot)
  && isReviewTargetEligible(snapshot)
    ? snapshot.reviews.find(review =>
        review.state === 'APPROVED'
        && review.authorCanPushToRepository
        && review.commitOid === snapshot.headRefOid,
      )
    : undefined

/**
 * Delayed approval on an already-merged PR (#642): the head ref freezes at
 * merge, so the #629 SHA binding stays verifiable. Only merges into main
 * count — a PR retargeted away from main never lands in the built-in
 * registry and must not graduate.
 */
export const findApprovedMergedHeadReview = (
  snapshot: WorkshopReviewSnapshot,
): WorkshopReviewSnapshot['reviews'][number] | undefined =>
  snapshot.state === 'MERGED'
  && snapshot.baseRefName === 'main'
  && (snapshot.reviewDecision === null || snapshot.reviewDecision === 'APPROVED')
  && !hasBlockingChangesRequest(snapshot)
    ? snapshot.reviews.find(review =>
        review.state === 'APPROVED'
        && review.authorCanPushToRepository
        && review.commitOid === snapshot.headRefOid,
      )
    : undefined

type GitHubReviewProviderOptions = WorkshopAppOptions

type ReviewQueryResponse = {
  data?: {
    repository?: {
      pullRequest?: {
        reviewDecision?: string | null
        headRefOid?: string
        baseRefName?: string
        state?: string
        isDraft?: boolean
        latestOpinionatedReviews?: {
          pageInfo?: { hasNextPage: boolean }
          nodes?: Array<{
            id?: string
            state?: string
            commit?: { oid?: string } | null
            authorCanPushToRepository?: boolean
          } | null>
        }
      } | null
    } | null
  }
  errors?: unknown[]
}

const headers = (token: string): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'User-Agent': 'open-agricola-workshop-review',
  'X-GitHub-Api-Version': '2022-11-28',
})

const parseJson = async <T>(response: Response): Promise<T> => {
  try {
    return await response.json() as T
  } catch {
    return {} as T
  }
}

export class GitHubReviewProvider {
  private readonly options: GitHubReviewProviderOptions
  private readonly fetchImpl: typeof fetch
  private readonly app: WorkshopGitHubApp

  constructor(options: GitHubReviewProviderOptions) {
    this.options = options
    this.fetchImpl = options.fetchImpl ?? fetch
    this.app = new WorkshopGitHubApp(options)
  }

  static fromEnv(fetchImpl: typeof fetch = fetch): GitHubReviewProvider | null {
    const app = WorkshopGitHubApp.fromEnv(fetchImpl)
    return app ? new GitHubReviewProvider(app.options) : null
  }

  async getPullRequestSnapshot(prNumber: number): Promise<WorkshopReviewSnapshot> {
    if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
      throw new Error('invalid_pull_request_number')
    }
    const token = await this.app.token('read')
    const response = await this.request(`${API}/graphql`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        query: `query WorkshopReviewSnapshot($owner: String!, $name: String!, $number: Int!) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              reviewDecision
              headRefOid
              baseRefName
              state
              isDraft
              latestOpinionatedReviews(first: 100) {
                pageInfo { hasNextPage }
                nodes {
                  id
                  state
                  commit { oid }
                  authorCanPushToRepository
                }
              }
            }
          }
        }`,
        variables: {
          owner: this.options.repositoryOwner,
          name: this.options.repositoryName,
          number: prNumber,
        },
      }),
    })
    const body = await parseJson<ReviewQueryResponse>(response)
    const pullRequest = body.data?.repository?.pullRequest
    if (
      !response.ok
      || body.errors?.length
      || !pullRequest
      || typeof pullRequest.headRefOid !== 'string'
      || typeof pullRequest.baseRefName !== 'string'
      || typeof pullRequest.state !== 'string'
      || typeof pullRequest.isDraft !== 'boolean'
      || pullRequest.latestOpinionatedReviews?.pageInfo?.hasNextPage !== false
      || !Array.isArray(pullRequest.latestOpinionatedReviews.nodes)
    ) {
      throw new Error('github_review_snapshot_failed')
    }
    const reviews = (pullRequest.latestOpinionatedReviews?.nodes ?? []).flatMap(review =>
      review
      && typeof review.id === 'string'
      && typeof review.state === 'string'
      && typeof review.authorCanPushToRepository === 'boolean'
        ? [{
            id: review.id,
            state: review.state,
            commitOid: typeof review.commit?.oid === 'string' ? review.commit.oid : null,
            authorCanPushToRepository: review.authorCanPushToRepository,
          }]
        : [],
    )
    return {
      reviewDecision: typeof pullRequest.reviewDecision === 'string' ? pullRequest.reviewDecision : null,
      headRefOid: pullRequest.headRefOid,
      baseRefName: pullRequest.baseRefName,
      state: pullRequest.state,
      isDraft: pullRequest.isDraft,
      reviews,
    }
  }

  private request(input: string, init: RequestInit): Promise<Response> {
    return this.fetchImpl(input, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  }

}
