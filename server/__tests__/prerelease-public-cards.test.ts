import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { canonicalJson } from '../../shared/contract/authoritative-command'
import type { WorkshopPublicCardInput } from '../../shared/contract/workshop-public-cards'
import { FormalPublicCards } from '../prerelease-public-cards'

const input: WorkshopPublicCardInput = {
  protocolVersion: 1,
  source: { kind: 'workshop-public', authority: 'titanxxh/open-agricola', workshopCardId: 'public-card', versionId: 'approved-version' },
  cardJson: { id: 'CUSTOM_Public', name: 'Public', deck: 'CUSTOM', number: 0, desc: ['Gain 2 wood.'], card_type: 'minor' },
  effectCode: null,
  art: { sha256: createHash('sha256').update('image').digest('hex'), contentType: 'image/png', sizeBytes: 5, base64: 'aW1hZ2U=' },
}
const snapshot = { input, sha256: createHash('sha256').update(canonicalJson(input)).digest('hex') }
const status = (now: number, kind: 'current' | 'disabled' = 'current') => ({
  protocolVersion: 1, sha256: snapshot.sha256, checkedAt: now, validUntil: now + 30_000,
  access: kind === 'current' ? { kind, allowNew: true, allowExisting: true } : { kind, allowNew: false, allowExisting: false },
})

it('fetches a fixed public input without forwarding credentials or accepting image/hash substitution', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const client = new FormalPublicCards('https://formal.example.test', async (url, init) => {
    requests.push({ url: String(url), init })
    return Response.json({ ok: true, snapshot, status: status(Date.now()) })
  })
  expect(await client.snapshot('public-card')).toEqual({ snapshot, status: expect.objectContaining({ sha256: snapshot.sha256 }) })
  expect(requests).toEqual([{ url: 'https://formal.example.test/api/workshop/public-cards/v1/cards/public-card', init: expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'error' }) }])
  expect(new Headers(requests[0].init?.headers).get('authorization')).toBeNull()
  expect(new Headers(requests[0].init?.headers).get('cookie')).toBeNull()
  const altered = { ...input, art: { ...input.art!, base64: 'b3RoZXI=' } }
  const corrupt = new FormalPublicCards('https://formal.example.test', async () => Response.json({ ok: true, snapshot: { input: altered, sha256: createHash('sha256').update(canonicalJson(altered)).digest('hex') }, status: status(Date.now()) }))
  await expect(corrupt.snapshot('public-card')).rejects.toThrow()
})

it('keeps the original absolute deadline through failures and rejects a late positive after disable', async () => {
  let now = 1000
  let response: () => Promise<Response> = async () => Response.json({ ok: true, snapshot, status: status(now) })
  const client = new FormalPublicCards('https://formal.example.test', () => response(), { now: () => now, monotonic: () => now })
  const lease = await client.create('public-card')
  expect(lease.authorized()).toBe(true)
  let complete: ((response: Response) => void) | undefined
  response = () => new Promise(resolve => { complete = resolve })
  const older = lease.refresh()
  response = async () => Response.json({ ok: true, ...status(now, 'disabled') })
  await lease.refresh()
  complete?.(Response.json({ ok: true, ...status(now) }))
  await older
  expect(lease.authorized()).toBe(false)
  const active = await client.create('public-card').catch(() => null)
  expect(active).toBeNull()
  response = async () => Response.json({ ok: true, snapshot, status: status(now) })
  const independent = await client.create('public-card')
  response = async () => { throw new Error('offline') }
  now = 30_999
  await independent.refresh().catch(() => {})
  expect(independent.authorized()).toBe(true)
  now = 31_000
  expect(independent.authorized()).toBe(false)
})
