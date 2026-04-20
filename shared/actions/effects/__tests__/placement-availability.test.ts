import { execFileSync } from 'node:child_process'
import { describe, it, expect, afterEach } from 'vitest'
import { GameSession } from '../../../../server/game/authoritative-session'
import { computeAllowedPlacementSpaces } from '../placement-availability'
import { registerCardListener, clearCustomCardListeners } from '../../../cards/card-listeners'
import type { ActionHookPhase } from '../../hooks'

afterEach(() => {
  clearCustomCardListeners()
})

describe('computeAllowedPlacementSpaces', () => {
  it('can be imported by the runtime from place-farmer without module init cycles', () => {
    expect(() =>
      execFileSync(
        'pnpm',
        ['exec', 'tsx', '-e', "import './shared/actions/effects/place-farmer.ts'"],
        {
          cwd: process.cwd(),
          stdio: 'pipe',
        },
      )).not.toThrow()
  })

  it('returns all non-occupied, executable spaces as allowOccupied:false', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const { state } = session.getState()
    const player = state.players[0]!
    const result = computeAllowedPlacementSpaces(state, player)
    expect(result.length).toBeGreaterThan(0)
    for (const entry of result) {
      expect(entry.allowOccupied).toBe(false)
    }
    expect(result.some(e => e.spaceId === 'day-laborer')).toBe(true)
  })

  it('excludes spaces occupied by another player', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const st = session.getState().state
    const space = st.actionSpaces.find(s => s.id === 'day-laborer')!
    space.takenBy = [{ playerId: st.players[1]!.id, workerId: 'w1' }]
    session.loadState(st)
    const { state } = session.getState()
    const player = state.players[0]!
    const result = computeAllowedPlacementSpaces(state, player)
    expect(result.some(e => e.spaceId === 'day-laborer')).toBe(false)
  })

  it('adds occupied spaces when a computeArgs listener emits allow-occupied', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const st = session.getState().state
    const space = st.actionSpaces.find(s => s.id === 'day-laborer')!
    space.takenBy = [{ playerId: st.players[1]!.id, workerId: 'w1' }]
    session.loadState(st)

    registerCardListener({
      id: 'CUSTOM_test-allow-day-laborer',
      phases: ['computeArgs' as ActionHookPhase],
      actions: ['place-farmer'],
      handler: () => ({
        extraOptions: [{ value: 'allow-occupied:day-laborer', labelKey: 'actions.day-laborer.name' }],
      }),
    })

    const { state } = session.getState()
    const player = state.players[0]!
    const result = computeAllowedPlacementSpaces(state, player)
    const entry = result.find(e => e.spaceId === 'day-laborer')
    expect(entry).toBeDefined()
    expect(entry!.allowOccupied).toBe(true)
  })

  it('dedupes: base entry wins over extraOption for the same spaceId', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    registerCardListener({
      id: 'CUSTOM_test-dup-day-laborer',
      phases: ['computeArgs' as ActionHookPhase],
      actions: ['place-farmer'],
      handler: () => ({
        extraOptions: [{ value: 'allow-occupied:day-laborer', labelKey: 'actions.day-laborer.name' }],
      }),
    })

    const { state } = session.getState()
    const player = state.players[0]!
    const result = computeAllowedPlacementSpaces(state, player)
    const entries = result.filter(e => e.spaceId === 'day-laborer')
    expect(entries.length).toBe(1)
    expect(entries[0]!.allowOccupied).toBe(false)
  })

  it('filters extraOption spaces that do not exist', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    registerCardListener({
      id: 'CUSTOM_test-ghost-space',
      phases: ['computeArgs' as ActionHookPhase],
      actions: ['place-farmer'],
      handler: () => ({
        extraOptions: [{ value: 'allow-occupied:does-not-exist', labelKey: 'x' }],
      }),
    })

    const { state } = session.getState()
    const player = state.players[0]!
    const result = computeAllowedPlacementSpaces(state, player)
    expect(result.some(e => e.spaceId === 'does-not-exist')).toBe(false)
  })
})
