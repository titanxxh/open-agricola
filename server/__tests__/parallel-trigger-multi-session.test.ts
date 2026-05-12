import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

describe('PARALLEL trigger — multi-listener select-trigger loop', () => {
  const setupWorkPhase = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = { ...player.resources, food: 5, wood: 0, clay: 0, reed: 0, stone: 0 }
    player.occupationPlayed = ['C82_HardwareStore', 'C126_Excavator']

    state.players.forEach((p) => {
      p.minorHand = ['__test_placeholder__']
      p.occupationHand = ['__test_placeholder__']
    })

    session.loadState(state)
    return session
  }

  it('emits select-trigger listing both cards + PASS (default optional)', () => {
    const session = setupWorkPhase()
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') {
      throw new Error(`expected wait state, got ${resp.interaction.stateId}`)
    }
    expect(resp.interaction.request.kind).toBe('select-trigger')
    if (resp.interaction.request.kind !== 'select-trigger') return
    const values = resp.interaction.request.options.map((o) => o.value).sort()
    expect(values).toContain('C82_HardwareStore')
    expect(values).toContain('C126_Excavator')
    // Default optional → PASS offered (BGA: PARALLEL trigger ordering choice
    // includes a PASS that skips remaining unresolved optional triggers).
    expect(values).toContain('__pass__')
  })

  it('after picking C82 + skipping its optional, falls back to select-trigger for C126', () => {
    const session = setupWorkPhase()
    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('select-trigger')

    resp = session.resolveChoice(0, 'C82_HardwareStore')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('choice')
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    // Back to select-trigger with only C126 remaining (+ PASS).
    if (resp.interaction.stateId !== 'wait') {
      throw new Error(`expected wait, got ${resp.interaction.stateId}`)
    }
    expect(resp.interaction.request.kind).toBe('select-trigger')
    if (resp.interaction.request.kind !== 'select-trigger') return
    const remaining = resp.interaction.request.options.map((o) => o.value).sort()
    expect(remaining).toContain('C126_Excavator')
    expect(remaining).not.toContain('C82_HardwareStore')
    expect(remaining).toContain('__pass__')
  })

  it('selecting __pass__ closes the loop without firing remaining cards', () => {
    const session = setupWorkPhase()
    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('select-trigger')
    resp = session.resolveChoice(0, '__pass__')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).not.toBe('select-trigger')
    }
    const player = resp.state.players[0]!
    // Neither C82 nor C126 fired — no resources gained.
    expect(player.resources.wood).toBe(0)
    expect(player.resources.clay).toBe(0)
    expect(player.resources.reed).toBe(0)
    expect(player.resources.stone).toBe(0)
  })
})
