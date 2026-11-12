import { isCommitSha, type FixPullRequestInput, type VerifiedFixPullRequest } from '../../shared/contract/bug-report-feedback'
import { BUG_REPORT_GITHUB_REPOSITORY } from './github-issue-client'

const repository = BUG_REPORT_GITHUB_REPOSITORY
const url = (number: number) => `https://github.com/${repository}/pull/${number}`
function mergedPull(value: unknown, number: number): string {
  if (!value || typeof value !== 'object'
    || !('number' in value) || value.number !== number
    || !('merged_at' in value) || typeof value.merged_at !== 'string' || !Number.isFinite(Date.parse(value.merged_at))
    || !('merge_commit_sha' in value) || !isCommitSha(value.merge_commit_sha)
    || !('html_url' in value) || value.html_url !== url(number)
    || !('base' in value) || !value.base || typeof value.base !== 'object'
    || !('ref' in value.base) || value.base.ref !== 'main'
    || !('repo' in value.base) || !value.base.repo || typeof value.base.repo !== 'object'
    || !('full_name' in value.base.repo) || value.base.repo.full_name !== repository) throw new Error('fix_evidence_conflict')
  return value.merge_commit_sha
}

/** Public repository reads never use the Issue Submission App or owner CLI. */
export class GitHubFixVerifier {
  private readonly fetchImpl: typeof fetch
  constructor(fetchImpl: typeof fetch = fetch) { this.fetchImpl = fetchImpl }

  private async read(path: string): Promise<unknown> {
    const response = await this.fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'open-agricola-feedback', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(15000), redirect: 'error',
    })
    if (!response.ok || Number(response.headers.get('content-length')) > 2_000_000) throw new Error('fix_evidence_unavailable')
    const text = await response.text()
    if (text.length > 2_000_000) throw new Error('fix_evidence_unavailable')
    return JSON.parse(text)
  }

  async verify(input: FixPullRequestInput[]): Promise<VerifiedFixPullRequest[]> {
    const verified: VerifiedFixPullRequest[] = []
    for (const pr of input) {
      const pull: unknown = await this.read(`pulls/${pr.number}`)
      if (!pull || typeof pull !== 'object' || !('merged' in pull) || pull.merged !== true) throw new Error('fix_evidence_conflict')
      const mergeCommit = mergedPull(pull, pr.number)
      for (const commit of pr.requiredCommits) {
        const commitRecord = await this.read(`commits/${commit}`)
        if (!commitRecord || typeof commitRecord !== 'object' || !('sha' in commitRecord) || commitRecord.sha !== commit) throw new Error('fix_evidence_conflict')
        const associated = await this.read(`commits/${commit}/pulls?per_page=100`)
        if (!Array.isArray(associated) || !associated.some((entry: unknown) => {
          try { return mergedPull(entry, pr.number) === mergeCommit } catch { return false }
        })) throw new Error('fix_evidence_conflict')
        if (commit !== mergeCommit) {
          const comparison = await this.read(`compare/${commit}...${mergeCommit}`)
          if (!comparison || typeof comparison !== 'object' || !('status' in comparison) || comparison.status !== 'ahead'
            || !('merge_base_commit' in comparison) || !comparison.merge_base_commit || typeof comparison.merge_base_commit !== 'object'
            || !('sha' in comparison.merge_base_commit) || comparison.merge_base_commit.sha !== commit) throw new Error('fix_evidence_conflict')
        }
      }
      verified.push({ ...pr, url: url(pr.number), mergeCommit })
    }
    return verified
  }
}
