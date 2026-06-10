import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A75_LumberMill } from '../../shared/cards/A/A75_LumberMill'
import { setWorkersAtHome } from '../../shared/domain/player'

const CARD_ID = 'A75_LumberMill'

// Touch the import so the listener side-effect remains referenced.
void A75_LumberMill

describe('A75_LumberMill session', () => {
  const setup = (resources: Partial<Record<string, number>>) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      ...resources,
    }
    state.availableMajorImprovements = ['Major_Joinery']
    // Placeholder hands keep improvement option counts deterministic
    // (see CLAUDE.md Common Pitfalls).
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)
    return session
  }

  // Mandatory closure transform (ADR 0004): the printed {wood:2, stone:2}
  // row is never offered — Mandatory Saturation hides it, the player can
  // only pay the discounted {wood:1, stone:2}.
  it('discounts Joinery by 1 wood and never offers the printed cost', () => {
    const session = setup({ wood: 2, stone: 2 })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
      const options = resp.interaction.options ?? []
      const printed = options.find((entry) =>
        (entry.labelParams?.resourcesPaid as Record<string, number>)?.wood === 2,
      )
      expect(printed).toBeUndefined()
      const discounted = options.find((entry) =>
        (entry.labelParams?.resourcesPaid as Record<string, number>)?.wood === 1,
      )
      expect(discounted).toBeDefined()
      resp = session.resolveChoice(0, discounted!.value)
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Joinery')
    expect(after.resources.wood).toBe(1)
    expect(after.resources.stone).toBe(0)
  })

  // With exactly the discounted cost on hand the purchase resolves without
  // a payment wait: the closure leaves a single affordable candidate.
  it('auto-resolves payment when only the discounted candidate is affordable', () => {
    const session = setup({ wood: 1, stone: 2 })
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Joinery')
    expect(after.resources.wood).toBe(0)
    expect(after.resources.stone).toBe(0)
  })
})
