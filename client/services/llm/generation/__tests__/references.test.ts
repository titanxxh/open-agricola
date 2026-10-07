import { describe, expect, it, vi } from 'vitest'
import { sha1 } from '@noble/hashes/legacy.js'
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { allowedReferencePath, REFERENCE_LIMITS, ReferenceSession } from '../references'
import type { ToolCall } from '../protocol'

const call = (name: string, args: unknown): ToolCall => ({ id: 'call', type: 'function', function: { name, arguments: JSON.stringify(args) } })
const path = 'shared/cards/A/A123_FrameBuilder.ts'
const text = '// Built-in example\nconst name = "Frame Builder"\n'
const bytes = utf8ToBytes(text)
const sha = bytesToHex(sha1(concatBytes(utf8ToBytes(`blob ${bytes.length}\0`), bytes)))
const signal = () => new AbortController().signal

describe('anonymous pinned references', () => {
  it('locates relevant sections and matching lines without requiring sequential document reads', async () => {
    const path = 'docs/CUSTOM_CARD_SANDBOX.md'
    const text = '# Sandbox\nIntro\n```\n## Not a heading\n```\n## Collect listener\nUse collect after forest.\n'
    const bytes = utf8ToBytes(text)
    const sha = bytesToHex(sha1(concatBytes(utf8ToBytes(`blob ${bytes.length}\0`), bytes)))
    const fetchReference = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ object: { sha: '6'.repeat(40) } }))
      .mockResolvedValueOnce(Response.json({ tree: [{ path, sha, type: 'blob', size: bytes.length }], truncated: false }))
      .mockResolvedValueOnce(new Response(text))
    const refs = await ReferenceSession.open(signal(), fetchReference)
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
    const refs = await ReferenceSession.open(signal(), fetchReference)
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
      if (url.includes('/git/ref/heads/main')) return Response.json({ object: { sha: main } })
      if (url.includes('/git/trees/')) return Response.json({ truncated: false, tree: [{ path, sha, type: 'blob', size: bytes.length }] })
      return new Response(text)
    }
    const references = await ReferenceSession.open(signal(), fetchReference)
    main = second
    const result = JSON.parse(await references.execute(call('read_reference', { path, startLine: 1, lineCount: 2 }), signal()))
    expect(result).toMatchObject({ commit: first, kind: 'builtin-example: adapt to sandbox', text: '1: // Built-in example\n2: const name = "Frame Builder"' })
    expect(fetched.at(-1)?.url).toContain(`/${first}/`)
    expect(JSON.parse(await references.execute(call('search_references', { query: 'Frame Builder' }), signal())).results[0].path).toBe(path)
    expect((await ReferenceSession.open(signal(), fetchReference)).commit).toBe(second)
    expect(fetched.every(entry => !entry.init?.headers && entry.init?.credentials === 'omit' && entry.init?.redirect === 'error')).toBe(true)
  })

  it('never falls back to a cached main when branch resolution fails, and bounds retries', async () => {
    const fetchReference = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }))
    await expect(ReferenceSession.open(signal(), fetchReference)).rejects.toThrow('503')
    expect(fetchReference).toHaveBeenCalledTimes(3)
  })

  it('rejects traversal, arbitrary URLs and incomplete arguments without network requests', async () => {
    const fetchReference = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ object: { sha: '3'.repeat(40) } })).mockResolvedValueOnce(Response.json({ tree: [{ path, sha, type: 'blob' }], truncated: false }))
    const refs = await ReferenceSession.open(signal(), fetchReference)
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
    const refs = await ReferenceSession.open(signal(), fetchReference)
    await expect(refs.execute(call('read_reference', { path, startLine: 1, lineCount: 1 }), signal())).rejects.toThrow('checksum')
    const truncated = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ object: { sha: '5'.repeat(40) } })).mockResolvedValueOnce(Response.json({ tree: [], truncated: true }))
    await expect(ReferenceSession.open(signal(), truncated)).rejects.toThrow('incomplete')
  })
})
