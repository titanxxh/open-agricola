import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'
import { setWorkersAtHome } from '../../shared/domain/player'

const CARD_ID = 'A143_Stonecutter'

// Touch the import so the listener side-effect remains referenced.
void A143_Stonecutter

describe('A143_Stonecutter session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 2,
      stone: 2,
      food: 0,
    }
    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    // Placeholder ids in BOTH players' hands: random minors dealt by
    // `new GameSession()` are non-deterministic across runs, which makes
    // `improvement-any` option counts flaky. Placeholder ids resolve to
    // undefined in `getMinorImprovement` and get filtered out of buyable
    // options, so only Major improvements remain as candidates.
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)
    return session
  }

  it('reduces Major improvement stone cost by 1', () => {
    const session = setup()
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    const option = resp.interaction.options?.find((entry) =>
      Array.isArray(entry.labelParams.sourceCards)
        && entry.labelParams.sourceCards.includes(CARD_ID),
    )
    expect(option).toBeDefined()

    resp = session.resolveChoice(0, option!.value)

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    expect(after.resources.reed).toBe(0)
    expect(after.resources.stone).toBe(1)
  })
})
