import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { assertSessionFixture, createOpeningSession, createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
const keep = (session: GameSession) => { sessions.push(session); return session }
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })

describe('explicit session fixtures', () => {
  it.each([{ seed: 12, owner: 0 }, { seed: 9, owner: 1 }])('keeps the real opening offer for seat $owner', ({ seed, owner }) => {
    const session = keep(createOpeningSession({
      seed, options: { deckIds: ['E'] },
      expected: { phase: 'playing', roundPhase: 'preparation', interaction: { stateId: 'wait', kind: 'choice', playerIndex: owner } },
    }))
    expect(session.state.players[owner]!.occupationHand).toContain('E096_Elder')
    expect(session.takeAction(0, 'forest')).toMatchObject({ ok: false, error: 'interaction in progress' })
    expect(session.resolveChoice(owner, '__skip__').ok).toBe(true)
    expect(session.takeAction(0, 'forest').ok).toBe(true)
    expect(session.state.actionSpaces.find(space => space.id === 'forest')!.takenBy).toHaveLength(1)
  })

  it('rejects an incorrect opening expectation instead of skipping a choice', () => {
    expect(() => createOpeningSession({
      seed: 9, options: { deckIds: ['E'] },
      expected: { phase: 'playing', roundPhase: 'preparation', interaction: { stateId: 'idle' } },
    })).toThrow('Unexpected fixture interaction')
  })

  it.each([
    { options: { draftMode: 'simultaneous' as const, draftPoolSize: 7 }, phase: 'draft' as const },
    { options: { enableParentCards: true }, phase: 'parent-selection' as const },
  ])('preserves $phase and deterministic setup streams', ({ options, phase }) => {
    const make = () => keep(createOpeningSession({
      seed: 42, options,
      expected: { phase, roundPhase: 'work', interaction: { stateId: 'idle' } },
    }))
    const first = make(), second = make()
    expect(second.state).toEqual(first.state)
  })

  it('uses random seeds only when explicitly requested', () => {
    const session = keep(createOpeningSession({
      seed: 'random', options: { deckIds: ['A'] },
      expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } },
    }))
    expect(session.state.gameSeed).toMatch(/^[a-f0-9]{32}$/)
    expect(() => createWorkSession({ seed: NaN })).toThrow('finite seed')
    expect(() => createWorkSession({ options: { ordinaryCardDeckSeed: NaN } })).toThrow('finite deck and parent seeds')
  })

  it('prepares work hands before loading even when the deal would contain Elder', () => {
    const session = keep(createWorkSession({
      seed: 9, options: { deckIds: ['E'] },
      configure: state => { state.players[0]!.resources.wood = 2 },
    }))
    expect(session.state.players).toHaveLength(2)
    for (const player of session.state.players) {
      expect(player.minorHand).toEqual(['__test_placeholder__'])
      expect(player.occupationHand).toEqual(['__test_placeholder__'])
    }
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(5)
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.takenBy).toHaveLength(1)
    expect(response.state.log.some(entry => entry.key === 'log.playOccupation')).toBe(false)
  })

  it('keeps explicitly configured hands without replaying opening hooks', () => {
    const session = keep(createWorkSession({
      configure: state => { state.players[0]!.occupationHand = ['E096_Elder'] },
    }))
    assertSessionFixture(session, {
      phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' },
      hands: [
        { minorHand: ['__test_placeholder__'], occupationHand: ['E096_Elder'] },
        { minorHand: ['__test_placeholder__'], occupationHand: ['__test_placeholder__'] },
      ],
    })
    expect(session.takeAction(0, 'lessons').ok).toBe(true)
    expect(session.state.players[0]!.occupationPlayed).toContain('E096_Elder')
  })

  it('rejects unfinished setup and empty hands in work fixtures', () => {
    expect(() => createWorkSession({ options: { enableParentCards: true } })).toThrow('Use createOpeningSession')
    expect(() => createWorkSession({ options: { enableParentCards: true, draftParents: false } })).toThrow('Use createOpeningSession')
    expect(() => createWorkSession({ configure: state => { state.players[1]!.minorHand = [] } })).toThrow('__test_placeholder__')
    expect(() => createWorkSession({ configure: state => { state.roundPhase = 'preparation' } })).toThrow('must start in work')
  })
})
