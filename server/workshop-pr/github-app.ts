import { GitHubApiError } from './github-client'
import { createGitHubAppJwt } from '../bug-report/github-issue-client'

export type WorkshopAppOptions = {
  appId: string
  privateKey: string
  installationId: string
  repositoryOwner: string
  repositoryName: string
  fetchImpl?: typeof fetch
  now?: () => number
}

/** One installed Workshop identity; never share a write token with a read caller. */
export class WorkshopGitHubApp {
  private readonly tokens = new Map<'read' | 'write', { token: string; expiresAt: number }>()
  readonly options: WorkshopAppOptions
  constructor(options: WorkshopAppOptions) { this.options = options }

  static fromEnv(fetchImpl: typeof fetch = fetch): WorkshopGitHubApp | null {
    // Keep the installed Review App's credential names: the same App gains submission permissions.
    const options = {
      appId: process.env.WORKSHOP_REVIEW_GITHUB_APP_ID?.trim() ?? '',
      privateKey: process.env.WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY?.replaceAll('\\n', '\n').trim() ?? '',
      installationId: process.env.WORKSHOP_REVIEW_GITHUB_INSTALLATION_ID?.trim() ?? '',
      repositoryOwner: process.env.GITHUB_UPSTREAM_OWNER?.trim() || 'titanxxh',
      repositoryName: process.env.GITHUB_UPSTREAM_REPO?.trim() || 'open-agricola',
      fetchImpl,
    }
    return options.appId && options.privateKey && options.installationId ? new WorkshopGitHubApp(options) : null
  }

  invalidate(): void { this.tokens.clear() }

  async token(permission: 'read' | 'write'): Promise<string> {
    const now = this.options.now?.() ?? Date.now()
    const cached = this.tokens.get(permission)
    if (cached && cached.expiresAt - 60_000 > now) return cached.token
    const jwt = createGitHubAppJwt(this.options.appId, this.options.privateKey, now)
    const response = await (this.options.fetchImpl ?? fetch)(
      `https://api.github.com/app/installations/${encodeURIComponent(this.options.installationId)}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json', Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          repositories: [this.options.repositoryName],
          permissions: { contents: permission, pull_requests: permission },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    const body = await response.json() as { token?: string; expires_at?: string }
    const expiresAt = Date.parse(body.expires_at ?? '')
    if (!response.ok || !body.token || !Number.isFinite(expiresAt)) {
      this.invalidate()
      throw new GitHubApiError('Workshop App unavailable','workshop_app_unavailable',response.status === 200 ? 503 : response.status)
    }
    this.tokens.set(permission, { token: body.token, expiresAt })
    return body.token
  }
}
