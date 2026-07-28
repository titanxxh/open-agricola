import {
  createHash,
  createHmac,
  sign,
  timingSafeEqual,
} from 'node:crypto'

const API = 'https://api.github.com'
const OWNER = 'titanxxh'
const REPOSITORY = 'open-agricola-issues'
const GITHUB_REQUEST_TIMEOUT_MS = 15_000

export type GitHubIssue = {
  number: number
  url: string
}

export type GitHubFailure = {
  ok: false
  kind: 'auth' | 'permission' | 'rate_limit' | 'terminal' | 'uncertain'
  code: string
  status?: number
  retryAt?: number
  requestId?: string
}

export type GitHubIssueResult =
  | ({ ok: true } & GitHubIssue & { requestId?: string })
  | GitHubFailure

export type GitHubOperationResult =
  | { ok: true }
  | GitHubFailure

export type GitHubUserTokens = {
  accessToken: string
  accessTokenExpiresAt: number
  refreshToken?: string
  refreshTokenExpiresAt?: number
}

type GitHubIssueClientOptions = {
  appId: string
  clientId: string
  clientSecret: string
  privateKey: string
  installationId: string
  repositoryId: string
  fetchImpl?: typeof fetch
  now?: () => number
}

type IssueBody = {
  title: string
  body: string
}

type TokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
  error?: string
}

type InstallationTokenResponse = {
  token?: string
  expires_at?: string
}

type IssueResponse = {
  number?: number
  html_url?: string
  title?: string
  body?: string | null
  created_at?: string
  performed_via_github_app?: {
    id?: number | string
  } | null
}

const apiHeaders = (token: string): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'open-agricola-bug-reporter',
  'X-GitHub-Api-Version': '2022-11-28',
})

const parseJson = async <T>(response: Response): Promise<T> => {
  try {
    return await response.json() as T
  } catch {
    return {} as T
  }
}

const retryAt = (response: Response, now: number): number | undefined => {
  const rawRetryAfter = response.headers.get('retry-after')
  if (rawRetryAfter) {
    const seconds = Number(rawRetryAfter)
    if (Number.isFinite(seconds)) return now + Math.max(0, seconds) * 1000
    const date = Date.parse(rawRetryAfter)
    if (Number.isFinite(date)) return date
  }
  const reset = Number(response.headers.get('x-ratelimit-reset'))
  return Number.isFinite(reset) && reset > 0 ? reset * 1000 : undefined
}

const failureFromResponse = (
  response: Response,
  now: number,
): GitHubFailure => {
  const requestId = response.headers.get('x-github-request-id') ?? undefined
  const shared = {
    ok: false as const,
    status: response.status,
    ...(requestId ? { requestId } : {}),
  }
  if (response.status === 401) {
    return { ...shared, kind: 'auth', code: 'github_auth_invalid' }
  }
  const limitedUntil = retryAt(response, now)
  if (
    response.status === 429
    || (response.status === 403 && (
      limitedUntil !== undefined
      || response.headers.get('x-ratelimit-remaining') === '0'
    ))
  ) {
    return {
      ...shared,
      kind: 'rate_limit',
      code: 'github_rate_limited',
      ...(limitedUntil === undefined ? {} : { retryAt: limitedUntil }),
    }
  }
  if (response.status === 403) {
    return { ...shared, kind: 'permission', code: 'github_permission_denied' }
  }
  if (response.status >= 500) {
    return { ...shared, kind: 'uncertain', code: 'github_result_uncertain' }
  }
  return {
    ...shared,
    kind: 'terminal',
    code: response.status === 410
      ? 'github_gone'
      : response.status === 422
        ? 'github_validation_failed'
        : 'github_request_failed',
  }
}

export class GitHubIssueClient {
  private readonly options: GitHubIssueClientOptions
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private installationTokenCache: {
    token: string
    expiresAt: number
  } | null = null

  constructor(options: GitHubIssueClientOptions) {
    this.options = options
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? Date.now
  }

  private request(
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    return this.fetchImpl(input, {
      ...init,
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    })
  }

  static fromEnv(fetchImpl: typeof fetch = fetch): GitHubIssueClient | null {
    const options = {
      appId: process.env.BUG_REPORT_GITHUB_APP_ID?.trim() ?? '',
      clientId: process.env.BUG_REPORT_GITHUB_CLIENT_ID?.trim() ?? '',
      clientSecret: process.env.BUG_REPORT_GITHUB_CLIENT_SECRET?.trim() ?? '',
      privateKey: process.env.BUG_REPORT_GITHUB_PRIVATE_KEY?.replaceAll('\\n', '\n').trim() ?? '',
      installationId: process.env.BUG_REPORT_GITHUB_INSTALLATION_ID?.trim() ?? '',
      repositoryId: process.env.BUG_REPORT_GITHUB_REPOSITORY_ID?.trim() ?? '',
      fetchImpl,
    }
    return Object.values(options).every((value) =>
      typeof value === 'function' || value.length > 0
    )
      ? new GitHubIssueClient(options)
      : null
  }

  authorizationUrl(input: {
    state: string
    codeChallenge: string
    redirectUri: string
  }): string {
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', this.options.clientId)
    url.searchParams.set('redirect_uri', input.redirectUri)
    url.searchParams.set('state', input.state)
    url.searchParams.set('code_challenge', input.codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
  }

  async exchangeCode(
    code: string,
    verifier: string,
    redirectUri: string,
  ): Promise<GitHubUserTokens> {
    return this.exchangeToken({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    })
  }

  async refreshUserToken(refreshToken: string): Promise<GitHubUserTokens> {
    return this.exchangeToken({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
  }

  async githubUserId(accessToken: string): Promise<string> {
    const response = await this.request(`${API}/user`, {
      headers: apiHeaders(accessToken),
    })
    const body = await parseJson<{ id?: number | string }>(response)
    if (!response.ok || body.id === undefined) {
      throw new Error('github_user_lookup_failed')
    }
    return String(body.id)
  }

  async createIssue(
    identity: 'github_user' | 'hosted',
    issue: IssueBody,
    userAccessToken?: string,
  ): Promise<GitHubIssueResult> {
    const authorization = await this.issueToken(identity, userAccessToken)
    if (!authorization.ok) return authorization
    let response: Response
    try {
      response = await this.request(
        `${API}/repos/${OWNER}/${REPOSITORY}/issues`,
        {
          method: 'POST',
          headers: {
            ...apiHeaders(authorization.token),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: issue.title,
            body: issue.body,
            labels: ['needs-triage'],
          }),
        },
      )
    } catch {
      return {
        ok: false,
        kind: 'uncertain',
        code: 'github_result_uncertain',
      }
    }
    if (!response.ok) return failureFromResponse(response, this.now())
    const body = await parseJson<IssueResponse>(response)
    if (!Number.isSafeInteger(body.number) || typeof body.html_url !== 'string') {
      return {
        ok: false,
        kind: 'uncertain',
        code: 'github_result_uncertain',
        requestId: response.headers.get('x-github-request-id') ?? undefined,
      }
    }
    return {
      ok: true,
      number: body.number!,
      url: body.html_url,
      requestId: response.headers.get('x-github-request-id') ?? undefined,
    }
  }

  async findIssueByMarker(
    identity: 'github_user' | 'hosted',
    marker: string,
    since: number,
    userAccessToken?: string,
  ): Promise<GitHubIssueResult | { ok: true; found: false }> {
    const authorization = await this.issueToken(identity, userAccessToken)
    if (!authorization.ok) return authorization
    const sinceSecond = Math.floor(since / 1000) * 1000
    for (let page = 1; ; page += 1) {
      let response: Response
      try {
        const url = new URL(`${API}/repos/${OWNER}/${REPOSITORY}/issues`)
        url.searchParams.set('state', 'all')
        url.searchParams.set('sort', 'created')
        url.searchParams.set('direction', 'desc')
        url.searchParams.set('per_page', '100')
        url.searchParams.set('page', String(page))
        response = await this.request(url, {
          headers: apiHeaders(authorization.token),
        })
      } catch {
        return {
          ok: false,
          kind: 'uncertain',
          code: 'github_reconciliation_uncertain',
        }
      }
      if (!response.ok) return failureFromResponse(response, this.now())
      const issues = await parseJson<IssueResponse[]>(response)
      if (!Array.isArray(issues)) {
        return {
          ok: false,
          kind: 'uncertain',
          code: 'github_reconciliation_uncertain',
        }
      }
      const match = issues.find((issue) => (
        typeof issue.body === 'string'
        && issue.body.endsWith(`\n\n${marker}`)
        && issue.body.indexOf(marker) === issue.body.lastIndexOf(marker)
        && issue.body.match(/<!-- open-agricola-report:[^>\r\n]+ -->/g)?.length === 1
        && String(issue.performed_via_github_app?.id) === this.options.appId
        && Date.parse(issue.created_at ?? '') >= sinceSecond
      ))
      if (
        match
        && Number.isSafeInteger(match.number)
        && typeof match.html_url === 'string'
      ) {
        return {
          ok: true,
          number: match.number!,
          url: match.html_url,
          requestId: response.headers.get('x-github-request-id') ?? undefined,
        }
      }
      if (issues.length < 100) return { ok: true, found: false }
      const oldest = Date.parse(issues.at(-1)?.created_at ?? '')
      if (!Number.isFinite(oldest)) {
        return {
          ok: false,
          kind: 'uncertain',
          code: 'github_reconciliation_uncertain',
        }
      }
      if (oldest < sinceSecond) {
        return { ok: true, found: false }
      }
    }
  }

  async revokeUserGrant(accessToken: string): Promise<GitHubOperationResult> {
    let response: Response
    try {
      response = await this.request(
        `${API}/applications/${encodeURIComponent(this.options.clientId)}/grant`,
        {
          method: 'DELETE',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Basic ${Buffer.from(
              `${this.options.clientId}:${this.options.clientSecret}`,
            ).toString('base64')}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ access_token: accessToken }),
        },
      )
    } catch {
      return {
        ok: false,
        kind: 'uncertain',
        code: 'github_revocation_uncertain',
      }
    }
    if (response.ok || response.status === 404 || response.status === 422) {
      return { ok: true }
    }
    return failureFromResponse(response, this.now())
  }

  async anonymizeIssue(
    issueNumber: number,
    reporterUserId: string,
  ): Promise<GitHubOperationResult> {
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
      return {
        ok: false,
        kind: 'terminal',
        code: 'github_issue_reference_invalid',
      }
    }
    const authorization = await this.installationToken()
    if (!authorization.ok) return authorization
    const issueUrl = `${API}/repos/${OWNER}/${REPOSITORY}/issues/${issueNumber}`
    let response: Response
    try {
      response = await this.request(issueUrl, {
        headers: apiHeaders(authorization.token),
      })
    } catch {
      return {
        ok: false,
        kind: 'uncertain',
        code: 'github_anonymization_uncertain',
      }
    }
    if (!response.ok) return failureFromResponse(response, this.now())
    const issue = await parseJson<IssueResponse>(response)
    if (
      typeof issue.title !== 'string'
      || (issue.body !== null && typeof issue.body !== 'string')
    ) {
      return {
        ok: false,
        kind: 'terminal',
        code: 'github_anonymization_incomplete',
      }
    }
    const publicReporterId = reporterUserId.replaceAll('`', "'")
    if (
      !issue.title.includes(publicReporterId)
      && !issue.body?.includes(publicReporterId)
    ) return { ok: true }
    const reporterLine = `- Reporter site ID: \`${publicReporterId}\``
    const anonymizedTitle = issue.title.replaceAll(publicReporterId, '')
    const anonymizedBody = issue.body?.replaceAll(
      reporterLine,
      '- Reporter site ID: `deleted reporter`',
    ).replaceAll(publicReporterId, '') ?? null
    if (
      anonymizedTitle.includes(publicReporterId)
      || anonymizedBody?.includes(publicReporterId)
    ) {
      return {
        ok: false,
        kind: 'terminal',
        code: 'github_anonymization_incomplete',
      }
    }
    try {
      response = await this.request(issueUrl, {
        method: 'PATCH',
        headers: {
          ...apiHeaders(authorization.token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: anonymizedTitle,
          body: anonymizedBody,
        }),
      })
    } catch {
      return {
        ok: false,
        kind: 'uncertain',
        code: 'github_anonymization_uncertain',
      }
    }
    if (!response.ok) return failureFromResponse(response, this.now())
    const updated = await parseJson<IssueResponse>(response)
    return typeof updated.title === 'string'
      && !updated.title.includes(publicReporterId)
      && (
        updated.body === null
        || (
          typeof updated.body === 'string'
          && !updated.body.includes(publicReporterId)
        )
      )
      ? { ok: true }
      : {
          ok: false,
          kind: 'terminal',
          code: 'github_anonymization_incomplete',
        }
  }

  private async exchangeToken(fields: Record<string, string>): Promise<GitHubUserTokens> {
    const response = await this.request('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields),
    })
    const body = await parseJson<TokenResponse>(response)
    if (
      !response.ok
      || body.error
      || !body.access_token
      || !Number.isFinite(body.expires_in)
    ) {
      throw new Error('github_token_exchange_failed')
    }
    const now = this.now()
    return {
      accessToken: body.access_token,
      accessTokenExpiresAt: now + body.expires_in! * 1000,
      ...(body.refresh_token
        ? {
            refreshToken: body.refresh_token,
            refreshTokenExpiresAt: now + (body.refresh_token_expires_in ?? 0) * 1000,
          }
        : {}),
    }
  }

  private appJwt(): string {
    const now = Math.floor(this.now() / 1000)
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString('base64url')
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      iat: now - 60,
      exp: now + 540,
      iss: this.options.appId,
    })}`
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(unsigned),
      this.options.privateKey,
    ).toString('base64url')
    return `${unsigned}.${signature}`
  }

  private async issueToken(
    identity: 'github_user' | 'hosted',
    userAccessToken?: string,
  ): Promise<{ ok: true; token: string } | GitHubFailure> {
    if (identity === 'hosted') return this.installationToken()
    return userAccessToken
      ? { ok: true, token: userAccessToken }
      : { ok: false, kind: 'auth', code: 'github_auth_invalid' }
  }

  private async installationToken(): Promise<
    { ok: true; token: string } | GitHubFailure
  > {
    const now = this.now()
    if (
      this.installationTokenCache
      && this.installationTokenCache.expiresAt - 60_000 > now
    ) {
      return { ok: true, token: this.installationTokenCache.token }
    }
    const repositoryId = Number(this.options.repositoryId)
    if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
      return {
        ok: false,
        kind: 'terminal',
        code: 'github_app_configuration_invalid',
      }
    }
    let jwt: string
    try {
      jwt = this.appJwt()
    } catch {
      return {
        ok: false,
        kind: 'terminal',
        code: 'github_app_configuration_invalid',
      }
    }
    let response: Response
    try {
      response = await this.request(
        `${API}/app/installations/${encodeURIComponent(this.options.installationId)}/access_tokens`,
        {
          method: 'POST',
          headers: {
            ...apiHeaders(jwt),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            repository_ids: [repositoryId],
            permissions: { issues: 'write' },
          }),
        },
      )
    } catch {
      return {
        ok: false,
        kind: 'uncertain',
        code: 'github_app_token_uncertain',
      }
    }
    if (!response.ok) return failureFromResponse(response, now)
    const body = await parseJson<InstallationTokenResponse>(response)
    const expiresAt = Date.parse(body.expires_at ?? '')
    if (!body.token || !Number.isFinite(expiresAt)) {
      return {
        ok: false,
        kind: 'terminal',
        code: 'github_app_configuration_invalid',
      }
    }
    this.installationTokenCache = { token: body.token, expiresAt }
    return { ok: true, token: body.token }
  }
}

export const createCodeChallenge = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url')

export const verifyGitHubWebhook = (
  secret: string,
  body: Buffer,
  signature: string | undefined,
): boolean => {
  if (!secret || !signature?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(body).digest()
  let actual: Buffer
  try {
    actual = Buffer.from(signature.slice(7), 'hex')
  } catch {
    return false
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
