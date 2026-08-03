import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GitHubClient, GitHubApiError } from '../github-client.ts'

// Helper: construct a Response for fetch stubs
function okJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GitHubClient', () => {
  let fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  let fetchHandler: (url: string, init?: RequestInit) => Response | Promise<Response>

  beforeEach(() => {
    fetchCalls = []
    fetchHandler = () => new Response('', { status: 404 })
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init })
      return Promise.resolve(fetchHandler(url, init))
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('ensureFork', () => {
    it('uses the upstream repo directly when the authorized user is the upstream owner', async () => {
      fetchHandler = (url) => {
        if (url.endsWith('/user')) return okJson({ login: 'titanxxh' })
        if (url.includes('/repos/titanxxh/open-agricola/forks'))
          throw new Error('should not try to fork the upstream repo into itself')
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      const result = await c.ensureFork()
      expect(result).toEqual({ owner: 'titanxxh', repo: 'open-agricola' })
    })

    it('returns existing fork when present', async () => {
      fetchHandler = (url) => {
        if (url.endsWith('/user')) return okJson({ login: 'alice' })
        if (url.includes('/repos/alice/open-agricola'))
          return okJson({ full_name: 'alice/open-agricola' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      const result = await c.ensureFork()
      expect(result).toEqual({ owner: 'alice', repo: 'open-agricola' })
    })

    it('creates and polls when fork missing', async () => {
      let pollCount = 0
      fetchHandler = (url) => {
        if (url.endsWith('/user')) return okJson({ login: 'bob' })
        if (url.includes('/repos/bob/open-agricola')) {
          pollCount++
          return pollCount >= 3
            ? okJson({ full_name: 'bob/open-agricola' })
            : new Response('', { status: 404 })
        }
        if (url.includes('/repos/titanxxh/open-agricola/forks'))
          return new Response('', { status: 202 })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
        forkPollIntervalMs: 1,
        forkPollMaxMs: 100,
      })
      const result = await c.ensureFork()
      expect(result.owner).toBe('bob')
    })

    it('throws fork_pending on timeout', async () => {
      fetchHandler = (url) => {
        if (url.endsWith('/user')) return okJson({ login: 'carol' })
        if (url.includes('/repos/carol/open-agricola'))
          return new Response('', { status: 404 })
        if (url.includes('/repos/titanxxh/open-agricola/forks'))
          return new Response('', { status: 202 })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
        forkPollIntervalMs: 1,
        forkPollMaxMs: 5,
      })
      await expect(c.ensureFork()).rejects.toMatchObject({ code: 'fork_pending' })
    })
  })

  describe('createCommit', () => {
    it('blobs + tree + commit in sequence', async () => {
      fetchHandler = (url, init) => {
        if (url.includes('/git/ref/heads/main'))
          return okJson({ object: { sha: 'upstreamsha' } })
        if (url.includes('/git/blobs') && init?.method === 'POST') {
          const body = JSON.parse(init.body as string) as { content: string }
          return okJson({ sha: 'blob-' + body.content.slice(0, 3) })
        }
        if (url.includes('/git/trees') && init?.method === 'POST')
          return okJson({ sha: 'treesha' })
        if (url.includes('/git/commits') && init?.method === 'POST')
          return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      const result = await c.createCommit({
        forkOwner: 'alice',
        files: [
          { path: 'a.txt', content: 'abc', encoding: 'utf-8' },
          { path: 'b.png', content: 'xyz', encoding: 'base64' },
        ],
        message: 'test commit',
        author: { name: 'alice', email: 'a@users.noreply.github.com' },
      })
      expect(result.commitSha).toBe('commitsha')
      expect(result.upstreamBaseSha).toBe('upstreamsha')
    })

    it('uses provided upstream base sha for tree and parent', async () => {
      let treeBody: { base_tree?: string } | null = null
      let commitBody: { parents?: string[] } | null = null
      fetchHandler = (url, init) => {
        if (url.includes('/git/ref/heads/main'))
          throw new Error('should not fetch main ref when base sha is provided')
        if (url.includes('/git/blobs') && init?.method === 'POST') return okJson({ sha: 'blobsha' })
        if (url.includes('/git/trees') && init?.method === 'POST') {
          treeBody = JSON.parse(init.body as string) as { base_tree?: string }
          return okJson({ sha: 'treesha' })
        }
        if (url.includes('/git/commits') && init?.method === 'POST') {
          commitBody = JSON.parse(init.body as string) as { parents?: string[] }
          return okJson({ sha: 'commitsha' })
        }
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      const result = await c.createCommit({
        forkOwner: 'alice',
        files: [{ path: 'a.txt', content: 'abc', encoding: 'utf-8' }],
        message: 'test commit',
        author: { name: 'alice', email: 'a@users.noreply.github.com' },
        upstreamBaseSha: 'fixed-base',
      })
      expect(result.upstreamBaseSha).toBe('fixed-base')
      expect(treeBody?.base_tree).toBe('fixed-base')
      expect(commitBody?.parents).toEqual(['fixed-base'])
    })
  })

  describe('upsertBranch', () => {
    it('creates new ref when branch absent', async () => {
      let postedRef = false
      fetchHandler = (url, init) => {
        if (
          url.includes('/git/ref/heads/workshop/CUSTOM_X') &&
          (!init || (init.method !== 'POST' && init.method !== 'PATCH'))
        ) {
          return new Response('', { status: 404 })
        }
        if (url.includes('/git/refs') && init?.method === 'POST') {
          postedRef = true
          return okJson({}, 201)
        }
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      await c.upsertBranch({
        forkOwner: 'alice',
        branchName: 'workshop/CUSTOM_X',
        commitSha: 'abc',
      })
      expect(postedRef).toBe(true)
    })

    it('force-updates existing ref', async () => {
      let patched = false
      fetchHandler = (url, init) => {
        if (
          url.includes('/git/ref/heads/workshop/CUSTOM_X') &&
          (!init || !init.method || init.method === 'GET')
        ) {
          return okJson({ object: { sha: 'old' } })
        }
        if (
          url.includes('/git/refs/heads/workshop/CUSTOM_X') &&
          init?.method === 'PATCH'
        ) {
          patched = true
          const body = JSON.parse(init.body as string) as { force?: boolean }
          expect(body.force).toBe(true)
          return okJson({})
        }
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      await c.upsertBranch({
        forkOwner: 'alice',
        branchName: 'workshop/CUSTOM_X',
        commitSha: 'new',
      })
      expect(patched).toBe(true)
    })
  })

  describe('findReusablePr / openPr / setPrState / commentOnPr', () => {
    it('findReusablePr prefers an open unmerged PR matching head', async () => {
      fetchHandler = (url) => {
        if (url.includes('/pulls?head='))
          return okJson([
            {
              number: 41,
              html_url: 'https://github.com/t/r/pull/41',
              base: { ref: 'main' },
              draft: false,
              state: 'closed',
              merged_at: '2026-08-01T00:00:00Z',
            },
            {
              number: 42,
              html_url: 'https://github.com/t/r/pull/42',
              base: { ref: 'release' },
              draft: true,
              state: 'closed',
              merged_at: null,
            },
            {
              number: 43,
              html_url: 'https://github.com/t/r/pull/43',
              base: { ref: 'main' },
              draft: false,
              state: 'open',
              merged_at: null,
            },
          ])
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      const pr = await c.findReusablePr({ forkOwner: 'alice', branchName: 'workshop/CUSTOM_X' })
      expect(pr).toEqual({
        number: 43,
        url: 'https://github.com/t/r/pull/43',
        baseRefName: 'main',
        isDraft: false,
        state: 'open',
        conflictingOpenPrNumbers: [],
      })
      expect(fetchCalls[0]?.url).toContain('state=all')
    })

    it('findReusablePr prefers an eligible closed PR over an ineligible open PR', async () => {
      fetchHandler = () => okJson([
        {
          number: 42,
          html_url: 'https://github.com/t/r/pull/42',
          base: { ref: 'main' },
          draft: true,
          state: 'open',
          merged_at: null,
        },
        {
          number: 43,
          html_url: 'https://github.com/t/r/pull/43',
          base: { ref: 'main' },
          draft: false,
          state: 'closed',
          merged_at: null,
        },
      ])
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await expect(c.findReusablePr({ forkOwner: 'alice', branchName: 'workshop/CUSTOM_X' }))
        .resolves.toMatchObject({
          number: 43,
          state: 'closed',
          conflictingOpenPrNumbers: [42],
        })
    })

    it('findReusablePr returns null when every matching PR was merged', async () => {
      fetchHandler = () => okJson([{
        number: 42,
        html_url: 'https://github.com/t/r/pull/42',
        base: { ref: 'main' },
        draft: false,
        state: 'closed',
        merged_at: '2026-08-01T00:00:00Z',
      }])
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      const pr = await c.findReusablePr({ forkOwner: 'alice', branchName: 'workshop/CUSTOM_X' })
      expect(pr).toBeNull()
    })

    it('openPr creates a PR and returns number + url', async () => {
      fetchHandler = (_url, init) => {
        if (init?.method === 'POST')
          return okJson({ number: 99, html_url: 'https://github.com/t/r/pull/99' }, 201)
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      const pr = await c.openPr({
        forkOwner: 'alice',
        branchName: 'workshop/CUSTOM_X',
        title: 'T',
        body: 'B',
      })
      expect(pr).toEqual({
        number: 99,
        url: 'https://github.com/t/r/pull/99',
        baseRefName: 'main',
        isDraft: false,
        state: 'open',
      })
    })

    it.each(['open', 'closed'] as const)('setPrState changes the existing PR to %s', async (state) => {
      fetchHandler = (_url, init) => {
        expect(init?.method).toBe('PATCH')
        expect(JSON.parse(String(init?.body))).toEqual({ state })
        return okJson({}, 200)
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      await expect(c.setPrState(42, state)).resolves.toBeUndefined()
    })

    it('commentOnPr posts a comment (best effort, no throw on failure)', async () => {
      fetchHandler = () => new Response('', { status: 500 })
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      await expect(c.commentOnPr({ prNumber: 42, body: 'hi' })).resolves.toBeUndefined()
    })
  })

  describe('getUpstreamFile', () => {
    it('decodes base64 content', async () => {
      fetchHandler = (url) => {
        if (url.includes('/contents/shared/cards/register-all.ts')) {
          return okJson({
            content: Buffer.from('file content here').toString('base64'),
            encoding: 'base64',
          })
        }
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      const text = await c.getUpstreamFile('shared/cards/register-all.ts')
      expect(text).toBe('file content here')
    })

    it('fetches content at a pinned ref', async () => {
      fetchHandler = (url) => {
        if (url.includes('ref=fixedsha')) {
          return okJson({
            content: Buffer.from('pinned content').toString('base64'),
            encoding: 'base64',
          })
        }
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      const text = await c.getUpstreamFile('shared/cards/register-all.ts', 'fixedsha')
      expect(text).toBe('pinned content')
    })

    it('throws GitHubApiError on 404', async () => {
      fetchHandler = () => new Response('', { status: 404 })
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      await expect(c.getUpstreamFile('x')).rejects.toMatchObject({ code: 'contents_failed' })
    })
  })

  // Satisfies the isolatedModules pipeline and keeps the import used.
  it('GitHubApiError is exported with code and status fields', () => {
    const err = new GitHubApiError('msg', 'code_x', 500)
    expect(err.code).toBe('code_x')
    expect(err.status).toBe(500)
  })

  it('authorization header is sent on requests', async () => {
    fetchHandler = () => okJson({ login: 'x' })
    const c = new GitHubClient({
      token: 'secret-token',
      upstreamOwner: 'titanxxh',
      upstreamRepo: 'open-agricola',
    })
    await c.getUserLogin()
    const call = fetchCalls[0]!
    const headers = call.init?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer secret-token')
    expect(headers.get('Accept')).toBe('application/vnd.github+json')
  })
})
