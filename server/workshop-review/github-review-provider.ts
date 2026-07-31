import { createGitHubAppJwt } from '../bug-report/github-issue-client.ts'

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

export const breaksReviewGateWithoutApproval = (
  snapshot: WorkshopReviewSnapshot,
): boolean => snapshot.state !== 'MERGED'
  && (!isReviewTargetEligible(snapshot)
    || snapshot.reviewDecision === 'CHANGES_REQUESTED'
    || snapshot.reviewDecision === 'APPROVED')

export const findApprovedHeadReview = (
  snapshot: WorkshopReviewSnapshot,
): WorkshopReviewSnapshot['reviews'][number] | undefined =>
  snapshot.reviewDecision === 'APPROVED' && isReviewTargetEligible(snapshot)
    ? snapshot.reviews.find(review =>
        review.state === 'APPROVED'
        && review.authorCanPushToRepository
        && review.commitOid === snapshot.headRefOid,
      )
    : undefined

type GitHubReviewProviderOptions = {
  appId: string
  privateKey: string
  installationId: string
  repositoryOwner: string
  repositoryName: string
  fetchImpl?: typeof fetch
  now?: () => number
}

type InstallationTokenResponse = {
  token?: string
  expires_at?: string
}

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
  private readonly now: () => number
  private tokenCache: { token: string; expiresAt: number } | null = null

  constructor(options: GitHubReviewProviderOptions) {
    this.options = options
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? Date.now
  }

  static fromEnv(fetchImpl: typeof fetch = fetch): GitHubReviewProvider | null {
    const options = {
      appId: process.env.WORKSHOP_REVIEW_GITHUB_APP_ID?.trim() ?? '',
      privateKey: process.env.WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY
        ?.replaceAll('\\n', '\n')
        .trim() ?? '',
      installationId: process.env.WORKSHOP_REVIEW_GITHUB_INSTALLATION_ID?.trim() ?? '',
      repositoryOwner: process.env.GITHUB_UPSTREAM_OWNER?.trim() || 'titanxxh',
      repositoryName: process.env.GITHUB_UPSTREAM_REPO?.trim() || 'open-agricola',
      fetchImpl,
    }
    return options.appId && options.privateKey && options.installationId
      ? new GitHubReviewProvider(options)
      : null
  }

  async getPullRequestSnapshot(prNumber: number): Promise<WorkshopReviewSnapshot> {
    if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
      throw new Error('invalid_pull_request_number')
    }
    const token = await this.installationToken()
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
      reviewDecision: typeof pullRequest.reviewDecision === 'string'
        ? pullRequest.reviewDecision
        : null,
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

  private async installationToken(): Promise<string> {
    const now = this.now()
    if (this.tokenCache && this.tokenCache.expiresAt - 60_000 > now) {
      return this.tokenCache.token
    }
    const jwt = createGitHubAppJwt(
      this.options.appId,
      this.options.privateKey,
      now,
    )
    const response = await this.request(
      `${API}/app/installations/${encodeURIComponent(this.options.installationId)}/access_tokens`,
      {
        method: 'POST',
        headers: headers(jwt),
        body: JSON.stringify({ permissions: { pull_requests: 'read' } }),
      },
    )
    const body = await parseJson<InstallationTokenResponse>(response)
    const expiresAt = Date.parse(body.expires_at ?? '')
    if (!response.ok || !body.token || !Number.isFinite(expiresAt)) {
      throw new Error('github_installation_token_failed')
    }
    this.tokenCache = { token: body.token, expiresAt }
    return body.token
  }
}
