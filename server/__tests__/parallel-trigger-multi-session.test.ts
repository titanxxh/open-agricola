import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

describe('PARALLEL trigger — multi-listener select-trigger loop', () => {
  const setupWorkPhase = (playedCards = ['C82_HardwareStore', 'C126_Excavator']) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = { ...player.resources, food: 5, wood: 0, clay: 0, reed: 0, stone: 0 }
    player.occupationPlayed = playedCards

    state.players.forEach((p) => {
      p.minorHand = ['__test_placeholder__']
      p.occupationHand = ['__test_placeholder__']
    })

    session.loadState(state)
    return session
  }

  it('skips a lone no-op select trigger without surfacing a pass-only prompt', () => {
    const session = setupWorkPhase(['C82_HardwareStore'])
    const resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionSelectTrigger')
  })

  it('skips multiple no-op select triggers without surfacing a pass-only prompt', () => {
    const session = setupWorkPhase()
    const resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionSelectTrigger')
  })

  it('emits select-trigger listing both cards with disabled PASS because C126 is mandatory', () => {
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
    // C126 is mandatory (BGA: wood+clay must fire) → PASS remains visible but
    // disabled so the player can see why the trigger cannot be skipped.
    expect(values).toContain('__pass__')
    expect(resp.interaction.request.options.find((option) => option.value === '__pass__')?.disabled).toBe(true)
  })

  it('after picking C82 + skipping its optional, only C126 remains and it is mandatory', () => {
    const session = setupWorkPhase()
    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('select-trigger')

    resp = session.resolveChoice(0, 'C82_HardwareStore')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('choice')
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)

    // C126 is mandatory + single-remaining → engine auto-advances directly
    // into its inner optional pay choice (no select-trigger UI for 1 forced
    // option, no PASS available).
    if (resp.interaction.stateId !== 'wait') {
      throw new Error(`expected wait, got ${resp.interaction.stateId}`)
    }
    if (resp.interaction.request.kind === 'select-trigger') {
      const remaining = resp.interaction.request.options.map((o) => o.value)
      expect(remaining).toContain('C126_Excavator')
      expect(remaining).not.toContain('C82_HardwareStore')
      expect(remaining).toContain('__pass__')
      expect(resp.interaction.request.options.find((option) => option.value === '__pass__')?.disabled).toBe(true)
    } else {
      // Auto-advanced into C126's inner optional pay-for-stone choice.
      expect(resp.interaction.request.kind).toBe('choice')
    }
  })

  it('rejects __pass__ when at least one remaining trigger is mandatory', () => {
    const session = setupWorkPhase()
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('select-trigger')

    // PASS is offered disabled (C126 mandatory) — resolving it must fail at
    // the session layer.
    const r2 = session.resolveChoice(0, '__pass__')
    expect(r2.ok).toBe(false)
  })
})
