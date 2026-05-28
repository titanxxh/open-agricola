import { describe, expect, it } from 'vitest'
import {
  getGameLoadProgress,
  resolveGameLoadPhase,
  type GameLoadPhase,
} from '../game-load-progress'

describe('getGameLoadProgress', () => {
  const ordered: GameLoadPhase[] = [
    'manifest',
    'appShell',
    'auth',
    'wsConnecting',
    'wsCreating',
    'wsJoining',
    'fetchingState',
    'ready',
  ]

  it('returns monotonically increasing percent for the main funnel', () => {
    let prev = -1
    for (const phase of ordered) {
      const { percent } = getGameLoadProgress(phase)
      expect(percent).toBeGreaterThan(prev)
      prev = percent
    }
    expect(getGameLoadProgress('ready').percent).toBe(100)
  })

  it('maps each phase to a loadStep label key', () => {
    expect(getGameLoadProgress('manifest').labelKey).toBe('platform.loadStep.manifest')
    expect(getGameLoadProgress('fetchingState').labelKey).toBe('platform.loadStep.fetchingState')
  })
})

describe('resolveGameLoadPhase', () => {
  it('prefers manifest before auth', () => {
    expect(resolveGameLoadPhase({ manifestReady: false, authLoading: true })).toBe('manifest')
  })

  it('returns auth when manifest is ready', () => {
    expect(resolveGameLoadPhase({ manifestReady: true, authLoading: true })).toBe('auth')
  })

  it('maps ws phases', () => {
    expect(resolveGameLoadPhase({ wsStatus: { phase: 'connecting' } })).toBe('wsConnecting')
    expect(resolveGameLoadPhase({ wsStatus: { phase: 'creating' } })).toBe('wsCreating')
    expect(resolveGameLoadPhase({ wsStatus: { phase: 'joining', roomId: 'dev2' } })).toBe('wsJoining')
    expect(resolveGameLoadPhase({ wsStatus: { phase: 'ready', roomId: 'dev2', playerIndex: 0 } })).toBe(
      'fetchingState',
    )
  })

  it('returns null for waiting and error', () => {
    expect(
      resolveGameLoadPhase({
        wsStatus: {
          phase: 'waiting',
          roomId: 'r1',
          players: [],
          maxPlayers: 2,
        },
      }),
    ).toBeNull()
    expect(resolveGameLoadPhase({ wsStatus: { phase: 'error', message: 'x' } })).toBeNull()
  })

  it('returns ready when game view is available', () => {
    expect(
      resolveGameLoadPhase({
        wsStatus: { phase: 'ready', roomId: 'dev2', playerIndex: 0 },
        hasGameView: true,
      }),
    ).toBe('ready')
  })
})
