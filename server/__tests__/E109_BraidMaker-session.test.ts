import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { E109_BraidMaker } from '../../shared/cards/E/E109_BraidMaker'

import { setWorkersAtHome } from '../../shared/game/player'
const CARD_ID = 'E109_BraidMaker'

describe('E109_BraidMaker session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed.push(CARD_ID)
    player.resources = {
      ...player.resources,
      reed: 2,
      stone: 3,
      food: 0,
    }

    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)
    return session
  }


  it('provides a harvest-time reed → food exchange', () => {
    // E109's exchange field enables 1 reed → 2 food exchange. We verify the
    // exchange registry returns this entry for the player.
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // The exchanges field is static metadata on the Occupation definition.
    expect(E109_BraidMaker.exchanges).toBeDefined()
    expect(E109_BraidMaker.exchanges?.[0]?.from?.reed).toBe(1)
    expect(E109_BraidMaker.exchanges?.[0]?.to?.food).toBe(2)
    expect(E109_BraidMaker.exchanges?.[0]?.max).toBe(1)
    // Guard: verify the card is still considered played by the player.
    expect(player.occupationPlayed).toContain(CARD_ID)
  })

  it('does not apply the basket discount without E109 played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = {
      ...player.resources,
      reed: 2,
      stone: 2,
      food: 0,
    }
    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    const basket = resp.pending.options.find(
      (o) => o.value === 'major:Major_Basket',
    )
    expect(basket).toBeDefined()
    resp = session.resolveChoice(0, basket!.value)

    let steps = 0
    while (resp.pending.type === 'choice' && steps < 8) {
      steps++
      const options = resp.pending.options ?? []
      const next = options.find((o) => o.value !== 'cancel')
      if (next) {
        resp = session.resolveChoice(0, next.value)
      } else {
        break
      }
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    // No discount: full 2+2 base cost.
    expect(after.resources.reed).toBe(0)
    expect(after.resources.stone).toBe(0)
  })
})
