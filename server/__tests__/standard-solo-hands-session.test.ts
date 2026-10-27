import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { createOpeningSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const sessions: GameSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

describe('standard solo opening hands', () => {
  const opening = (moor = false, parents = false, draftParents = true) => {
    const session = createOpeningSession({ seed: 42, options: {
      playerCount: 1, soloHandMode: 'choose-7', deckIds: ['A'], enableFarmersOfTheMoor: moor,
      enableParentCards: parents, draftParents,
    }, expected: { phase: 'solo-hand-selection', roundPhase: 'work', interaction: {
      stateId: 'wait', kind: 'solo-hand-selection', playerIndex: 0,
    } } })
    sessions.push(session)
    return session
  }
  it('waits for one complete hand selection before granting any cards', () => {
    const session = createOpeningSession({
      seed: 42,
      options: { playerCount: 1, soloHandMode: 'choose-7', deckIds: ['A'] },
      expected: { phase: 'solo-hand-selection', roundPhase: 'work', interaction: {
        stateId: 'wait', kind: 'solo-hand-selection', playerIndex: 0,
      } },
    })
    sessions.push(session)
    const response = session.getState()
    expect(response.state.players[0]!.occupationHand).toEqual([])
    expect(response.state.players[0]!.minorHand).toEqual([])
    expect(response.state.draft).toBeNull()
    expect(response.interaction).toMatchObject({
      allowedCommands: ['submitSoloHandSelection'], anytimeActions: [],
      request: { kind: 'solo-hand-selection', groups: [
        { kind: 'occupation', keepCount: 7, cardIds: expect.any(Array) },
        { kind: 'minor', keepCount: 7, cardIds: expect.any(Array) },
      ] },
    })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'solo-hand-selection') throw new Error('Expected solo hand selection')
    expect(response.interaction.request.groups.map(group => group.cardIds.length)).toEqual([10, 10])
  })

  it.each([false, true])('commits every group once and excludes all candidates from later draws, Moor=%s', moor => {
    const session = opening(moor)
    const before = session.getState()
    const selection = before.state.soloHandSelection
    if (!selection) throw new Error('Expected candidates')
    expect(selection.groups.map(group => [group.kind, group.cardIds.length, group.keepCount])).toEqual(moor
      ? [['occupation', 10, 7], ['minor', 4, 3], ['moor-minor', 6, 4]]
      : [['occupation', 10, 7], ['minor', 10, 7]])
    const submitted = { groups: selection.groups.map(group => ({ kind: group.kind, cardIds: group.cardIds.slice(0, group.keepCount).toReversed() })) }
    const response = session.submitSoloHandSelection(0, submitted)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.phase).toBe('playing')
    expect(response.state.players[0]!.occupationHand).toEqual(selection.groups[0]!.cardIds.slice(0, 7))
    expect(response.state.players[0]!.minorHand).toEqual(selection.groups.slice(1).flatMap(group => group.cardIds.slice(0, group.keepCount)))
    expect(response.state.soloHandMode).toBe('choose-7')
    expect(response.state.players[0]!.stats.draftHistory).toEqual([])
    expect(response.state.soloHandSelection?.kept?.groups).toEqual(selection.groups.map(group => ({ kind: group.kind, cardIds: group.cardIds.slice(0, group.keepCount) })))
    for (const group of selection.groups) for (const id of group.cardIds) {
      expect(response.state.ordinaryCardDecks.occupation).not.toContain(id)
      expect(response.state.ordinaryCardDecks.minor).not.toContain(id)
    }
    expect(response.state.events.filter(event => event.type === 'action.revealed')).toHaveLength(1)
    expect(response.privateEvents).toContainEqual(expect.objectContaining({ type: 'private.handChanged', reason: 'solo-hand-selected', recipientPlayerId: 'p1' }))
    assertRejectedUnchanged(session, () => session.submitSoloHandSelection(0, submitted))
  })

  it('rejects an invalid complete submission without granting partial hands', () => {
    const session = opening(true)
    const selection = session.getState().state.soloHandSelection
    if (!selection) throw new Error('Expected candidates')
    const valid = { groups: selection.groups.map(group => ({ kind: group.kind, cardIds: group.cardIds.slice(0, group.keepCount) })) }
    const invalid: unknown[] = [
      null, { groups: 'not-an-array' }, { groups: [null, null, null] },
      { groups: valid.groups.slice(0, 2) },
      { groups: [...valid.groups, valid.groups[0]!] },
      { groups: valid.groups.map((group, i) => i === 0 ? { ...group, cardIds: group.cardIds.slice(0, 6) } : group) },
      { groups: valid.groups.map((group, i) => i === 1 ? { ...group, cardIds: [group.cardIds[0]!, group.cardIds[0]!, group.cardIds[2]!] } : group) },
      { groups: valid.groups.map((group, i) => i === 1 ? { ...group, cardIds: [valid.groups[2]!.cardIds[0]!, ...group.cardIds.slice(1)] } : group) },
      { groups: valid.groups.map((group, i) => i === 2 ? { ...group, cardIds: ['unknown', ...group.cardIds.slice(1)] } : group) },
    ]
    const snapshot = JSON.stringify(serializeSessionSnapshot(session.state, session))
    for (const input of invalid) {
      assertRejectedUnchanged(session, () => session.submitSoloHandSelection(0, input))
      expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(snapshot)
      assertRejectedUnchanged(session, () => session.submitSoloHandSelection(0, input))
    }
    assertRejectedUnchanged(session, () => session.submitSoloHandSelection(1, valid))
    assertRejectedUnchanged(session, () => session.takeAction(0, 'forest'))
    expect(session.submitSoloHandSelection(0, valid).ok).toBe(true)
  })

  it('keeps admitted custom cards in the ordinary source while filtering actual solo eligibility', () => {
    const session = createOpeningSession({ seed: 42, options: {
      playerCount: 1, soloHandMode: 'choose-7', enableFarmersOfTheMoor: true,
    }, customCards: [
      { cardType: 'minor', cardJson: { id: 'CUSTOM_SoloMinor', name: 'Solo minor', deck: 'CUSTOM', number: 1, desc: [], players: '1+' } },
      { cardType: 'minor', cardJson: { id: 'CUSTOM_MultiplayerMinor', name: 'Other players', deck: 'CUSTOM', number: 2, desc: [], players: '2+' } },
      { cardType: 'occupation', cardJson: { id: 'CUSTOM_SoloOccupation', name: 'Solo occupation', deck: 'CUSTOM', number: 3, desc: [], players: '1+' } },
    ], expected: { phase: 'solo-hand-selection', roundPhase: 'work', interaction: { stateId: 'wait', kind: 'solo-hand-selection' } } })
    sessions.push(session)
    const allCandidates = session.state.soloHandSelection!.groups.flatMap(group => group.cardIds)
    const allOrdinary = [...allCandidates, ...session.state.ordinaryCardDecks.minor, ...session.state.ordinaryCardDecks.occupation]
    expect(allOrdinary.filter(id => id === 'CUSTOM_SoloMinor')).toHaveLength(1)
    expect(allOrdinary.filter(id => id === 'CUSTOM_SoloOccupation')).toHaveLength(1)
    expect(allOrdinary).not.toContain('CUSTOM_MultiplayerMinor')
    expect(session.state.soloHandSelection!.groups.find(group => group.kind === 'moor-minor')!.cardIds.every(id => id.startsWith('M'))).toBe(true)
    expect(new Set(allCandidates).size).toBe(20)
  })

  it.each([false, true])('restores fixed candidates and advances parents after hands, manual parents=%s', draftParents => {
    const original = opening(true, true, draftParents)
    const before = original.getState()
    expect(before.state.players[0]!.parentCards).toEqual({ mother: null, father: null })
    expect(before.state.events.filter(event => event.type === 'parent.motherScheduled' || event.type === 'action.revealed')).toEqual([])
    expect(original.buildSyncPayload(before, 'p1').state.parentSelection).toBeNull()
    const saved = JSON.parse(JSON.stringify(serializeSessionSnapshot(original.state, original)))
    const restored = new GameSession(rehydrateState(saved))
    sessions.push(restored)
    expect(restored.getState().interaction).toEqual(before.interaction)
    expect(restored.state.soloHandSelection).toEqual(before.state.soloHandSelection)
    const selection = restored.state.soloHandSelection!
    const submission = { groups: selection.groups.map(group => ({ kind: group.kind, cardIds: group.cardIds.slice(0, group.keepCount) })) }
    let response = restored.submitSoloHandSelection(0, submission)
    expect(response.ok, response.error).toBe(true)
    if (draftParents) {
      expect(response.state.phase).toBe('parent-selection')
      expect(response.state.events.filter(event => event.type === 'action.revealed')).toEqual([])
      const candidates = response.state.parentSelection!.candidates.p1!
      response = restored.submitParentSelection(0, { mother: candidates.mother[0]!, father: candidates.father[0]! })
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.phase).toBe('playing')
    expect(response.state.players[0]!.parentCards.mother).not.toBeNull()
    expect(response.state.events.filter(event => event.type === 'parent.motherScheduled')).toHaveLength(1)
    const completed = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(restored.state, restored)))))
    sessions.push(completed)
    expect(completed.getState().interaction).toEqual(response.interaction)
    expect(completed.state.players[0]!.minorHand).toEqual(response.state.players[0]!.minorHand)
    assertRejectedUnchanged(completed, () => completed.submitSoloHandSelection(0, submission))
    expect(completed.state.events.filter(event => event.type === 'parent.motherScheduled')).toHaveLength(1)
  })

  it('keeps candidates and confirmed selection history private to its owner', () => {
    const session = opening(true)
    const selection = session.state.soloHandSelection!
    const allIds = selection.groups.flatMap(group => group.cardIds)
    for (const confirm of [false, true]) {
      if (confirm) expect(session.submitSoloHandSelection(0, { groups: selection.groups.map(group => ({ kind: group.kind, cardIds: group.cardIds.slice(0, group.keepCount) })) }).ok).toBe(true)
      const response = session.getState()
      expect(session.buildSyncPayload(response, 'p1').state.soloHandSelection).toEqual(session.state.soloHandSelection)
      const spectator = session.buildSyncPayload(response, null)
      expect(spectator.state.soloHandSelection).toBeNull()
      for (const id of allIds) expect(JSON.stringify(spectator)).not.toContain(id)
    }
  })

  it.each(Array.from({ length: 16 }, (_, index) => ({
    moor: (index & 1) !== 0, seasons: (index & 2) !== 0, parents: (index & 4) !== 0,
    choose: (index & 8) !== 0,
  })))('opens the real expansion combination $moor/$seasons/$parents, choose=$choose', ({ moor, seasons, parents, choose }) => {
    const session = createOpeningSession({ seed: 42, options: {
      playerCount: 1, deckIds: ['A'], soloHandMode: choose ? 'choose-7' : 'random',
      enableFarmersOfTheMoor: moor, enableThroughTheSeasons: seasons, enableParentCards: parents,
    }, expected: { phase: choose ? 'solo-hand-selection' : parents ? 'parent-selection' : 'playing',
      roundPhase: 'work', interaction: { stateId: choose ? 'wait' : 'idle', ...(choose ? { kind: 'solo-hand-selection' as const } : {}) } } })
    sessions.push(session)
    const response = session.getState()
    expect(response.state.players).toHaveLength(1)
    expect(response.state.players[0]!.occupationHand).toHaveLength(choose ? 0 : 7)
    expect(response.state.players[0]!.minorHand).toHaveLength(choose ? 0 : 7)
    expect(response.state.players[0]!.minorHand.filter(id => id.startsWith('M'))).toHaveLength(choose || !moor ? 0 : 4)
    expect(response.state.draft).toBeNull()
    expect(response.state.soloHandMode).toBe(choose ? 'choose-7' : 'random')
  })
})
