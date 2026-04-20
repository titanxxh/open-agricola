import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/C/C51_FishingNet'

describe('C51_FishingNet session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex

    const owner = state.players[0]!
    owner.minorPlayed.push('C51_FishingNet')

    // Ensure fishing space has some accumulated food
    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishingSpace) throw new Error('fishing space missing')
    fishingSpace.resources.food = 2

    session.loadState(state)
    return session
  }

  it('card owner gains 1 food when opponent uses fishing', () => {
    const session = setup(1)
    const s = session.getState().state
    const ownerFoodBefore = s.players[0]!.resources.food

    // Opponent (p1) uses fishing
    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)

    // Walk through any pending states
    let safety = 20
    while (resp.pending.type === 'confirmPlayerSwitch' || resp.pending.type === 'confirmNextPlayer') {
      if (--safety <= 0) break
      if (resp.pending.type === 'confirmPlayerSwitch') {
        resp = session.confirmPlayerSwitch()
      } else {
        resp = session.confirmNextPlayer()
      }
    }

    const after = session.getState().state
    // Card owner should have gained 1 food
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore + 1)
  })

  it('card is flagged after opponent uses fishing', () => {
    const session = setup(1)

    // Opponent (p1) uses fishing
    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)

    // Walk through pending player switches
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    // Card should be flagged on the owner
    expect(after.players[0]!.cardStates?.C51_FishingNet?.flagged).toBe(true)
  })

  it('2 food placed on fishing space during return-home phase', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.minorPlayed.push('C51_FishingNet')

    // Each player has 1 worker
    state.players.forEach((p) => {
      setActiveWorkerCount(p, 1)
      setWorkersAtHome(state, p, 1)
      p.resources.food = 10
    })

    // Fishing space has 2 accumulated food
    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')!
    fishingSpace.resources.food = 2

    session.loadState(state)

    // Opponent (p1) uses fishing — collects 2 food, card triggers: owner gains 1 food + card flagged
    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)

    // Walk through all pending states until stable
    let safety = 20
    while (resp.pending.type === 'confirmPlayerSwitch' || resp.pending.type === 'confirmNextPlayer') {
      if (--safety <= 0) break
      if (resp.pending.type === 'confirmPlayerSwitch') {
        resp = session.confirmPlayerSwitch()
      } else {
        resp = session.confirmNextPlayer()
      }
    }

    // Owner uses day-laborer
    resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    // Walk through all pending states (round end should happen automatically)
    safety = 20
    while (resp.pending.type === 'confirmPlayerSwitch' || resp.pending.type === 'confirmNextPlayer') {
      if (--safety <= 0) break
      if (resp.pending.type === 'confirmPlayerSwitch') {
        resp = session.confirmPlayerSwitch()
      } else {
        resp = session.confirmNextPlayer()
      }
    }

    const after = session.getState().state
    const afterFishing = after.actionSpaces.find((s) => s.id === 'fishing')!
    // Fishing space: was 2, opponent collected it (→ 0), onReturnHome adds +2 (→ 2),
    // round growth adds +1 for new round (→ 3)
    expect(afterFishing.resources.food).toBe(3)
    // Card should be unflagged after return-home
    expect(after.players[0]!.cardStates?.C51_FishingNet?.flagged).toBe(false)
  })

  it('no trigger when owner uses fishing themselves', () => {
    const session = setup(0)
    const s = session.getState().state
    const ownerFoodBefore = s.players[0]!.resources.food
    const fishingSpace = s.actionSpaces.find((sp) => sp.id === 'fishing')!
    const fishingFoodBefore = fishingSpace.resources.food

    // Owner (p0) uses fishing — opponent scope should NOT trigger
    let resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)

    // Walk through any pending player switches (there should be none for this card)
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }

    const after = session.getState().state
    // Owner gains food from the fishing space itself (accumulated 2 food)
    // But should NOT gain the extra 1 food from FishingNet (opponent scope only)
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore + fishingFoodBefore)
    // Card should not be flagged
    expect(after.players[0]!.cardStates?.C51_FishingNet?.flagged).toBeFalsy()
  })

  it('no extra food on fishing space when card is not flagged during return-home', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const owner = state.players[0]!
    owner.minorPlayed.push('C51_FishingNet')

    // All workers used, ready for round end
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 2)
      p.resources.food = 10
    })

    // fishing space food before round end
    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')!
    fishingSpace.resources.food = 0

    session.loadState(state)
    const resp = session.performRoundEnd()

    // After round end, fishing space should have accumulated food for next round but no extra from card
    const afterFishing = resp.state.actionSpaces.find((s) => s.id === 'fishing')!
    // Fishing accumulates 1 food per round. Round 1 → round 2 start adds 1 food.
    // No extra 2 food because card was not flagged.
    expect(afterFishing.resources.food).toBe(1)
  })
})
