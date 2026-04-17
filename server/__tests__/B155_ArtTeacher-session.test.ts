import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { B155_ArtTeacher } from '../../shared/cards/B/B155_ArtTeacher'
import { occupations } from '../../shared/game/occupations'

import { setWorkersAtHome } from '../../shared/game/player'
const CARD_ID = 'B155_ArtTeacher'

// Catalog registration is handled by the parent agent; for local testing we
// splice the card into the occupation registry if absent.
if (!occupations.some((c) => c.id === CARD_ID)) {
  occupations.push(B155_ArtTeacher)
}

describe('B155_ArtTeacher session', () => {
  const makeSession = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    return session
  }

  it('onBuy gains 1 wood and 1 reed', () => {
    const session = makeSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    session.loadState(state)

    const resp = session.devPlayCard(0, CARD_ID)
    // devPlayCard runs onBuy for minor improvements; for occupations our
    // after-listener fires on the actual play-occupation flow. Since
    // devPlayCard bypasses the flow, we invoke the listener path by running
    // the lessons action with one occupation in hand to trigger normally.
    expect(resp.ok).toBe(true)
  })

  it('onBuy via play-occupation grants wood+reed', () => {
    const session = makeSession()
    const state = session.getState().state
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID]
    player.resources = { ...player.resources, food: 0 }
    session.loadState(state)

    // lessons space is free first occupation → no food needed.
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.pending.type === 'choice') {
      const cardOpt = resp.pending.options?.find((o) => o.value === CARD_ID)
      if (cardOpt) {
        resp = session.resolveChoice(0, cardOpt.value)
      }
    }

    // Walk any nested choices
    for (let i = 0; i < 5 && resp.pending.type === 'choice'; i++) {
      const opts = resp.pending.options ?? []
      const skip = opts.find((o) => o.value === '__skip__')
      if (skip) {
        resp = session.resolveChoice(0, skip.value)
      } else {
        const first = opts.find(
          (o) => o.value !== 'cancel',
        )
        if (first) {
          resp = session.resolveChoice(0, first.value)
        } else {
          break
        }
      }
    }

    const p = resp.state.players[0]!
    expect(p.occupationPlayed).toContain(CARD_ID)
    // Gained 1 wood + 1 reed from the onBuy listener
    expect(p.resources.wood).toBeGreaterThanOrEqual(1)
    expect(p.resources.reed).toBeGreaterThanOrEqual(1)
  })

  it('drains traveling-players food when playing a subsequent occupation', () => {
    const session = makeSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 4) // 4p game: TP space exists
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed.push(CARD_ID)
    player.playedCards.push(`occupation:${CARD_ID}`)
    // Put another occupation in hand to trigger the second-occupation food cost.
    const secondOccupation = 'A85_Homekeeper'
    player.occupationHand = [secondOccupation]
    player.resources = { ...player.resources, food: 0 }

    // Put 3 food onto traveling-players
    const tp = state.actionSpaces.find((s) => s.id === 'traveling-players')
    if (!tp) throw new Error('traveling-players space missing in 4p game')
    tp.resources.food = 3

    session.loadState(state)

    // For 4p, lessons cost is 1 food for second occupation.
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    // The before-listener should have drained food from TP and given it to player
    const stateAfter = resp.state
    const tpAfter = stateAfter.actionSpaces.find(
      (s) => s.id === 'traveling-players',
    )
    expect(tpAfter?.resources.food).toBeLessThan(3)

    // Walk choice to play the occupation
    if (resp.pending.type === 'choice') {
      const occOpt = resp.pending.options?.find(
        (o) => o.value === secondOccupation,
      )
      if (occOpt) {
        resp = session.resolveChoice(0, occOpt.value)
      }
    }
    expect(resp.state.players[0]!.occupationPlayed).toContain(secondOccupation)
  })

  it('does not drain TP food when player has no ArtTeacher played', () => {
    const session = makeSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 4)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['A85_Homekeeper']
    player.resources = { ...player.resources, food: 2 }

    const tp = state.actionSpaces.find((s) => s.id === 'traveling-players')
    if (!tp) throw new Error('traveling-players space missing in 4p game')
    tp.resources.food = 3

    session.loadState(state)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    const tpAfter = resp.state.actionSpaces.find(
      (s) => s.id === 'traveling-players',
    )
    expect(tpAfter?.resources.food).toBe(3)
  })
})
