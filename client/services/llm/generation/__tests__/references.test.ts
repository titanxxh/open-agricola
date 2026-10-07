import { describe, expect, it, vi } from 'vitest'
import { sha1 } from '@noble/hashes/legacy.js'
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { allowedReferencePath, ReferenceSession } from '../references'
import type { ToolCall } from '../protocol'

const call = (name: string, args: unknown): ToolCall => ({ id: 'call', type: 'function', function: { name, arguments: JSON.stringify(args) } })
const path = 'shared/cards/A/A123_FrameBuilder.ts'
const text = '// Built-in example\nconst name = "Frame Builder"\n'
const bytes = utf8ToBytes(text)
const sha = bytesToHex(sha1(concatBytes(utf8ToBytes(`blob ${bytes.length}\0`), bytes)))
const signal = () => new AbortController().signal

describe('anonymous pinned references', () => {
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
