import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getFenceCount } from '../../shared/actions/effects/fencing'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getRegisteredMinorImprovement } from '../../shared/cards-display/types'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { setFencesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'

import '../../shared/cards/C/C54_MarketBooth'

const CARD_ID = 'C54_MarketBooth'

const setupForHarvestField = (options?: {
  builtFences?: number
  e74HeldFences?: number
  grain?: number
}) => {
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
  player.resources.grain = options?.grain ?? 1
  setFencesForTest(player, options?.builtFences ?? 4)
  if (options?.e74HeldFences) {
    player.cardStates = {
      ...player.cardStates,
      E74_AshTrees: { counters: { fences: options.e74HeldFences } },
    }
  }

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

const setupForPurchase = (options?: { noStableReserve?: boolean }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  if (options?.noStableReserve) {
    player.stableTiles = [{ row: 0, col: 1 }]
    player.supplyTokensConsumed = { stable: 1 }
    player.cardStates = {
      ...player.cardStates,
      A89_StablePlanner: { extraData: { targetRounds: [6] } },
      B85_FarmHand: { extraData: { position: { row: 1, col: 1 } } },
    }
  }

  session.loadState(state)
  return session
}

const takeMeetingPlaceToMinorOptions = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  let safety = 10
  while (safety-- > 0 && resp.interaction.stateId === 'wait') {
    const options = resp.interaction.options ?? []
    if (options.some((option) => option.value === `minor:${CARD_ID}`)) break
    const accept = options.find((option) => option.value !== '__skip__')
    if (!accept) break
    resp = session.resolveChoice(0, accept.value)
  }
  return resp
}

describe('C54_MarketBooth session', () => {
  it('has no prerequisite (BGA C54_MarketBooth has no isBuyable / prerequisite)', () => {
    const card = getRegisteredMinorImprovement(CARD_ID)!
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    // Even with all 4 stables built, BGA does not gate the purchase.
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 },
    ]
    expect(meetsCardPrerequisites(player, card as never, 1, state)).toBe(true)
  })

  it('pays one stable supply token through the minor-improvement purchase path', () => {
    const session = setupForPurchase()
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.options?.find((entry) => entry.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    const player = resp.state.players[0]!
    expect(resp.ok).toBe(true)
    expect(player.minorPlayed).toContain(CARD_ID)
    expect(player.supplyTokensConsumed?.stable).toBe(1)
    expect(player.stableTiles).toHaveLength(0)
  })

  it('cannot be played when stable reserve is exhausted by built, future, FarmHand, and consumed stable tokens', () => {
    const session = setupForPurchase({ noStableReserve: true })
    const resp = takeMeetingPlaceToMinorOptions(session)
    const options = resp.interaction.stateId === 'wait' ? resp.interaction.options ?? [] : []
    expect(options.some((entry) => entry.value === `minor:${CARD_ID}`)).toBe(false)
  })

  it('on harvest field phase end, accepting pays grain + reserve fence and grants 5 food', () => {
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
    expect(getFenceCount(afterAccept)).toBe(fenceBefore)
    expect(afterAccept.supplyTokensConsumed?.fence).toBe(1)
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
    expect(after.supplyTokensConsumed?.fence).toBeUndefined()
  })

  it('does not exchange when only unbuilt fence tokens are held on E74', () => {
    const session = setupForHarvestField({ builtFences: 10, e74HeldFences: 5 })
    const before = session.getState().state.players[0]!
    const grainBefore = before.resources.grain
    const fenceBefore = getFenceCount(before)
    const resp = drainPending(session, /* accept */ true)
    const after = resp.state.players[0]!
    expect(after.resources.grain).toBe(grainBefore)
    expect(getFenceCount(after)).toBe(fenceBefore)
    expect(after.supplyTokensConsumed?.fence).toBeUndefined()
  })

  it('does not trigger when player has 0 grain', () => {
    const session = setupForHarvestField({ grain: 0 })
    const resp = drainPending(session, /* accept */ true)
    const after = resp.state.players[0]!
    expect(after.resources.grain).toBe(0)
    expect(getFenceCount(after)).toBe(4)
    expect(after.supplyTokensConsumed?.fence).toBeUndefined()
  })
})
