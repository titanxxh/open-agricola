import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { FeedSelection } from '../../shared/session/session-core'

import '../../shared/cards/E/E153_StoneSculptor'

const CARD_ID = 'E153_StoneSculptor'

const setupHarvestRound = (round = 4) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = round
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = 0
  })
  state.players[0]!.startPlayer = true
  state.players[1]!.startPlayer = false
  state.players[0]!.name = 'P1'
  state.players[1]!.name = 'P2'
  return { session, state }
}

const drainHarvest = (session: GameSession, feedSelections: Record<number, FeedSelection[]> = {}) => {
  let resp = session.performRoundEnd()
  while (resp.interaction.stateId === 'wait') {
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
      const idx = resp.interaction.playerIndex
      const sel = feedSelections[idx] ?? []
      resp = session.resolveChoice(idx, 'confirm', { selections: sel })
    } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      const interaction = resp.interaction.stateId === 'wait' ? resp.interaction : null
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', interaction?.zones ?? [])
    } else if (resp.interaction.stateId === 'wait') {
      const opts = resp.interaction.request.options ?? []
      const next = opts.find((o) => o.value === '__skip__') ?? opts[0]
      if (!next) break
      resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, next.value)
    } else {
      break
    }
  }
  return resp
}

describe('E153_StoneSculptor exchange metadata', () => {
  it('declares a harvest-window exchange with bonusVp sideEffect', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 1
    session.loadState(state)

    const trades = getExchangesInWindow(player, 'harvest')
    const own = trades.find((t) => t.sourceId === CARD_ID)
    expect(own).toBeDefined()
    expect(own!.from).toEqual({ stone: 1 })
    expect(own!.to).toEqual({ food: 1 })
    expect(own!.max).toBe(1)
    expect(own!.sideEffect).toEqual({ type: 'bonusVp', amount: 1 })
  })

  it('exposes nothing in the anytime window', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)
    const anytime = getExchangesInWindow(player, 'anytime')
    expect(anytime.find((t) => t.sourceId === CARD_ID)).toBeUndefined()
  })

  it('computeBonusScore reads cardStates.bonusVpEarned', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.cardStates = {
      [CARD_ID]: { extraData: { bonusVpEarned: 4 } },
    }
    session.loadState(state)
    const eff = getCardEffect(CARD_ID)
    expect(eff?.computeBonusScore).toBeDefined()
    const score = eff!.computeBonusScore!(state, player, {} as never)
    expect(score).toBe(4)
  })

  it('computeBonusScore returns 0 when no usage recorded', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)
    const eff = getCardEffect(CARD_ID)!
    const score = eff.computeBonusScore!(state, player, {} as never)
    expect(score).toBe(0)
  })
})

describe('E153_StoneSculptor harvest integration', () => {
  it('exchanging 1 stone during harvest feed: -1 stone, +1 food, +1 bonusVp', () => {
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    p1.occupationPlayed.push(CARD_ID)
    p1.resources.stone = 1
    p1.resources.food = 0 // family of 1 needs 2 food → trigger harvestFeed prompt
    p1.familySize = 1
    state.players[1]!.resources.food = 5
    session.loadState(state)

    const resp = drainHarvest(session, {
      0: [
        {
          count: 1,
          sourceId: CARD_ID,
          exchangeIndex: 0,
          sourceName: 'Stone Sculptor',
        },
      ],
    })

    const finalP1 = resp.state.players[0]!
    expect(finalP1.resources.stone).toBe(0)
    expect(finalP1.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned).toBe(1)
  })

  it('max:1 caps a single-harvest selection: count=2 only spends 1 stone, +1 bonusVp', () => {
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    p1.occupationPlayed.push(CARD_ID)
    p1.resources.stone = 5
    p1.resources.food = 0
    p1.familySize = 1
    state.players[1]!.resources.food = 5
    session.loadState(state)

    const resp = drainHarvest(session, {
      0: [
        {
          count: 2, // request 2 — capped at 1 by exchange.max
          sourceId: CARD_ID,
          exchangeIndex: 0,
          sourceName: 'Stone Sculptor',
        },
      ],
    })

    const finalP1 = resp.state.players[0]!
    expect(finalP1.resources.stone).toBe(4) // only 1 spent
    expect(finalP1.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned).toBe(1)
  })

  it('two harvests accumulate bonusVp', () => {
    // First harvest at round 4
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    p1.occupationPlayed.push(CARD_ID)
    p1.resources.stone = 5
    p1.resources.food = 0
    p1.familySize = 1
    state.players[1]!.resources.food = 5
    session.loadState(state)

    let resp = drainHarvest(session, {
      0: [{ count: 1, sourceId: CARD_ID, exchangeIndex: 0 }],
    })
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned).toBe(1)

    // Now jump to round 7 (next harvest) by manipulating state and re-driving.
    const s2 = resp.state
    s2.round = 7
    s2.roundPhase = 'work'
    s2.players.forEach((p) => {
      markAllWorkersUsed(s2, p)
      setActiveWorkerCount(p, 1)
    })
    s2.players[0]!.resources.food = 0
    s2.players[0]!.familySize = 1
    s2.players[1]!.resources.food = 5
    session.loadState(s2)

    resp = drainHarvest(session, {
      0: [{ count: 1, sourceId: CARD_ID, exchangeIndex: 0 }],
    })
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned).toBe(2)
  })

  it('player without E153: harvest exchange not exposed', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    // Do NOT push E153 into occupationPlayed.
    session.loadState(state)
    const trades = getExchangesInWindow(player, 'harvest')
    expect(trades.find((t) => t.sourceId === CARD_ID)).toBeUndefined()
  })

  it('zero stone: passing exchangeIndex with count=1 still capped to 0 actually-applied', () => {
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    p1.occupationPlayed.push(CARD_ID)
    p1.resources.stone = 0
    p1.resources.food = 4 // enough for family of 1 (2 food required)
    p1.familySize = 1
    state.players[1]!.resources.food = 5
    session.loadState(state)

    const resp = drainHarvest(session, {
      0: [{ count: 1, sourceId: CARD_ID, exchangeIndex: 0 }],
    })
    const finalP1 = resp.state.players[0]!
    // No stone to spend → no bonusVp credited.
    expect(finalP1.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned).toBeUndefined()
  })
})
