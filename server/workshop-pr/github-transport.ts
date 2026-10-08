import { githubResponseShapes, type GitHubOperation } from './github-response-shapes'
export type { GitHubOperation } from './github-response-shapes'

/** Only allowlisted metadata may leave the transport; never response bodies or credentials. */
export type GitHubDiagnostic = {
  kind: 'http' | 'api' | 'invalid_response' | 'network' | 'timeout'
  operation: GitHubOperation
  httpStatus?: number
  requestId?: string
  transportCode?: string
}

export class GitHubApiError extends Error {
  public code: string
  public status?: number
  public retryAfter?: number
  public diagnostic?: GitHubDiagnostic
  constructor(
    message: string,
    code: string,
    status?: number,
    retryAfter?: number,
    diagnostic?: GitHubDiagnostic,
  ) {
    super(message)
    this.name = 'GitHubApiError'
    this.code = code
    this.status = status
    this.retryAfter = retryAfter
    this.diagnostic = diagnostic
  }
}

function transportError(error: unknown, diagnostic: GitHubDiagnostic): GitHubApiError {
  const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
  const cause = error instanceof Error ? error.cause : undefined
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined
  const allowedCodes = ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']
  return new GitHubApiError('GitHub request failed', timeout ? 'github_timeout' : 'github_network_error', 503, undefined, {
    ...diagnostic, kind: timeout ? 'timeout' : 'network',
    ...(typeof code === 'string' && allowedCodes.includes(code) ? {transportCode:code} : {}),
  })
}

/** HTTP failures are inspected before JSON; successful malformed responses remain retryable. */
export class GitHubResponse {
  readonly diagnostic: GitHubDiagnostic
  private readonly response: Response
  constructor(response: Response, operation: GitHubOperation) {
    this.response = response
    const requestId = response.headers.get('x-github-request-id') ?? ''
    this.diagnostic = {
      kind: response.ok ? 'api' : 'http', operation, httpStatus:response.status,
      ...(/^[A-Fa-f0-9:]{1,128}$/.test(requestId) ? {requestId} : {}),
    }
  }
  get ok(): boolean { return this.response.ok }
  get status(): number { return this.response.status }

  error(message: string, code: string, status = this.status, retryAfter?: number): GitHubApiError {
    return new GitHubApiError(message, code, status, retryAfter, this.diagnostic)
  }

  async json(): Promise<unknown> {
    if (!this.ok) throw this.error('GitHub request failed', 'github_http_error')
    let body: unknown
    try { body = await this.response.json() }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw transportError(error, this.diagnostic)
      throw this.invalidResponse()
    }
    if (!githubResponseShapes[this.diagnostic.operation](body)) throw this.invalidResponse()
    return body
  }

  invalidResponse(): GitHubApiError {
    return new GitHubApiError('GitHub returned an invalid response', 'github_invalid_response', 503, undefined,
      {...this.diagnostic, kind:'invalid_response'})
  }
}

/** One remote request only: the durable submission state machine owns all write retries. */
export async function requestGitHub(
  operation: GitHubOperation, url: string, init: RequestInit,
  fetchImpl: typeof fetch = fetch, now = Date.now(),
): Promise<GitHubResponse> {
  let raw: Response
  try {
    const timeout = AbortSignal.timeout(15_000)
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    signal.throwIfAborted()
    raw = await fetchImpl(url, {...init, signal})
  }
  catch (error) { throw transportError(error, {kind:'network',operation}) }
  const response = new GitHubResponse(raw, operation)
  if (raw.status === 429 || raw.status === 403 && (raw.headers.has('retry-after') || raw.headers.get('x-ratelimit-remaining') === '0')) {
    const hint = raw.headers.get('retry-after')
    const delay = hint && /^\d+$/.test(hint) ? Number(hint) : hint ? Math.ceil((Date.parse(hint)-now)/1000) : 0
    const reset = Number(raw.headers.get('x-ratelimit-reset') ?? 0) - now/1000
    throw response.error('GitHub rate limited', 'github_rate_limited', 429, Math.max(60,delay || 0,reset))
  }
  return response
}
