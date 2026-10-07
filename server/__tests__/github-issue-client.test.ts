import {
  createHmac,
  generateKeyPairSync,
} from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GitHubIssueClient', () => {
  it('creates a labeled issue only in the fixed public project repository', async () => {
    const fetchImpl = vi.fn(async () => response({
      number: 17,
      html_url: 'https://github.com/titanxxh/open-agricola/issues/17',
    })) as unknown as typeof fetch

    const result = await client(fetchImpl).createIssue(
      'github_user',
      { title: 'Game bug', body: 'details' },
      'user-token',
    )

    expect(result).toMatchObject({ ok: true, number: 17 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(url).toBe('https://api.github.com/repos/titanxxh/open-agricola/issues')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer user-token' })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
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

  it('bounds GitHub requests with a timeout signal', async () => {
    const signal = new AbortController().signal
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
    const fetchImpl = vi.fn(async () => {
      throw new Error('timed out')
    }) as unknown as typeof fetch

    await client(fetchImpl).createIssue(
      'github_user',
      { title: 'Game bug', body: 'details' },
      'user-token',
    )

    expect(timeout).toHaveBeenCalledWith(15_000)
    expect(vi.mocked(fetchImpl).mock.calls[0]![1]?.signal).toBe(signal)
  })

  it('reconciles a marker against the fixed repository', async () => {
    const fetchImpl = vi.fn(async () => response([{
      number: 17,
      html_url: 'https://github.com/titanxxh/open-agricola/issues/17',
      body: 'details\n\n<!-- open-agricola-report:id -->',
      created_at: new Date(NOW).toISOString(),
      performed_via_github_app: { id: 1 },
    }])) as unknown as typeof fetch

    const result = await client(fetchImpl).findIssueByMarker(
      'github_user',
      '<!-- open-agricola-report:id -->',
      NOW - 1_000,
      'user-token',
    )

    expect(result).toMatchObject({ ok: true, number: 17 })
    expect(String(vi.mocked(fetchImpl).mock.calls[0]![0])).toContain(
      '/repos/titanxxh/open-agricola/issues?',
    )
  })

  it('allows bounded clock skew when reconciling a marker', async () => {
    const marker = '<!-- open-agricola-report:id -->'
    const fetchImpl = vi.fn(async () => response([{
      number: 17,
      html_url: 'https://github.com/titanxxh/open-agricola/issues/17',
      body: `details\n\n${marker}`,
      created_at: new Date(NOW - 60_000).toISOString(),
      performed_via_github_app: { id: 1 },
    }])) as unknown as typeof fetch

    await expect(client(fetchImpl).findIssueByMarker(
      'github_user',
      marker,
      NOW,
      'user-token',
    )).resolves.toMatchObject({ ok: true, number: 17 })
  })

  it('ignores copied markers and Issues predating the delivery attempt', async () => {
    const marker = '<!-- open-agricola-report:id -->'
    const fetchImpl = vi.fn(async () => response([
      {
        number: 20,
        html_url: 'https://github.com/titanxxh/open-agricola/issues/20',
        body: `copied ${marker}\n\n<!-- open-agricola-report:attacker -->`,
        created_at: new Date(NOW).toISOString(),
        performed_via_github_app: { id: 1 },
      },
      {
        number: 19,
        html_url: 'https://github.com/titanxxh/open-agricola/issues/19',
        body: `${marker}\n\n${marker}`,
        created_at: new Date(NOW).toISOString(),
        performed_via_github_app: { id: 1 },
      },
      {
        number: 18,
        html_url: 'https://github.com/titanxxh/open-agricola/issues/18',
        body: marker,
        created_at: new Date(NOW).toISOString(),
        performed_via_github_app: null,
      },
      {
        number: 17,
        html_url: 'https://github.com/titanxxh/open-agricola/issues/17',
        body: marker,
        created_at: new Date(NOW - 2_000).toISOString(),
        performed_via_github_app: { id: 1 },
      },
    ])) as unknown as typeof fetch

    await expect(client(fetchImpl).findIssueByMarker(
      'github_user',
      marker,
      NOW,
      'user-token',
    )).resolves.toEqual({ ok: true, found: false })
  })

  it('continues reconciliation past ten thousand newer Issues', async () => {
    const marker = '<!-- open-agricola-report:id -->'
    const newerIssues = Array.from({ length: 100 }, (_, index) => ({
      number: 20_000 - index,
      html_url: `https://github.com/titanxxh/open-agricola/issues/${20_000 - index}`,
      body: 'newer issue',
      created_at: new Date(NOW + 1_000).toISOString(),
      performed_via_github_app: { id: 1 },
    }))
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      return response(page === 101
        ? [{
            number: 17,
            html_url: 'https://github.com/titanxxh/open-agricola/issues/17',
            body: `details\n\n${marker}`,
            created_at: new Date(NOW).toISOString(),
            performed_via_github_app: { id: 1 },
          }]
        : newerIssues)
    }) as unknown as typeof fetch

    await expect(client(fetchImpl).findIssueByMarker(
      'github_user',
      marker,
      NOW,
      'user-token',
    )).resolves.toMatchObject({ ok: true, number: 17 })
    expect(fetchImpl).toHaveBeenCalledTimes(101)
  })

  it('restricts a hosted installation token to the configured repository and issues permission', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        token: 'installation-token',
        expires_at: new Date(NOW + 3_600_000).toISOString(),
      }))
      .mockResolvedValueOnce(response({
        number: 17,
        html_url: 'https://github.com/titanxxh/open-agricola/issues/17',
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
        title: 'Game bug: site-user froze',
        body: '## Phenomenon\n\nsite-user froze\n\n- Reporter site ID: `site-user`\n',
      }))
      .mockResolvedValueOnce(response({
        number: 17,
        title: 'Game bug:  froze',
        body: '## Phenomenon\n\n froze\n\n- Reporter site ID: `deleted reporter`\n',
      })) as unknown as typeof fetch

    await expect(hostedClient(fetchImpl).anonymizeIssue(17, 'site-user'))
      .resolves.toEqual({ ok: true })

    const [url, init] = vi.mocked(fetchImpl).mock.calls[2]!
    expect(url).toBe(
      'https://api.github.com/repos/titanxxh/open-agricola/issues/17',
    )
    expect(init).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse(String(init?.body)).body).toBe(
      '## Phenomenon\n\n froze\n\n- Reporter site ID: `deleted reporter`\n',
    )
    expect(JSON.parse(String(init?.body)).title).toBe('Game bug:  froze')
  })

  it('anonymizes reporter IDs outside the injected metadata line', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        token: 'installation-token',
        expires_at: new Date(NOW + 3_600_000).toISOString(),
      }))
      .mockResolvedValueOnce(response({
        number: 17,
        title: 'Game bug',
        body: 'Reporter: site-user',
      }))
      .mockResolvedValueOnce(response({
        number: 17,
        title: 'Game bug',
        body: 'Reporter: ',
      })) as unknown as typeof fetch

    await expect(hostedClient(fetchImpl).anonymizeIssue(17, 'site-user'))
      .resolves.toEqual({ ok: true })
    expect(JSON.parse(String(
      vi.mocked(fetchImpl).mock.calls[2]![1]?.body,
    )).body).toBe('Reporter: ')
  })

  it('verifies the updated Issue body before accepting anonymization', async () => {
    const body = '- Reporter site ID: `site-user`'
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({
        token: 'installation-token',
        expires_at: new Date(NOW + 3_600_000).toISOString(),
      }))
      .mockResolvedValueOnce(response({ number: 17, title: 'Game bug', body }))
      .mockResolvedValueOnce(response({ number: 17, title: 'Game bug', body })) as unknown as typeof fetch

    await expect(hostedClient(fetchImpl).anonymizeIssue(17, 'site-user'))
      .resolves.toEqual({
        ok: false,
        kind: 'terminal',
        code: 'github_anonymization_incomplete',
      })
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
