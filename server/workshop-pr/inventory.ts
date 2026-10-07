import type { PostgresDatabase } from '../database/postgres'
import { GitHubApiError, GitHubClient } from './github-client'
import { WorkshopGitHubApp } from './github-app'

/** Read-only cutover report. Deliberately excludes draft content, credentials and raw API responses. */
export async function workshopSubmissionInventory(db: PostgresDatabase, app: WorkshopGitHubApp | null) {
  const cards = await db.prepare(`SELECT id,card_id,github_pr_url,github_pr_status,review_version_id,
    review_commit_sha,approved_version_id,approved_commit_sha,approved_review_id,review_status,live
    FROM workshop_cards WHERE github_pr_url IS NOT NULL OR approved_review_id LIKE 'owner:%'
    ORDER BY id`).all<{
      id:string;card_id:string;github_pr_url:string|null;github_pr_status:string|null;review_version_id:string|null
      review_commit_sha:string|null;approved_version_id:string|null;approved_commit_sha:string|null;approved_review_id:string|null;review_status:string;live:number
    }>()
  const report = []
  let client: GitHubClient | undefined
  let appStatus = app ? 'configured' : 'missing_credentials'
  if (app) {
    try { client = new GitHubClient({token:await app.token('read'),upstreamOwner:app.options.repositoryOwner,upstreamRepo:app.options.repositoryName}) }
    catch { appStatus = 'installation_unavailable' }
  }
  for (const card of cards) {
    const local = {...card,syntheticApproval:card.approved_review_id?.startsWith('owner:') ?? false}
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(card.github_pr_url ?? '')
    if (!match || app && (match[1] !== app.options.repositoryOwner || match[2] !== app.options.repositoryName)) {
      report.push({...local,remoteStatus:'different_repository'}); continue
    }
    if (!client) { report.push({...local,remoteStatus:'not_checked'}); continue }
    try {
      const pr = await client.getPullRequest(Number(match[3]))
      report.push({...local,remoteStatus:pr.merged ? 'merged' : pr.state,remoteHead:pr.headSha,
        headRepository:pr.headRepository,base:pr.base,draft:pr.draft,
        headRepositoryStatus:await client.getHeadRepositoryStatus(pr.headRepository)})
    } catch (error) {
      report.push({...local,remoteStatus:error instanceof GitHubApiError && error.status === 404 ? 'missing' : 'unavailable'})
    }
  }
  return {appStatus,webhookConfigured:!!process.env.WORKSHOP_REVIEW_GITHUB_WEBHOOK_SECRET?.trim(),
    submissionEnabled:process.env.WORKSHOP_PR_ENABLED === 'true',
    permissionCheck:'Confirm Contents/Pull requests write on the installation; review tokens request read only.',cards:report}
}
