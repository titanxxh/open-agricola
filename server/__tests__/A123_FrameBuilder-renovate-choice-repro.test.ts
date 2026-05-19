import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards-display/A/A123_FrameBuilder'

const CARD_ID = 'A123_FrameBuilder'

describe('A123_FrameBuilder renovation choice repro', () => {
  it('should prompt payment choice when BOTH direct (2 clay + 1 reed) AND bonus (1 wood + 1 reed) are affordable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 6

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.houseType = 'wood'
    owner.rooms = 2
    // User scenario: 2 clay + 1 reed + 4 wood
    // Base cost (wood→clay, 2 rooms) = 2 clay + 1 reed → payable directly
    // FrameBuilder bonus → −2 clay / +1 wood → payable as 1 wood + 1 reed
    // Expectation: player should be prompted to choose one of the two.
    owner.resources = {
      ...owner.resources,
      wood: 4,
      clay: 2,
      stone: 0,
      reed: 1,
    }
    setWorkersAtHome(state, owner, 2)
    session.loadState(state)

    let resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    // Skip the renovation-target choice if presented (wood→clay only option).
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      resp = session.resolveChoice(0, 'clay')
    }

    // After renovation target resolution, we expect a payment-choice pending.
    // Currently (bug): this auto-picks direct path and skips the prompt.
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.options?.length).toBeGreaterThanOrEqual(2)

    // Confirm both options are present.
    type PaymentLabel = {
      resourcesPaid?: Record<string, number>
      sourceCards?: string[]
    }
    const labels = resp.interaction.options?.map(
      (opt) => opt.labelParams as PaymentLabel | undefined,
    )
    const direct = labels.find(
      (l) => (l?.resourcesPaid?.clay ?? 0) === 2 && (l?.resourcesPaid?.wood ?? 0) === 0,
    )
    const bonus = labels.find(
      (l) => (l?.resourcesPaid?.clay ?? 0) === 0 && (l?.resourcesPaid?.wood ?? 0) === 1,
    )
    expect(direct).toBeDefined()
    expect(bonus).toBeDefined()
    // Direct payment didn't use FrameBuilder; bonus payment did.
    expect(direct?.sourceCards ?? []).toEqual([])
    expect(bonus?.sourceCards).toEqual([CARD_ID])
  })
})
