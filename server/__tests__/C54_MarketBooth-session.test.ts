import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getFenceCount } from '../../shared/actions/effects/fencing'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getRegisteredMinorImprovement } from '../../shared/cards/types'
import { markAllWorkersUsed } from '../../shared/game/player'
import type { ActionChoiceOption } from '../../shared/contract/types'

import '../../shared/cards/C/C54_MarketBooth'

const CARD_ID = 'C54_MarketBooth'

const setupForHarvestField = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4 // harvest round (field phase yields)

  // Make every farmer used so harvest immediately enters end-of-round flow.
  state.players.forEach((p) => {
    markAllWorkersUsed(state, p)
    p.resources.food = 100 // plenty for feeding; we measure deltas
  })

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.resources.grain = 1
  // Add 1 fence segment so the card can consume it.
  player.fenceSegments.push({ edge: '__fence_test', type: 'fence' })

  // No fields with grain — keep harvest reap deterministic.
  player.fields = []

  session.loadState(state)
  return session
}

const drainPending = (session: GameSession, accept: boolean) => {
  let resp = session.performRoundEnd()
  let safety = 30
  while (safety-- > 0 && resp.interaction.stateId === 'wait') {
    if (resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
    } else {
      const opts = resp.interaction.options ?? []
      // Optional SEQ surfaces as 2-option choice: [actionNode, __skip__].
      // Accepting picks the non-skip option; declining picks __skip__.
      const skipOpt = opts.find((o: ActionChoiceOption) => o.value === '__skip__')
      const nonSkip = opts.find((o: ActionChoiceOption) => o.value !== '__skip__')
      const target = accept ? nonSkip ?? opts[0] : skipOpt ?? nonSkip ?? opts[0]
      if (!target) break
      resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, target.value)
    }
  }
  return resp
}

describe('C54_MarketBooth session', () => {
  it('prerequisite "1 Stable in Reserve" rejects players with 4 stables built', () => {
    const card = getRegisteredMinorImprovement(CARD_ID)!
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 },
    ]
    expect(meetsCardPrerequisites(player, card as never, 1, state)).toBe(false)
  })

  it('prerequisite "1 Stable in Reserve" passes when at least one stable is unbuilt', () => {
    const card = getRegisteredMinorImprovement(CARD_ID)!
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.stableTiles = []
    expect(meetsCardPrerequisites(player, card as never, 1, state)).toBe(true)
  })

  it('on harvest field phase end, accepting consumes 1 grain + 1 fence and grants 5 food', () => {
    const sessionAccept = setupForHarvestField()
    const beforeAccept = sessionAccept.getState().state.players[0]!
    const grainBefore = beforeAccept.resources.grain
    const fenceBefore = getFenceCount(beforeAccept)
    const foodBefore = beforeAccept.resources.food

    // Compare against an identical decline run to factor out feeding-phase food cost.
    const sessionDecline = setupForHarvestField()
    const respDecline = drainPending(sessionDecline, /* accept */ false)
    const afterDecline = respDecline.state.players[0]!

    const respAccept = drainPending(sessionAccept, /* accept */ true)
    const afterAccept = respAccept.state.players[0]!

    expect(afterAccept.resources.grain).toBe(grainBefore - 1)
    expect(getFenceCount(afterAccept)).toBe(fenceBefore - 1)
    // accept flow nets +5 food relative to decline flow (other phases identical)
    expect(afterAccept.resources.food - afterDecline.resources.food).toBe(5)
    // Sanity: foodBefore unchanged on the original snapshot
    expect(foodBefore).toBe(100)
  })

  it('on harvest field phase end, declining keeps grain and fence unchanged', () => {
    const session = setupForHarvestField()
    const before = session.getState().state.players[0]!
    const grainBefore = before.resources.grain
    const fenceBefore = getFenceCount(before)

    const resp = drainPending(session, /* accept */ false)
    const after = resp.state.players[0]!
    expect(after.resources.grain).toBe(grainBefore)
    expect(getFenceCount(after)).toBe(fenceBefore)
  })

  it('does not trigger when player has 0 fences', () => {
    const session = setupForHarvestField()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = []
    session.loadState(state)
    const resp = drainPending(session, /* accept */ true)
    const after = resp.state.players[0]!
    expect(after.resources.grain).toBe(1)
    expect(getFenceCount(after)).toBe(0)
  })

  it('does not trigger when player has 0 grain', () => {
    const session = setupForHarvestField()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 0
    session.loadState(state)
    const resp = drainPending(session, /* accept */ true)
    const after = resp.state.players[0]!
    expect(after.resources.grain).toBe(0)
    expect(getFenceCount(after)).toBe(1)
  })
})
