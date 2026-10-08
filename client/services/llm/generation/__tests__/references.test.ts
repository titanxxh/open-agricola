import { describe, expect, it, vi } from 'vitest'
import { sha1 } from '@noble/hashes/legacy.js'
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { allowedReferencePath, REFERENCE_LIMITS, ReferenceSession } from '../references'
import type { ToolCall } from '../protocol'
import { createBrowserGenerationPorts } from '../browser'

const call = (name: string, args: unknown): ToolCall => ({ id: 'call', type: 'function', function: { name, arguments: JSON.stringify(args) } })
const path = 'shared/cards/A/A123_FrameBuilder.ts'
const text = '// Built-in example\nconst name = "Frame Builder"\n'
const bytes = utf8ToBytes(text)
const sha = bytesToHex(sha1(concatBytes(utf8ToBytes(`blob ${bytes.length}\0`), bytes)))
const signal = () => new AbortController().signal

describe('project metadata and anonymous pinned source reads', () => {
  it('locates relevant sections and matching lines without requiring sequential document reads', async () => {
    const path = 'docs/CUSTOM_CARD_SANDBOX.md'
    const text = '# Sandbox\nIntro\n```\n## Not a heading\n```\n## Collect listener\nUse collect after forest.\n'
    const bytes = utf8ToBytes(text)
    const sha = bytesToHex(sha1(concatBytes(utf8ToBytes(`blob ${bytes.length}\0`), bytes)))
    const fetchReference = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ object: { sha: '6'.repeat(40) } }))
      .mockResolvedValueOnce(Response.json({ tree: [{ path, sha, type: 'blob', size: bytes.length }], truncated: false }))
      .mockResolvedValueOnce(new Response(text))
    const refs = await ReferenceSession.createOpener(fetchReference)(signal())
    const first = JSON.parse(await refs.execute(call('read_reference', { path, startLine: 1, lineCount: 2 }), signal()))
    expect(first.text).not.toContain('Collect listener')
    expect(first.sections).toEqual([{ line: 1, title: 'Sandbox' }, { line: 6, title: 'Collect listener' }])
    const search = JSON.parse(await refs.execute(call('search_references', { query: 'collect' }), signal()))
    expect(search.results[0].matchingLines).toContainEqual({ line: 7, text: 'Use collect after forest.' })
    const jump = JSON.parse(await refs.execute(call('read_reference', { path, startLine: 6, lineCount: 2 }), signal()))
    expect(jump.text).toContain('7: Use collect after forest.')
    expect(fetchReference).toHaveBeenCalledTimes(3)
  })

  it('bounds serialized UTF-8 results including escaping, headings and search metadata', async () => {
    const text = '# Details\n' + ('"\\'.repeat(90) + '木'.repeat(40) + '\n').repeat(160)
    const bytes = utf8ToBytes(text)
    const sha = bytesToHex(sha1(concatBytes(utf8ToBytes(`blob ${bytes.length}\0`), bytes)))
    const docPath = 'docs/CUSTOM_CARD_SANDBOX.md'
    const tree = [{ path: docPath, sha, type: 'blob', size: bytes.length }, ...Array.from({ length: 40 }, (_, i) => ({ path: `shared/cards/A/${'Large'.repeat(80)}${i}.ts`, sha, type: 'blob' }))]
    const fetchReference = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ object: { sha: '7'.repeat(40) } }))
      .mockResolvedValueOnce(Response.json({ tree, truncated: false }))
      .mockResolvedValueOnce(new Response(text))
    const refs = await ReferenceSession.createOpener(fetchReference)(signal())
    const read = await refs.execute(call('read_reference', { path: docPath, startLine: 1, lineCount: 160 }), signal())
    expect(utf8ToBytes(read).length).toBeLessThanOrEqual(REFERENCE_LIMITS.resultBytes)
    expect(JSON.parse(read).nextStartLine).toBeLessThan(160)
    const search = await refs.execute(call('search_references', { query: 'Large' }), signal())
    expect(utf8ToBytes(search).length).toBeLessThanOrEqual(REFERENCE_LIMITS.resultBytes)
    expect(JSON.parse(search).totalMatches).toBe(40)
    expect(JSON.parse(search).results.length).toBeLessThan(40)
  })
  it('resolves main for every attempt, pins reads, verifies blobs and labels native code', async () => {
    const first = '1'.repeat(40)
    const second = '2'.repeat(40)
    let main = first
    const fetched: Array<{ url: string; init?: RequestInit }> = []
    const fetchReference: typeof fetch = async (input, init) => {
      const url = String(input); fetched.push({ url, init })
      if (url === '/api/workshop/references/main') return Response.json({ object: { sha: main } })
      if (url.startsWith('/api/workshop/references/tree/')) return Response.json({ truncated: false, tree: [{ path, sha, type: 'blob', size: bytes.length }] })
      return new Response(text)
    }
    const references = await ReferenceSession.createOpener(fetchReference)(signal())
    main = second
    const result = JSON.parse(await references.execute(call('read_reference', { path, startLine: 1, lineCount: 2 }), signal()))
    expect(result).toMatchObject({ commit: first, kind: 'builtin-example: adapt to sandbox', text: '1: // Built-in example\n2: const name = "Frame Builder"' })
    expect(fetched.at(-1)?.url).toContain(`/${first}/`)
    expect(JSON.parse(await references.execute(call('search_references', { query: 'Frame Builder' }), signal())).results[0].path).toBe(path)
    expect((await ReferenceSession.createOpener(fetchReference)(signal())).commit).toBe(second)
    expect(fetched.every(entry => !entry.init?.headers && entry.init?.redirect === 'error')).toBe(true)
    expect(fetched.filter(entry => entry.url.startsWith('/api/workshop/')).every(entry => entry.init?.credentials === 'include')).toBe(true)
    expect(fetched.filter(entry => entry.url.startsWith('https://')).map(entry => ({ url: entry.url, credentials: entry.init?.credentials })))
      .toEqual([{ url: `https://raw.githubusercontent.com/titanxxh/open-agricola/${first}/${path}`, credentials: 'omit' }])
  })

  it('keeps the confirmed commit when tree loading is retried and after its metadata authorization expires', async () => {
    const first = 'ab'.repeat(20)
    const second = 'cd'.repeat(20)
    let mainReads = 0
    let treeFailed = false
    const metadata = vi.fn(async (url: string) => {
      if (url.endsWith('/main')) return Response.json({ object: { sha: ++mainReads === 1 ? first : second } })
      if (!treeFailed) { treeFailed = true; return new Response('', { status: 429, headers: { 'Retry-After': '1' } }) }
      return Response.json({ tree: [{ path, sha, type: 'blob', size: bytes.length }], truncated: false })
    })
    const raw = vi.fn<typeof fetch>().mockResolvedValue(new Response(text))
    vi.stubGlobal('fetch', raw)
    const now = Date.now() - 10_000
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      const io = createBrowserGenerationPorts({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'unused-browser-only' }, metadata)
      await expect(io.openReferences(signal())).rejects.toThrow('429')
      clock.mockReturnValue(now + 1001)
      const references = await io.openReferences(signal())
      expect(references.commit).toBe(first)
      expect(metadata.mock.calls.map(([url]) => url)).toEqual([
        '/api/workshop/references/main', `/api/workshop/references/tree/${first}`, `/api/workshop/references/tree/${first}`,
      ])
      clock.mockReturnValue(now + 7_200_000)
      const result = JSON.parse(await references.execute(call('read_reference', { path, startLine: 1, lineCount: 2 }), signal()))
      expect(result.commit).toBe(first)
      expect(raw.mock.calls[0][0]).toBe(`https://raw.githubusercontent.com/titanxxh/open-agricola/${first}/${path}`)
      expect(metadata).toHaveBeenCalledTimes(3)
    } finally { clock.mockRestore(); vi.unstubAllGlobals() }
  })

  it('never falls back to a cached main when branch resolution fails, and bounds retries', async () => {
    const fetchReference = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }))
    await expect(ReferenceSession.createOpener(fetchReference)(signal())).rejects.toThrow('503')
    expect(fetchReference).toHaveBeenCalledTimes(3)
  })

  it('rejects traversal, arbitrary URLs and incomplete arguments without network requests', async () => {
    const fetchReference = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ object: { sha: '3'.repeat(40) } })).mockResolvedValueOnce(Response.json({ tree: [{ path, sha, type: 'blob' }], truncated: false }))
    const refs = await ReferenceSession.createOpener(fetchReference)(signal())
    expect(allowedReferencePath('shared/cards/../../.env')).toBe(false)
    expect(allowedReferencePath('https://example.com/secret')).toBe(false)
    expect(allowedReferencePath('server/auth.ts')).toBe(false)
    const result = await refs.execute(call('read_reference', { path: '../.env', startLine: 1, lineCount: 1 }), signal())
    expect(JSON.parse(result).error).toBeTruthy()
    await refs.execute({ ...call('read_reference', {}), function: { name: 'read_reference', arguments: '{' } }, signal())
    expect(fetchReference).toHaveBeenCalledTimes(2)
  })

  it('does not return mismatched blobs or silently accept a truncated tree', async () => {
    const fetchReference = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ object: { sha: '4'.repeat(40) } })).mockResolvedValueOnce(Response.json({ tree: [{ path, sha, type: 'blob' }], truncated: false })).mockResolvedValueOnce(new Response('changed data'))
    const refs = await ReferenceSession.createOpener(fetchReference)(signal())
    await expect(refs.execute(call('read_reference', { path, startLine: 1, lineCount: 1 }), signal())).rejects.toThrow('checksum')
    const truncated = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ object: { sha: '5'.repeat(40) } })).mockResolvedValueOnce(Response.json({ tree: [], truncated: true }))
    await expect(ReferenceSession.createOpener(truncated)(signal())).rejects.toThrow('incomplete')
  })
})
