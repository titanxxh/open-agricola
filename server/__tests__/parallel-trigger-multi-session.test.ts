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

  it('emits select-trigger with 2 cards + pass when two interactive listeners match', () => {
    const session = setupWorkPhase()
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') {
      throw new Error(`expected wait state, got ${resp.interaction.stateId}`)
    }
    expect(resp.interaction.request.kind).toBe('select-trigger')
    if (resp.interaction.request.kind !== 'select-trigger') {
      throw new Error(`expected select-trigger, got ${resp.interaction.request.kind}`)
    }
    const values = resp.interaction.request.options.map((o) => o.value).sort()
    expect(values).toContain('C82_HardwareStore')
    expect(values).toContain('C126_Excavator')
    expect(values).toContain('__pass__')
  })

  it('resolving a card removes it from select-trigger remaining; pass closes the loop', () => {
    const session = setupWorkPhase()
    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('select-trigger')

    resp = session.resolveChoice(0, 'C82_HardwareStore')
    expect(resp.ok).toBe(true)

    while (
      resp.interaction.stateId === 'wait' &&
      resp.interaction.request.kind === 'choice'
    ) {
      const skipOption = resp.interaction.request.options.find((o) => o.value === '__skip__')
      if (!skipOption) break
      resp = session.resolveChoice(0, '__skip__')
    }

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') {
      throw new Error(`expected wait after C82 skip, got ${resp.interaction.stateId}`)
    }
    expect(resp.interaction.request.kind).toBe('select-trigger')
    if (resp.interaction.request.kind !== 'select-trigger') {
      throw new Error(`expected select-trigger with remaining options, got ${resp.interaction.request.kind}: ${JSON.stringify(resp.interaction)}`)
    }
    const remaining = resp.interaction.request.options.map((o) => o.value).sort()
    expect(remaining).toContain('C126_Excavator')
    expect(remaining).not.toContain('C82_HardwareStore')
    expect(remaining).toContain('__pass__')

    resp = session.resolveChoice(0, '__pass__')
    expect(resp.ok).toBe(true)
    // PARALLEL fully resolved; no further select-trigger pending.
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).not.toBe('select-trigger')
    }
  })

  it('selecting __pass__ immediately closes the loop without firing either card', () => {
    const session = setupWorkPhase()
    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, '__pass__')
    expect(resp.ok).toBe(true)
    // PARALLEL fully resolved without firing either card; no select-trigger pending.
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).not.toBe('select-trigger')
    }

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(player.resources.clay).toBe(0)
    expect(player.resources.reed).toBe(0)
    expect(player.resources.stone).toBe(0)
  })
})
