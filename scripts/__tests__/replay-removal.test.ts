import { describe, expect, it } from 'vitest'
import { parseReplayRemovalArgs } from '../replay-removal.ts'

describe('replay removal CLI', () => {
  it('requires one exact Room ID and a tombstone reason', () => {
    expect(parseReplayRemovalArgs([
      'remove',
      '--room-id',
      'room-one',
      '--reason',
      'moderation',
      '--dry-run',
    ])).toEqual({
      command: 'remove',
      roomId: 'room-one',
      reason: 'moderation',
      dryRun: true,
    })
    expect(() => parseReplayRemovalArgs([
      'remove',
      '--room-id',
      '*',
      '--reason',
      'moderation',
    ])).toThrow('invalid room id')
    expect(() => parseReplayRemovalArgs([
      'remove',
      '--room-id',
      'room-one',
    ])).toThrow('missing --reason')
  })

  it('accepts only a valid optional content-addressed asset', () => {
    expect(parseReplayRemovalArgs([
      'remove',
      '--room-id',
      'room-one',
      '--reason',
      'legal',
      '--asset-hash',
      'a'.repeat(64),
    ])).toMatchObject({
      command: 'remove',
      assetHash: 'a'.repeat(64),
    })
    expect(() => parseReplayRemovalArgs([
      'remove',
      '--room-id',
      'room-one',
      '--reason',
      'legal',
      '--asset-hash',
      'all',
    ])).toThrow('invalid replay asset hash')
  })

  it('keeps ledger replay as a separate no-target command', () => {
    expect(parseReplayRemovalArgs(['apply-ledger'])).toEqual({
      command: 'apply-ledger',
    })
    expect(() => parseReplayRemovalArgs([
      'apply-ledger',
      '--room-id',
      'room-one',
    ])).toThrow('unexpected argument')
  })
})
