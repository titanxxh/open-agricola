import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B072_LoveforAgriculture'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/B/B082_ValueAssets'

const FILLER = '__test_placeholder__'
const setup = (cardId: string, round = 5, played = true) => {
  const session = new GameSession(7500 + round, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.resources = { ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId === 'wait' && !options(response).some((option) => option.value === cardId)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(0, branch.value)
  }
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === cardId)
  return card ? session.resolveChoice(0, card.value) : response
}

const endRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const pasture = (size: number) => ({
  id: 'p1', size, tiles: Array.from({ length: size }, (_, col) => ({ row: 2, col: col + 2 })),
  stables: 0, animalType: null, animalCount: 0,
})

describe('B072 Love for Agriculture parity', () => {
  it('B072 S1: Love for Agriculture can be played for free', () => {
    expect(playMinor(setup('B072_LoveforAgriculture', 5, false), 'B072_LoveforAgriculture')
      .state.players[0]!.minorPlayed).toContain('B072_LoveforAgriculture')
  })

  it.each([
    ['S2', 1, 'grain', 3], ['S3', 2, 'vegetable', 2],
  ] as const)('B072 %s: a %i-space pasture can be sown with %s', (_scenario, size, crop, remaining) => {
    const session = setup('B072_LoveforAgriculture', 10)
    const state = session.getState().state
    state.players[0]!.resources[crop] = 1
    state.players[0]!.pastures = [pasture(size)]
    session.loadState(state)
    let response = session.takeAction(0, 'grain-utilization')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
    response = session.commitSelectionChoice(0, { crops: [{ row: 2, col: 2, crop }] })
    expect(response.ok, response.error).toBe(true)
    const crops = response.state.players[0]!.cardStates.B072_LoveforAgriculture?.extraData?.pastureCrops as Array<{ crop: string; remaining: number }>
    expect(crops).toContainEqual(expect.objectContaining({ crop, remaining }))
  })

  it('B072 S4: a three-space pasture is not sowable', () => {
    const session = setup('B072_LoveforAgriculture', 10)
    session.state.players[0]!.resources.grain = 1
    session.state.players[0]!.pastures = [pasture(3)]
    session.loadState(session.state)
    expect(session.takeAction(0, 'grain-utilization').ok).toBe(false)
  })

  it('B072 S5: a harvest reaps one crop from a sown pasture', () => {
    const session = setup('B072_LoveforAgriculture', 4)
    const owner = session.state.players[0]!
    owner.pastures = [pasture(1)]
    owner.cardStates.B072_LoveforAgriculture = { extraData: { pastureCrops: [{
      pastureId: 'p1', tiles: [{ row: 2, col: 2 }], crop: 'grain', remaining: 3,
    }] } }
    session.loadState(session.state)
    const response = endRound(session)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    const crops = response.state.players[0]!.cardStates.B072_LoveforAgriculture?.extraData?.pastureCrops as Array<{ remaining: number }>
    expect(crops[0]!.remaining).toBe(2)
  })

  it('B072 S6: a sown one-space pasture loses one animal capacity', () => {
    const session = setup('B072_LoveforAgriculture', 10)
    const owner = session.state.players[0]!
    owner.pastures = [pasture(1)]
    owner.resources.sheep = 2
    owner.cardStates.B072_LoveforAgriculture = { extraData: { pastureCrops: [{
      pastureId: 'p1', tiles: [{ row: 2, col: 2 }], crop: 'grain', remaining: 3,
    }] } }
    session.loadState(session.state)
    const response = session.takeAction(0, 'day-laborer')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return
    expect(response.interaction.request.zones.find((zone) => zone.id === 'p1')?.capacity).toBe(1)
  })
})

describe('B081 Handcart parity', () => {
  it('B081 S1: paying one wood plays Handcart', () => {
    const session = setup('B081_Handcart', 5, false)
    session.state.players[0]!.resources.wood = 1
    session.loadState(session.state)
    expect(playMinor(session, 'B081_Handcart').state.players[0]!.minorPlayed).toContain('B081_Handcart')
  })

  it('B081 S2: before work one resource may be taken from a space at its threshold', () => {
    const session = setup('B081_Handcart', 5)
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 6
    session.loadState(session.state)
    let response = endRound(session)
    expect(response.interaction.sourceCard).toBe('B081_Handcart')
    if (response.interaction.stateId !== 'wait') return
    response = session.resolveChoice(0, options(response).find((option) => option.value !== '__skip__')!.value)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(8)
  })

  it('B081 S3: below-threshold accumulation spaces offer no Handcart take', () => {
    const session = setup('B081_Handcart', 5)
    for (const space of session.state.actionSpaces) {
      space.resources.wood = 0; space.resources.clay = 0; space.resources.reed = 0; space.resources.stone = 0
    }
    session.loadState(session.state)
    const response = endRound(session)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'B081_Handcart').toBe(true)
  })
})

describe('B082 Value Assets parity', () => {
  it('B082 S1: Value Assets can be played for free', () => {
    expect(playMinor(setup('B082_ValueAssets', 5, false), 'B082_ValueAssets')
      .state.players[0]!.minorPlayed).toContain('B082_ValueAssets')
  })

  it.each([
    ['S2', 'wood', 1], ['S3', 'clay', 1], ['S4', 'reed', 2], ['S5', 'stone', 2],
  ] as const)('B082 %s: after harvest buys exactly one %s', (_scenario, resource, cost) => {
    const session = setup('B082_ValueAssets', 4)
    session.state.players[0]!.resources.food = 4 + cost
    session.loadState(session.state)
    let response = endRound(session)
    expect(response.interaction.sourceCard).toBe('B082_ValueAssets')
    if (response.interaction.stateId !== 'wait') return
    const choice = options(response).find((option) => option.value !== '__skip__'
      && JSON.stringify(option).includes(resource)) ?? options(response).find((option) => option.value !== '__skip__')
    response = session.resolveChoice(0, choice!.value)
    expect(response.state.players[0]!.resources[resource]).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('B082 S6: the Value Assets purchase may be declined', () => {
    const session = setup('B082_ValueAssets', 4)
    session.state.players[0]!.resources.food = 6
    session.loadState(session.state)
    let response = endRound(session)
    if (response.interaction.stateId === 'wait') response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0, clay: 0, reed: 0, stone: 0 })
  })
})
