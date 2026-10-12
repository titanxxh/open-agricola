import { collectScheduledEffectPreviews } from '../../shared/actions/scheduled-effect-preview'
import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D099_EarthenwarePotter'
import '../../shared/cards/A/A099_FellowGrazer'

const CARD_ID = 'D099_EarthenwarePotter'
const OTHER_OCCUPATION = 'A099_FellowGrazer'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, early = true, clay = 2, family = 2, round = 14,
} = {}) => {
  const session = createWorkSession({ seed: 6099 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
  })
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  setActiveWorkerCount(owner, family)
  setWorkersAtHome(state, owner, family)
  owner.resources.clay = clay
  owner.occupationHand = played ? [OTHER_OCCUPATION] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (played) {
    owner.cardStates[CARD_ID] = { extraData: { purchaseRound: early ? 4 : 5 } }
  }
  session.loadState(state)
  return session
}

const playEarthenwarePotter = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  expect(response.ok, response.error).toBe(true)
  return response
}

const startHarvest = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  const response = session.performRoundEnd()
  expect(response.ok, response.error).toBe(true)
  return response
}

const finishHarvest = startHarvest

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0

describe('D099 Earthenware Potter parity', () => {
  it('D099 S1: playing Earthenware Potter in round four records the qualifying purchase date', () => {
    const response = playEarthenwarePotter(setup({ played: false, clay: 0, round: 4 }))

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.purchaseRound).toBe(4)
  })

  it('D099 S2: playing Earthenware Potter after round four records a nonqualifying purchase date', () => {
    const response = playEarthenwarePotter(setup({ played: false, clay: 0, round: 5 }))

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.purchaseRound).toBe(5)
  })

  it('D099 S3: after the final harvest one clay buys one point with two people', () => {
    const response = finishHarvest(setup({ clay: 1 }))

    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(bonusVp(response)).toBe(1)
  })

  it('D099 S4: after the final harvest clay above family size is capped at two', () => {
    const response = finishHarvest(setup({ clay: 3 }))

    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(bonusVp(response)).toBe(2)
  })

  it('D099 S5: four people can convert four clay after the final harvest', () => {
    const response = finishHarvest(setup({ clay: 5, family: 4 }))

    expect(response.state.players[0]!.resources.clay).toBe(1)
    expect(bonusVp(response)).toBe(4)
  })

  it('D099 S6: an early-played card does not convert clay after a nonfinal harvest', () => {
    const response = startHarvest(setup({ clay: 2, round: 13 }))

    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(bonusVp(response)).toBe(0)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })

  it('D099 S7: a card purchased after the deadline never converts clay after the final harvest', () => {
    const response = startHarvest(setup({ early: false, clay: 2 }))

    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(bonusVp(response)).toBe(0)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })

  it('D099 S8: with no clay the final harvest adds no bonus point', () => {
    const response = startHarvest(setup({ clay: 0 }))

    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(bonusVp(response)).toBe(0)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })

  it('D099 S9: the mandatory conversion cannot be declined or scored twice', () => {
    const session = setup({ clay: 2 })
    const response = startHarvest(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(bonusVp(response)).toBe(2)
    expect(JSON.stringify(response.interaction)).not.toContain('__skip__')
    expect(bonusVp(session.getState())).toBe(2)
    expect(session.getState().state.players[0]!.resources.clay).toBe(0)
  })
  it.each([[4, 2], [5, 0]] as const)('purchase round %i shares its readable deadline with the actual final-harvest guard', (purchaseRound, points) => {
    const session = setup({ played: false, round: purchaseRound, clay: 2 })
    const played = playEarthenwarePotter(session)
    expect(played.ok, played.error).toBe(true)
    const preview = session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!))
      .find(entry => entry.sourceCard === CARD_ID)
    expect(preview?.description).toEqual({
      kind: 'conditional', condition: { kind: 'purchased-by-round', round: 4, fact: 'purchaseRound' },
      body: { kind: 'action', showLabel: false, labelKey: 'actions.special-effect.name', effectPreview: {
        kind: 'ruleOperation', operation: { kind: 'bounded-exchange', maximum: { kind: 'family' }, cost: { clay: 1 }, gain: {}, bonusVp: 1, quantity: 'maximum' },
      } },
    })
    const state = session.getState().state
    state.round = 14
    state.players.forEach(player => markAllWorkersUsed(state, player))
    session.loadState(state)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(2 - points)
    expect(bonusVp(response)).toBe(points)
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.sourceCardId === CARD_ID && event.resources.clay === 2)).toBe(points === 2)
    expect(response.scores).toBeDefined()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    session.dispose()
  })
})
