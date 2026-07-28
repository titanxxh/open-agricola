import {
  createHmac,
  generateKeyPairSync,
} from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createCodeChallenge,
  GitHubIssueClient,
  verifyGitHubWebhook,
} from '../bug-report/github-issue-client.ts'

const NOW = 1_700_000_000_000
const { privateKey: appPrivateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})

const response = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...headers },
})

const client = (fetchImpl: typeof fetch): GitHubIssueClient =>
  new GitHubIssueClient({
    appId: '1',
    clientId: 'client',
    clientSecret: 'secret',
    privateKey: 'unused',
    installationId: '2',
    repositoryId: '3',
    fetchImpl,
    now: () => NOW,
  })

const hostedClient = (fetchImpl: typeof fetch): GitHubIssueClient =>
  new GitHubIssueClient({
    appId: '1',
    clientId: 'client',
    clientSecret: 'secret',
    privateKey: appPrivateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }).toString(),
    installationId: '2',
    repositoryId: '3',
    fetchImpl,
    now: () => NOW,
  })

describe('GitHubIssueClient', () => {
  it('creates a labeled issue only in the fixed issues-only repository', async () => {
    const fetchImpl = vi.fn(async () => response({
      number: 17,
      html_url: 'https://github.com/titanxxh/open-agricola-issues/issues/17',
    })) as unknown as typeof fetch

    const result = await client(fetchImpl).createIssue(
      'github_user',
      { title: 'Game bug', body: 'details' },
      'user-token',
    )

    expect(result).toMatchObject({ ok: true, number: 17 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(url).toBe('https://api.github.com/repos/titanxxh/open-agricola-issues/issues')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer user-token' })
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'Game bug',
      body: 'details',
      labels: ['needs-triage'],
    })
  })

  it.each([
    [401, {}, 'auth', 'github_auth_invalid'],
    [403, {}, 'permission', 'github_permission_denied'],
    [403, { 'x-ratelimit-remaining': '0' }, 'rate_limit', 'github_rate_limited'],
    [429, { 'retry-after': '30' }, 'rate_limit', 'github_rate_limited'],
    [410, {}, 'terminal', 'github_gone'],
    [422, {}, 'terminal', 'github_validation_failed'],
    [500, {}, 'uncertain', 'github_result_uncertain'],
  ] as const)(
    'classifies GitHub status %s',
    async (status, headers, kind, code) => {
      const fetchImpl = vi.fn(async () =>
        response({}, status, headers)) as unknown as typeof fetch
      const result = await client(fetchImpl).createIssue(
        'github_user',
        { title: 'Game bug', body: 'details' },
        'user-token',
      )

      expect(result).toMatchObject({ ok: false, kind, code, status })
      if ('retry-after' in headers) {
        expect(result).toMatchObject({ retryAt: NOW + 30_000 })
      }
    },
  )

  it('treats a network create failure as uncertain', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('socket closed')
    }) as unknown as typeof fetch

    await expect(client(fetchImpl).createIssue(
      'github_user',
      { title: 'Game bug', body: 'details' },
      'user-token',
    )).resolves.toEqual({
      ok: false,
      kind: 'uncertain',
      code: 'github_result_uncertain',
    })
  })

  it('reconciles a marker against the fixed repository', async () => {
    const fetchImpl = vi.fn(async () => response([{
      number: 17,
      html_url: 'https://github.com/titanxxh/open-agricola-issues/issues/17',
      body: 'details\n<!-- open-agricola-report:id -->',
      created_at: new Date(NOW).toISOString(),
    }])) as unknown as typeof fetch

    const result = await client(fetchImpl).findIssueByMarker(
      'github_user',
      '<!-- open-agricola-report:id -->',
      NOW - 1_000,
      'user-token',
    )

    expect(result).toMatchObject({ ok: true, number: 17 })
    expect(String(vi.mocked(fetchImpl).mock.calls[0]![0])).toContain(
      '/repos/titanxxh/open-agricola-issues/issues?',
    )
  })

  it('restricts a hosted installation token to the configured repository and issues permission', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        token: 'installation-token',
        expires_at: new Date(NOW + 3_600_000).toISOString(),
      }))
      .mockResolvedValueOnce(response({
        number: 17,
        html_url: 'https://github.com/titanxxh/open-agricola-issues/issues/17',
      })) as unknown as typeof fetch

    await expect(hostedClient(fetchImpl).createIssue(
      'hosted',
      { title: 'Game bug', body: 'details' },
    )).resolves.toMatchObject({ ok: true, number: 17 })

    const [tokenUrl, tokenInit] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(tokenUrl).toBe('https://api.github.com/app/installations/2/access_tokens')
    expect(JSON.parse(String(tokenInit?.body))).toEqual({
      repository_ids: [3],
      permissions: { issues: 'write' },
    })
    expect(vi.mocked(fetchImpl).mock.calls[1]![1]?.headers).toMatchObject({
      Authorization: 'Bearer installation-token',
    })
  })

  it.each([
    ['network error', () => Promise.reject(new Error('offline')), 'github_app_token_uncertain'],
    ['server error', () => Promise.resolve(response({}, 500)), 'github_result_uncertain'],
  ])('retries a transient installation-token %s', async (_name, tokenResponse, code) => {
    const fetchImpl = vi.fn(tokenResponse) as unknown as typeof fetch

    await expect(hostedClient(fetchImpl).createIssue(
      'hosted',
      { title: 'Game bug', body: 'details' },
    )).resolves.toMatchObject({
      ok: false,
      kind: 'uncertain',
      code,
    })
  })

  it('revokes the whole GitHub App user grant before local disconnect', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 204 })) as unknown as typeof fetch

    await expect(client(fetchImpl).revokeUserGrant('user-token'))
      .resolves.toEqual({ ok: true })

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(url).toBe('https://api.github.com/applications/client/grant')
    expect(init).toMatchObject({ method: 'DELETE' })
    expect(init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('client:secret').toString('base64')}`,
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      access_token: 'user-token',
    })
  })

  it('anonymizes the injected reporter line with the installation identity', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        token: 'installation-token',
        expires_at: new Date(NOW + 3_600_000).toISOString(),
      }))
      .mockResolvedValueOnce(response({
        number: 17,
        body: '## Phenomenon\n\nFrozen\n\n- Reporter site ID: `site-user`\n',
      }))
      .mockResolvedValueOnce(response({})) as unknown as typeof fetch

    await expect(hostedClient(fetchImpl).anonymizeIssue(17, 'site-user'))
      .resolves.toEqual({ ok: true })

    const [url, init] = vi.mocked(fetchImpl).mock.calls[2]!
    expect(url).toBe(
      'https://api.github.com/repos/titanxxh/open-agricola-issues/issues/17',
    )
    expect(init).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse(String(init?.body)).body).toBe(
      '## Phenomenon\n\nFrozen\n\n- Reporter site ID: `deleted reporter`\n',
    )
  })

  it('uses PKCE and validates webhook signatures', () => {
    const authorization = new URL(client(vi.fn() as unknown as typeof fetch)
      .authorizationUrl({
        state: 'state',
        codeChallenge: createCodeChallenge('verifier'),
        redirectUri: 'https://api.example/callback',
      }))
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorization.searchParams.get('code_challenge')).toBe(
      createCodeChallenge('verifier'),
    )

    const body = Buffer.from('{"action":"revoked"}')
    const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`
    expect(verifyGitHubWebhook('secret', body, signature)).toBe(true)
    expect(verifyGitHubWebhook('secret', body, 'sha256=00')).toBe(false)
  })
})
