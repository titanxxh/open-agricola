import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { C95_BasketWeaver } from '../../shared/cards/C/C95_BasketWeaver'
import { occupations } from '../../shared/game/occupations'

import { setWorkersAtHome } from '../../shared/game/player'
const CARD_ID = 'C95_BasketWeaver'

// Catalog registration is handled by the parent agent; for local testing we
// splice the card into the occupation registry if absent.
if (!occupations.some((c) => c.id === CARD_ID)) {
  occupations.push(C95_BasketWeaver)
}

describe('C95_BasketWeaver session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2) // Add a second occupation to avoid auto-selection
    player.occupationHand = [CARD_ID, 'A85_Homekeeper']
    player.resources = { ...player.resources, food: 5, reed: 2, stone: 2 }

    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.pending.type === 'choice') {
      const opt = resp.pending.options?.find((o) => o.value === CARD_ID)
      expect(opt).toBeDefined()
      return session.resolveChoice(0, opt!.value)
    }
    return resp
  }

  it('offers Basketmakers Workshop purchase at discount after playing', () => {
    const session = setup()
    let resp = playOccupation(session)
    // Card should now be in occupationPlayed; offer basket purchase
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)

    // Find and take the basket purchase option
    let steps = 0
    let bought = false
    while (resp.pending.type === 'choice' && steps < 10) {
      steps++
      const options = resp.pending.options ?? []
      const basket = options.find(
        (o) => o.value === 'major:Major_Basket' || o.value === 'Major_Basket',
      )
      if (basket && !bought) {
        resp = session.resolveChoice(0, basket.value)
        bought = true
        continue
      }
      const next = options.find(
        (o) => o.value !== '__skip__' && o.value !== 'cancel',
      )
      if (next) {
        resp = session.resolveChoice(0, next.value)
      } else {
        break
      }
    }

    const player = resp.state.players[0]!
    expect(player.improvements).toContain('Major_Basket')
    // Discount: cost is 1 reed + 1 stone instead of 2+2
    expect(player.resources.reed).toBe(1)
    expect(player.resources.stone).toBe(1)
  })

  it('allows skipping the optional basket purchase', () => {
    const session = setup()
    let resp = playOccupation(session)
    // Skip the optional improvement
    let steps = 0
    while (resp.pending.type === 'choice' && steps < 10) {
      steps++
      const options = resp.pending.options ?? []
      const skip = options.find((o) => o.value === '__skip__')
      if (skip) {
        resp = session.resolveChoice(0, skip.value)
      } else {
        break
      }
    }
    const player = resp.state.players[0]!
    expect(player.occupationPlayed).toContain(CARD_ID)
    expect(player.improvements).not.toContain('Major_Basket')
  })
})
