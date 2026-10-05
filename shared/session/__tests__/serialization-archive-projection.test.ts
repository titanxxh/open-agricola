import { describe, expect, it } from 'vitest'
import type { GameEvent, PublicEventArchiveCanceledPacket, PublicEventArchiveCommittedPacket } from '../../contract/events'
import { getHistoryRecordIdentity, registerHistoryRecordIdentity } from '../../projections/history-record-identity'
import { createInitialState } from '../state-bootstrap'
import { filterSerializedStateForPlayer, serializeState } from '../serialization'

// Public projection seam: no rule/card mocks. Explicit hands keep every viewer
// deterministic; existing serialization-filter tests cover undo id/seq reuse.
const setup = () => {
  const state = createInitialState(42, { playerCount: 2 })
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const event: GameEvent = {
    schemaVersion: 1, id: 'visible', seq: 7, round: state.round, phase: state.roundPhase,
    type: 'resource.moved', visibility: 'public', actorPlayerId: 'p1',
    resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' }, reason: 'gain',
  }
  const committed: PublicEventArchiveCommittedPacket = {
    schemaVersion: 1, id: 'commit-12', packetSeq: 12, type: 'publicEvents.committed',
    eventIds: ['visible'], eventSeqs: [7], firstEventSeq: 7, lastEventSeq: 7,
  }
  const canceled: PublicEventArchiveCanceledPacket = {
    schemaVersion: 1, id: 'cancel-13', packetSeq: 13, type: 'publicEvents.canceled', reason: 'undoAction',
    previousMaxSeq: 7, nextMaxSeq: 6,
    canceledEventIds: ['visible'], canceledSeqs: [7], canceledEvents: [event],
  }
  state.events = []
  state.nextEventSeq = 7
  state.publicEventArchive = [committed, canceled]
  state.nextPublicEventArchivePacketSeq = 14
  registerHistoryRecordIdentity(committed, { recordId: 'archive-commit', operationGroupId: 'operation-1', participantRoles: {} })
  registerHistoryRecordIdentity(canceled, { recordId: 'archive-cancel', operationGroupId: 'operation-2', participantRoles: {} })
  return { base: serializeState(state, {}), event, committed, canceled }
}

describe('viewer archive projection', () => {
  it('reuses unchanged committed and canceled packets while keeping output arrays independent', () => {
    const { base, committed, canceled } = setup()
    const before = JSON.stringify(base)
    const projected = filterSerializedStateForPlayer(base, 'p1')

    expect(projected.publicEventArchive).not.toBe(base.publicEventArchive)
    expect(projected.events).not.toBe(base.events)
    expect(projected.publicEventArchive).toEqual([committed, canceled])
    expect.soft(projected.publicEventArchive[0]).toBe(committed)
    expect.soft(projected.publicEventArchive[1]).toBe(canceled)
    expect(getHistoryRecordIdentity(projected.publicEventArchive[0]!)).toBe(getHistoryRecordIdentity(committed))
    expect(getHistoryRecordIdentity(projected.publicEventArchive[1]!)).toBe(getHistoryRecordIdentity(canceled))
    expect(projected.nextEventSeq).toBe(7)
    expect(projected.nextPublicEventArchivePacketSeq).toBe(14)

    // Both sides own their array containers, even when the source is mutable.
    projected.publicEventArchive.pop()
    projected.events.push(canceled.canceledEvents[0]!)
    expect(JSON.stringify(base)).toBe(before)
    base.publicEventArchive.push(committed)
    expect(projected.publicEventArchive).toHaveLength(1)
    expect(base.publicEventArchive).toHaveLength(3)
  })

  it('still normalizes mismatched packet fields and drops empty packets without hidden events', () => {
    const { base, event, committed, canceled } = setup()
    committed.firstEventSeq = 99
    committed.lastEventSeq = 100
    canceled.canceledEventIds = ['wrong-id']
    canceled.canceledSeqs = [123]
    base.publicEventArchive.push(
      { ...committed, id: 'empty-commit', packetSeq: 14, eventIds: [], eventSeqs: [] },
      { ...canceled, id: 'empty-cancel', packetSeq: 15, canceledEvents: [] },
    )
    const before = JSON.stringify(base)
    const projected = filterSerializedStateForPlayer(base, 'p1')

    expect(projected.publicEventArchive).toEqual([
      { ...committed, firstEventSeq: 7, lastEventSeq: 7 },
      { ...canceled, canceledEventIds: ['visible'], canceledSeqs: [7], canceledEvents: [event] },
    ])
    expect(projected.publicEventArchive[0]).not.toBe(committed)
    expect(projected.publicEventArchive[1]).not.toBe(canceled)
    expect(getHistoryRecordIdentity(projected.publicEventArchive[0]!)).toBe(getHistoryRecordIdentity(committed))
    expect(getHistoryRecordIdentity(projected.publicEventArchive[1]!)).toBe(getHistoryRecordIdentity(canceled))
    expect(JSON.stringify(base)).toBe(before)
  })

  it('rechecks mutable packet fields on a later projection', () => {
    const { base, committed, canceled } = setup()
    const initial = filterSerializedStateForPlayer(base, 'p1')
    expect(initial.publicEventArchive[0]).toMatchObject({ firstEventSeq: 7, lastEventSeq: 7 })

    committed.eventSeqs[0] = 8
    canceled.canceledEvents[0]!.seq = 8
    const changed = filterSerializedStateForPlayer(base, 'p1')
    expect(changed.publicEventArchive).toEqual([
      { ...committed, firstEventSeq: 8, lastEventSeq: 8 },
      { ...canceled, canceledSeqs: [8] },
    ])
    expect(changed.publicEventArchive[0]).not.toBe(committed)
    expect(changed.publicEventArchive[1]).not.toBe(canceled)
    expect(committed.firstEventSeq).toBe(7)
    expect(canceled.canceledSeqs).toEqual([7])
  })

  it.each(['committed seqs', 'canceled ids', 'canceled seqs'])('removes trailing %s instead of reusing malformed packets', (field) => {
    const { base, committed, canceled } = setup()
    if (field === 'committed seqs') committed.eventSeqs.push(8)
    if (field === 'canceled ids') canceled.canceledEventIds.push('trailing')
    if (field === 'canceled seqs') canceled.canceledSeqs.push(8)
    const projected = filterSerializedStateForPlayer(base, 'p1')

    expect(projected.publicEventArchive).toEqual([
      { ...committed, eventSeqs: [7] },
      { ...canceled, canceledEventIds: ['visible'], canceledSeqs: [7] },
    ])
    const changedIndex = field === 'committed seqs' ? 0 : 1
    expect(projected.publicEventArchive[changedIndex]).not.toBe(base.publicEventArchive[changedIndex])
  })

  it('rechecks current hands when the same event and archive references become public and hidden again', () => {
    const { base, event } = setup()
    const owner = base.players[1]!
    owner.minorHand = ['D036_BreedRegistry']
    const hidden: GameEvent = {
      schemaVersion: 1, id: 'hidden-card', seq: 10, round: base.round, phase: base.roundPhase,
      type: 'card.stateChanged', visibility: 'public', targetPlayerId: owner.id,
      cardId: 'D036_BreedRegistry', key: 'stored', value: 1,
    }
    const visible: GameEvent = { ...event, seq: 11 }
    const packet: PublicEventArchiveCommittedPacket = {
      schemaVersion: 1, id: 'commit-27', packetSeq: 27, type: 'publicEvents.committed',
      eventIds: ['hidden-card', 'visible'], eventSeqs: [10, 11], firstEventSeq: 10, lastEventSeq: 11,
    }
    base.events = [hidden, visible]
    base.nextEventSeq = 12
    base.publicEventArchive = [packet]
    base.nextPublicEventArchivePacketSeq = 28

    const privateView = filterSerializedStateForPlayer(base, 'p1')
    expect(privateView.events).toEqual([{ ...visible, seq: 1 }])
    expect(privateView.publicEventArchive).toEqual([{
      schemaVersion: 1, id: '1', packetSeq: 1, type: 'publicEvents.committed',
      eventIds: ['visible'], eventSeqs: [1], firstEventSeq: 1, lastEventSeq: 1,
    }])
    expect(privateView.nextEventSeq).toBe(2)
    expect(privateView.nextPublicEventArchivePacketSeq).toBe(2)
    expect(filterSerializedStateForPlayer(base, owner.id).publicEventArchive).toEqual([packet])

    owner.minorHand = ['__test_placeholder__']
    owner.minorPlayed = ['D036_BreedRegistry']
    const publicView = filterSerializedStateForPlayer(base, 'p1')
    expect(publicView.events).toEqual([hidden, visible])
    expect(publicView.publicEventArchive).toEqual([packet])
    expect(publicView.nextEventSeq).toBe(12)
    expect(publicView.nextPublicEventArchivePacketSeq).toBe(28)

    owner.minorHand = ['D036_BreedRegistry']
    owner.minorPlayed = []
    const hiddenAgain = filterSerializedStateForPlayer(base, 'p1')
    expect(hiddenAgain.events).toEqual(privateView.events)
    expect(hiddenAgain.publicEventArchive).toEqual(privateView.publicEventArchive)
    expect(base.events).toEqual([hidden, visible])
    expect(base.publicEventArchive).toEqual([packet])
  })
})
