import { expect, it } from 'vitest'
import { PrereleaseInvalidations } from '../prerelease-invalidations'

it('matches only the invalidated user, grant or token after an operation starts', () => {
  const journal = new PrereleaseInvalidations(), checkpoint = journal.checkpoint()
  journal.record({ kind: 'user', id: 'bob' })
  journal.record({ kind: 'grant', id: 'alice-other-source' })
  journal.record({ kind: 'token', id: 'alice-other-token' })
  expect(journal.changedSince(checkpoint, { userId: 'alice', grantId: 'alice-source', tokenHash: 'alice-token' })).toBe(false)
  expect(journal.changedSince(checkpoint, { userId: 'bob' })).toBe(true)
  expect(journal.changedSince(checkpoint, { userId: 'alice', grantId: 'alice-other-source' })).toBe(true)
  expect(journal.changedSince(checkpoint, { userId: 'alice', tokenHash: 'alice-other-token' })).toBe(true)
  journal.record({ kind: 'user', id: 'alice' })
  expect(journal.changedSince(checkpoint, { userId: 'alice' })).toBe(true)
  expect(journal.changedSince(journal.checkpoint(), { userId: 'alice' })).toBe(false)
})

it('fails closed for an evicted checkpoint while allowing a new operation', () => {
  const journal = new PrereleaseInvalidations(2), stale = journal.checkpoint()
  journal.record({ kind: 'user', id: 'alice' })
  const afterAlice = journal.checkpoint()
  journal.record({ kind: 'user', id: 'bob' })
  journal.record({ kind: 'user', id: 'carol' })
  expect(journal.changedSince(stale, { userId: 'alice' })).toBe(true)
  expect(journal.changedSince(afterAlice, { userId: 'alice' })).toBe(false)
  expect(journal.changedSince(afterAlice, { userId: 'carol' })).toBe(true)
  expect(journal.changedSince(journal.checkpoint(), { userId: 'alice' })).toBe(false)
})

it('retains only the newest occurrence of a repeated scope without fencing another user', () => {
  const journal = new PrereleaseInvalidations(2), checkpoint = journal.checkpoint()
  for (let index = 0; index < 5000; index++) journal.record({ kind: 'user', id: 'bob' })
  expect(journal.changedSince(checkpoint, { userId: 'alice' })).toBe(false)
  expect(journal.changedSince(checkpoint, { userId: 'bob' })).toBe(true)
})
