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
      if (url.includes('/git/commits/') && !init?.method) return Promise.resolve(okJson({tree:{sha:`tree-${url.split('/').at(-1)}`}}))
      return Promise.resolve(fetchHandler(url, init))
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
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
        files: [
          { path: 'a.txt', content: 'abc', encoding: 'utf-8' },
          { path: 'b.png', content: 'xyz', encoding: 'base64' },
        ],
        message: 'test commit',
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
        files: [{ path: 'a.txt', content: 'abc', encoding: 'utf-8' }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })
      expect(result.upstreamBaseSha).toBe('fixed-base')
      expect(treeBody?.base_tree).toBe('tree-fixed-base')
      expect(commitBody?.parents).toEqual(['fixed-base'])
    })

    it('rebases non-generated tree entries while generated files replace matching paths', async () => {
      let treeBody: {
        tree?: Array<{ path: string; sha: string | null }>
      } | null = null
      fetchHandler = (url, init) => {
        if (url.includes('/git/blobs') && init?.method === 'POST') return okJson({ sha: 'new-card' })
        if (url.includes('/git/trees') && init?.method === 'POST') {
          treeBody = JSON.parse(init.body as string) as typeof treeBody
          return okJson({ sha: 'treesha' })
        }
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })
      await c.createCommit({
        files: [{ path: 'card.ts', content: 'new', encoding: 'utf-8' }],
        preservedTreeEntries: [
          { path: 'card.ts', sha: 'old-card', status: 'modified', mode: '100644' },
          {
            path: 'server/__tests__/CUSTOM_Test-session.test.ts',
            sha: 'behavior-test',
            status: 'added',
            mode: '100755',
            patch: "@@ -0,0 +1 @@\n+it('tests behavior')",
          },
        ],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })

      expect(treeBody?.tree).toEqual([
        { path: 'card.ts', mode: '100644', type: 'blob', sha: 'new-card' },
        { path: 'server/__tests__/CUSTOM_Test-session.test.ts', mode: '100755', type: 'blob', sha: 'new-card' },
      ])
    })

    it('rejects a preserved patch whose old hunk is not contiguous on current main', async () => {
      fetchHandler = (url, init) => {
        if (url.includes('/contents/server/__tests__/existing.test.ts')) {
          return okJson({
            content: Buffer.from('changed\nfirst\nunrelated\nsecond\n').toString('base64'),
            encoding: 'base64',
            sha: 'fixture-sha',
          })
        }
        if (url.includes('/git/blobs') && init?.method === 'POST') return okJson({ sha: 'blobsha' })
        if (url.includes('/git/trees') && init?.method === 'POST') return okJson({ sha: 'treesha' })
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await expect(c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'server/__tests__/existing.test.ts',
          sha: 'old-pr-blob',
          status: 'modified',
          mode: '100644',
          patch: '@@ -1,2 +1,3 @@\n first\n second\n+manual',
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })).rejects.toMatchObject({ code: 'pr_rebase_conflict' })
    })

    it('carries a relocated offset across later patch hunks', async () => {
      let blobBody: { content?: string } | null = null
      fetchHandler = (url, init) => {
        if (url.includes('/contents/example.ts')) {
          return okJson({
            content: Buffer.from(
              'inserted\nfirst-target\nfiller\nsecond-target\nsecond-target\n',
            ).toString('base64'),
            encoding: 'base64',
            sha: 'fixture-sha',
          })
        }
        if (url.includes('/git/blobs') && init?.method === 'POST') {
          blobBody = JSON.parse(init.body as string) as typeof blobBody
          return okJson({ sha: 'blobsha' })
        }
        if (url.includes('/git/trees') && init?.method === 'POST') return okJson({ sha: 'treesha' })
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'example.ts',
          sha: 'old-pr-blob',
          status: 'modified',
          mode: '100644',
          patch: [
            '@@ -1 +1 @@',
            '-first-target',
            '+first-reviewed',
            '@@ -4 +4 @@',
            '-second-target',
            '+second-reviewed',
          ].join('\n'),
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })

      expect(blobBody?.content).toBe(
        'inserted\nfirst-reviewed\nfiller\nsecond-target\nsecond-reviewed\n',
      )
    })

    it('preserves a final newline added by a patch', async () => {
      let blobBody: { content?: string } | null = null
      fetchHandler = (url, init) => {
        if (url.includes('/contents/example.ts')) {
          return okJson({
            content: Buffer.from('const value = 1').toString('base64'),
            encoding: 'base64',
            sha: 'fixture-sha',
          })
        }
        if (url.includes('/git/blobs') && init?.method === 'POST') {
          blobBody = JSON.parse(init.body as string) as typeof blobBody
          return okJson({ sha: 'blobsha' })
        }
        if (url.includes('/git/trees') && init?.method === 'POST') return okJson({ sha: 'treesha' })
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'example.ts',
          sha: 'old-pr-blob',
          status: 'modified',
          mode: '100644',
          patch: '@@ -1 +1 @@\n-const value = 1\n\\ No newline at end of file\n+const value = 1',
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })

      expect(blobBody?.content).toBe('const value = 1\n')
    })

    it('preserves the current EOF when rebasing an old no-newline hunk', async () => {
      let blobBody: { content?: string } | null = null
      fetchHandler = (url, init) => {
        if (url.includes('/contents/example.ts')) {
          return okJson({
            content: Buffer.from('const value = 1\nconst upstream = 2\n').toString('base64'),
            encoding: 'base64',
            sha: 'fixture-sha',
          })
        }
        if (url.includes('/git/blobs') && init?.method === 'POST') {
          blobBody = JSON.parse(init.body as string) as typeof blobBody
          return okJson({ sha: 'blobsha' })
        }
        if (url.includes('/git/trees') && init?.method === 'POST') return okJson({ sha: 'treesha' })
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'example.ts',
          sha: 'old-pr-blob',
          status: 'modified',
          mode: '100644',
          patch: '@@ -1 +1 @@\n-const value = 1\n\\ No newline at end of file\n+const reviewed = 1\n\\ No newline at end of file',
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })

      expect(blobBody?.content).toBe('const reviewed = 1\nconst upstream = 2\n')
    })

    it('replays a patchless binary rename from the current base blob', async () => {
      let treeBody: {
        tree?: Array<{ path: string; sha: string | null; mode: string }>
      } | null = null
      fetchHandler = (url, init) => {
        if (url.includes('/contents/scripts/old.sh')) {
          return okJson({
            content: Buffer.from([0xff, 0x00, 0x80]).toString('base64'),
            encoding: 'base64',
            sha: 'current-base-blob',
          })
        }
        if (url.includes('/contents/scripts/new.sh')) return new Response('', { status: 404 })
        if (url.includes('/git/blobs') && init?.method === 'POST') {
          throw new Error('should reuse the current base blob')
        }
        if (url.includes('/git/trees') && init?.method === 'POST') {
          treeBody = JSON.parse(init.body as string) as typeof treeBody
          return okJson({ sha: 'treesha' })
        }
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'scripts/new.sh',
          previousPath: 'scripts/old.sh',
          sha: 'old-pr-blob',
          status: 'renamed',
          mode: '100755',
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })

      expect(treeBody?.tree).toEqual([
        { path: 'scripts/old.sh', sha: null, mode: '100755', type: 'blob' },
        { path: 'scripts/new.sh', sha: 'current-base-blob', mode: '100755', type: 'blob' },
      ])
    })

    it('keeps the source file when replaying a copied entry', async () => {
      let treeBody: {
        tree?: Array<{ path: string; sha: string | null; mode: string }>
      } | null = null
      let blobBody: { content?: string } | null = null
      fetchHandler = (url, init) => {
        if (url.includes('/contents/server/__tests__/source.test.ts')) {
          return okJson({
            content: Buffer.from("it('source', () => {})\n").toString('base64'),
            encoding: 'base64',
            sha: 'fixture-sha',
          })
        }
        if (url.includes('/git/blobs') && init?.method === 'POST') {
          blobBody = JSON.parse(init.body as string) as typeof blobBody
          return okJson({ sha: 'copied-blob' })
        }
        if (url.includes('/git/trees') && init?.method === 'POST') {
          treeBody = JSON.parse(init.body as string) as typeof treeBody
          return okJson({ sha: 'treesha' })
        }
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'server/__tests__/copy.test.ts',
          previousPath: 'server/__tests__/source.test.ts',
          sha: 'old-pr-blob',
          status: 'copied',
          mode: '100644',
          patch: "@@ -1 +1,2 @@\n it('source', () => {})\n+it('copy', () => {})",
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })

      expect(blobBody?.content).toBe("it('source', () => {})\nit('copy', () => {})\n")
      expect(treeBody?.tree).toEqual([
        { path: 'server/__tests__/copy.test.ts', sha: 'copied-blob', mode: '100644', type: 'blob' },
      ])
    })

    it('reuses the current source blob for a patchless copied entry', async () => {
      let treeBody: {
        tree?: Array<{ path: string; sha: string | null; mode: string }>
      } | null = null
      fetchHandler = (url, init) => {
        if (url.includes('/contents/fixtures/source.bin')) {
          return okJson({
            content: Buffer.from([0xff, 0x00, 0x80]).toString('base64'),
            encoding: 'base64',
            sha: 'current-source-blob',
          })
        }
        if (url.includes('/contents/fixtures/copy.bin')) return new Response('', { status: 404 })
        if (url.includes('/git/blobs') && init?.method === 'POST') {
          throw new Error('should reuse the current source blob')
        }
        if (url.includes('/git/trees') && init?.method === 'POST') {
          treeBody = JSON.parse(init.body as string) as typeof treeBody
          return okJson({ sha: 'treesha' })
        }
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'fixtures/copy.bin',
          previousPath: 'fixtures/source.bin',
          sha: 'old-pr-blob',
          status: 'copied',
          mode: '100644',
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })

      expect(treeBody?.tree).toEqual([
        { path: 'fixtures/copy.bin', sha: 'current-source-blob', mode: '100644', type: 'blob' },
      ])
    })

    it('rejects a copied entry when its destination now exists on main', async () => {
      fetchHandler = (url, init) => {
        if (url.includes('/contents/server/__tests__/source.test.ts')) {
          return okJson({
            content: Buffer.from("it('source', () => {})\n").toString('base64'),
            encoding: 'base64',
            sha: 'source-sha',
          })
        }
        if (url.includes('/contents/server/__tests__/copy.test.ts')) {
          return okJson({
            content: Buffer.from("it('upstream', () => {})\n").toString('base64'),
            encoding: 'base64',
            sha: 'destination-sha',
          })
        }
        if (url.includes('/git/blobs') && init?.method === 'POST') return okJson({ sha: 'copied-blob' })
        if (url.includes('/git/trees') && init?.method === 'POST') return okJson({ sha: 'treesha' })
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await expect(c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'server/__tests__/copy.test.ts',
          previousPath: 'server/__tests__/source.test.ts',
          sha: 'old-pr-blob',
          status: 'copied',
          mode: '100644',
          patch: "@@ -1 +1,2 @@\n it('source', () => {})\n+it('copy', () => {})",
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })).rejects.toMatchObject({ code: 'pr_rebase_conflict' })
    })

    it('preserves a patchless newly added binary file', async () => {
      let treeBody: {
        tree?: Array<{ path: string; sha: string | null; mode: string }>
      } | null = null
      fetchHandler = (url, init) => {
        if (url.includes('/contents/fixtures/reviewer.bin')) return new Response('', { status: 404 })
        if (url.includes('/git/blobs') && init?.method === 'POST') {
          throw new Error('should reuse the PR head blob')
        }
        if (url.includes('/git/trees') && init?.method === 'POST') {
          treeBody = JSON.parse(init.body as string) as typeof treeBody
          return okJson({ sha: 'treesha' })
        }
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'fixtures/reviewer.bin',
          sha: 'reviewer-binary-blob',
          status: 'added',
          mode: '100644',
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })

      expect(treeBody?.tree).toEqual([
        { path: 'fixtures/reviewer.bin', sha: 'reviewer-binary-blob', mode: '100644', type: 'blob' },
      ])
    })

    it('preserves a patchless removal when the current blob is unchanged', async () => {
      let treeBody: {
        tree?: Array<{ path: string; sha: string | null; mode: string }>
      } | null = null
      fetchHandler = (url, init) => {
        if (url.includes('/contents/fixtures/removed.bin')) {
          return okJson({
            content: Buffer.from([0xff, 0x00, 0x80]).toString('base64'),
            encoding: 'base64',
            sha: 'removed-blob',
          })
        }
        if (url.includes('/git/blobs') && init?.method === 'POST') {
          throw new Error('a removal must not create a blob')
        }
        if (url.includes('/git/trees') && init?.method === 'POST') {
          treeBody = JSON.parse(init.body as string) as typeof treeBody
          return okJson({ sha: 'treesha' })
        }
        if (url.includes('/git/commits') && init?.method === 'POST') return okJson({ sha: 'commitsha' })
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'fixtures/removed.bin',
          sha: 'removed-blob',
          status: 'removed',
          mode: '100644',
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })

      expect(treeBody?.tree).toEqual([
        { path: 'fixtures/removed.bin', sha: null, mode: '100644', type: 'blob' },
      ])
    })

    it('rejects a patchless removal when the current blob changed', async () => {
      fetchHandler = (url) => {
        if (url.includes('/contents/fixtures/removed.bin')) {
          return okJson({
            content: Buffer.from([0xff, 0x00, 0x80]).toString('base64'),
            encoding: 'base64',
            sha: 'changed-blob',
          })
        }
        return new Response('', { status: 404 })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await expect(c.createCommit({
        files: [],
        preservedTreeEntries: [{
          path: 'fixtures/removed.bin',
          sha: 'removed-blob',
          status: 'removed',
          mode: '100644',
        }],
        message: 'test commit',
        upstreamBaseSha: 'fixed-base',
      })).rejects.toMatchObject({ code: 'pr_rebase_conflict' })
    })
  })

  describe('getPullRequestTreeEntries', () => {
    it('maps added, removed, and renamed files to reusable tree entries', async () => {
      fetchHandler = (url) => {
        if (url.endsWith('/pulls/42')) return okJson({ head: { sha: 'pr-head' } })
        if (url.includes('/git/trees/pr-head')) return okJson({
          truncated: false,
          tree: [
            { path: 'server/__tests__/A.test.ts', mode: '100755', type: 'blob' },
            { path: 'new.txt', mode: '100644', type: 'blob' },
          ],
        })
        return okJson([
          {
            filename: 'server/__tests__/A.test.ts',
            status: 'added',
            sha: 'added-sha',
            patch: '+it(\'tests behavior\')',
          },
          { filename: 'old.txt', status: 'removed', sha: 'old-sha' },
          { filename: 'new.txt', previous_filename: 'before.txt', status: 'renamed', sha: 'new-sha' },
        ])
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await expect(c.getPullRequestTreeEntries(42)).resolves.toEqual([
        {
          path: 'server/__tests__/A.test.ts',
          sha: 'added-sha',
          status: 'added',
          mode: '100755',
          patch: '+it(\'tests behavior\')',
        },
        { path: 'old.txt', sha: 'old-sha', status: 'removed', mode: '100644' },
        {
          path: 'new.txt',
          previousPath: 'before.txt',
          sha: 'new-sha',
          status: 'renamed',
          mode: '100644',
        },
      ])
    })

    it('reads every page of PR files', async () => {
      fetchHandler = (url) => {
        if (url.endsWith('/pulls/42')) return okJson({ head: { sha: 'pr-head' } })
        if (url.includes('/git/trees/pr-head')) return okJson({
          truncated: false,
          tree: [
            ...Array.from({ length: 100 }, (_, index) => ({
              path: `test-${index}.ts`, mode: '100644', type: 'blob',
            })),
            { path: 'last.test.ts', mode: '100644', type: 'blob' },
          ],
        })
        const page = new URL(url).searchParams.get('page')
        return okJson(page === '2'
          ? [{ filename: 'last.test.ts', status: 'added', sha: 'last-sha' }]
          : Array.from({ length: 100 }, (_, index) => ({
              filename: `test-${index}.ts`, status: 'added', sha: `sha-${index}`,
            })))
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      const entries = await c.getPullRequestTreeEntries(42)
      expect(entries).toHaveLength(101)
      expect(entries.at(-1)).toEqual({
        path: 'last.test.ts', sha: 'last-sha', status: 'added', mode: '100644',
      })
      expect(fetchCalls
        .filter(call => call.url.includes('/files?'))
        .map(call => new URL(call.url).searchParams.get('page'))).toEqual(['1', '2'])
    })
  })

  describe('openPr', () => {
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
        branchName: 'workshop/CUSTOM_X',
        title: 'T',
        body: 'B',
      })
      expect(pr).toEqual({
        number: 99,
        url: 'https://github.com/t/r/pull/99',
        baseRefName: 'main',
        isDraft: false,
      })
    })

  })

  describe('getUpstreamFile', () => {
    it('decodes base64 content', async () => {
      fetchHandler = (url) => {
        if (url.includes('/contents/shared/cards/register-all.ts')) {
          return okJson({
            content: Buffer.from('file content here').toString('base64'),
            sha: 'fixture-sha',
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
            sha: 'fixture-sha',
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

    it('encodes reserved characters in each path segment', async () => {
      let requestedUrl = ''
      fetchHandler = (url) => {
        requestedUrl = url
        return okJson({
          content: Buffer.from('encoded path').toString('base64'),
          sha: 'fixture-sha',
          encoding: 'base64',
        })
      }
      const c = new GitHubClient({
        token: 't',
        upstreamOwner: 'titanxxh',
        upstreamRepo: 'open-agricola',
      })

      await c.getUpstreamFile('fixtures/a#b?/file name.txt', 'fixed ref')

      expect(requestedUrl).toContain('/contents/fixtures/a%23b%3F/file%20name.txt?ref=fixed%20ref')
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
    fetchHandler = () => okJson({ object: { sha: 'main-sha' } })
    const c = new GitHubClient({
      token: 'secret-token',
      upstreamOwner: 'titanxxh',
      upstreamRepo: 'open-agricola',
    })
    await c.getUpstreamMainSha()
    const call = fetchCalls[0]!
    const headers = call.init?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer secret-token')
    expect(headers.get('Accept')).toBe('application/vnd.github+json')
  })
})
