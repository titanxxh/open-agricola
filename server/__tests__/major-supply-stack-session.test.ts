import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setCardFlag } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import { createInitialState } from '../../shared/session/state-bootstrap'
import type { ActionChoiceOption, GameState } from '../../shared/contract/types'

import '../../shared/cards/D/D27_Retraining'

type MajorSupplyStack = {
  familyId: string
  visibleId: string | null
  cardIds: string[]
}

const readMajorSupply = (state: GameState): MajorSupplyStack[] =>
  (state as GameState & { majorImprovementSupply?: MajorSupplyStack[] }).majorImprovementSupply ?? []

const allSixPlayerDuplicateMajorIds = [
  'Major_Fireplace3',
  'Major_CookingHearth3',
  'Major_Well2',
  'Major_ClayOven2',
  'Major_StoneOven2',
  'Major_Joinery2',
  'Major_Pottery2',
  'Major_Basket2',
]

const standardMajorIds = [
  'Major_Fireplace1',
  'Major_Fireplace2',
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
  'Major_Well',
  'Major_Joinery',
  'Major_Pottery',
  'Major_Basket',
]

const farmersOfTheMoorVisibleMajorIds = [
  'Major_Fireplace1',
  'Major_Fireplace2',
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
  'Major_Joinery',
  'Major_Pottery',
  'Major_Basket',
  'Major_Well',
  'Major_Moor_PeatCharcoalKiln',
  'Major_Moor_ForestersLodge',
]

const prepareSixPlayerMajorSession = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 6 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  const player = state.players[0]!
  player.resources = {
    ...player.resources,
    wood: 5,
    clay: 10,
    reed: 3,
    stone: 6,
  }
  state.players.forEach((p, index) => {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
    setWorkersAtHome(state, p, index === 0 ? 4 : 0)
  })
  session.loadState(state)
  return session
}

const prepareFarmersOfTheMoorMajorSession = () => {
  const session = new GameSession(undefined, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
  })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  const player = state.players[0]!
  player.resources = {
    ...player.resources,
    wood: 10,
    clay: 20,
    reed: 10,
    stone: 20,
  }
  state.players.forEach((p, index) => {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
    setWorkersAtHome(state, p, index === 0 ? 4 : 0)
  })
  session.loadState(state)
  return session
}

const resetMajorActionForPlayer0 = (session: GameSession) => {
  const state = session.getState().state
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  setWorkersAtHome(state, player, 4)
  const space = state.actionSpaces.find((candidate) => candidate.id === 'major-improvement')
  if (space) space.takenBy = []
  session.loadState(state)
}

const buildMajor = (session: GameSession, id: string) => {
  let resp = session.takeAction(0, 'major-improvement')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId === 'wait') {
    const option = resp.interaction.options?.find(
      (candidate: ActionChoiceOption) => candidate.value === `major:${id}`,
    )
    expect(option).toBeDefined()
    resp = session.resolveChoice(0, `major:${id}`)
    expect(resp.ok).toBe(true)
  }
  return session.getState().state
}

const choosePaymentReturningCard = (session: GameSession, cardId: string) => {
  let resp = session.getState()
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const option = resp.interaction.options?.find((candidate) =>
      JSON.stringify(candidate).includes(cardId),
    )
    expect(option).toBeDefined()
    resp = session.resolveChoice(0, option!.value)
    expect(resp.ok).toBe(true)
  }
  return resp.state
}

describe('major improvement supply stacks', () => {
  it('keeps five-player major supply flat with the standard 10 majors', () => {
    const state = createInitialState(42, { playerCount: 5 })

    expect(state.availableMajorImprovements.sort()).toEqual([...standardMajorIds].sort())
    expect(readMajorSupply(state)).toEqual([])
  })

  it('initializes six-player stack supply with standard visible tops and covered duplicates', () => {
    const state = createInitialState(42, { playerCount: 6 })
    const supply = readMajorSupply(state)

    expect(state.availableMajorImprovements.sort()).toEqual([...standardMajorIds].sort())
    expect(allSixPlayerDuplicateMajorIds.every((id) => !state.availableMajorImprovements.includes(id))).toBe(true)
    expect(supply.flatMap((stack) => stack.cardIds).sort()).toEqual(
      [...standardMajorIds, ...allSixPlayerDuplicateMajorIds].sort(),
    )
    expect(supply.filter((stack) => stack.cardIds.length > 1).length).toBe(8)
  })

  it('initializes Farmers of the Moor major supply instead of six-player duplicates when enabled', () => {
    const state = createInitialState(42, { playerCount: 6, enableFarmersOfTheMoor: true })
    const supply = readMajorSupply(state)

    expect(supply).toHaveLength(12)
    expect(state.availableMajorImprovements.sort()).toEqual([...farmersOfTheMoorVisibleMajorIds].sort())
    expect(allSixPlayerDuplicateMajorIds.every((id) => !state.availableMajorImprovements.includes(id))).toBe(true)
    expect(allSixPlayerDuplicateMajorIds.every((id) => !supply.flatMap((stack) => stack.cardIds).includes(id))).toBe(true)
  })

  it('reveals the next card in a six-player stack after buying the visible top', () => {
    const session = prepareSixPlayerMajorSession()

    const state = buildMajor(session, 'Major_Well')
    const wellStack = readMajorSupply(state).find((stack) => stack.familyId === 'well')

    expect(state.players[0]!.improvements).toContain('Major_Well')
    expect(state.availableMajorImprovements).not.toContain('Major_Well')
    expect(state.availableMajorImprovements).toContain('Major_Well2')
    expect(wellStack?.visibleId).toBe('Major_Well2')
  })

  it('keeps covered Farmers of the Moor majors unavailable until their top card is bought', () => {
    const session = prepareFarmersOfTheMoorMajorSession()

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.map((option) => option.value)).not.toContain('major:Major_Moor_HorseSlaughterhouse1')

    resp = session.resolveChoice(0, 'major:Major_Fireplace1')
    expect(resp.ok).toBe(true)
    expect(resp.state.availableMajorImprovements).toContain('Major_Moor_HorseSlaughterhouse1')

    resetMajorActionForPlayer0(session)
    resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.map((option) => option.value)).toContain('major:Major_Moor_HorseSlaughterhouse1')
  })

  it('offers Farmers of the Moor-only top stack majors for purchase', () => {
    const session = prepareFarmersOfTheMoorMajorSession()

    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.map((option) => option.value)).toContain('major:Major_Moor_PeatCharcoalKiln')
    expect(resp.interaction.options?.map((option) => option.value)).toContain('major:Major_Moor_ForestersLodge')
  })

  it('returns a Cooking Hearth to its Farmers of the Moor stack when buying Cookhouse as an upgrade', () => {
    const session = prepareFarmersOfTheMoorMajorSession()
    let state = buildMajor(session, 'Major_CookingHearth1')
    expect(state.availableMajorImprovements).toContain('Major_Moor_Cookhouse1')

    state.players[0]!.resources.clay = 0
    session.loadState(state)
    resetMajorActionForPlayer0(session)
    state = buildMajor(session, 'Major_Moor_Cookhouse1')
    state = choosePaymentReturningCard(session, 'Major_CookingHearth1')

    const player = state.players[0]!
    const stack = readMajorSupply(state).find((candidate) => candidate.stackId === 'moor-cooking-hearth-1')
    expect(player.improvements).toContain('Major_Moor_Cookhouse1')
    expect(player.improvements).not.toContain('Major_CookingHearth1')
    expect(state.availableMajorImprovements).toContain('Major_CookingHearth1')
    expect(state.availableMajorImprovements).not.toContain('Major_Moor_Cookhouse1')
    expect(stack?.visibleId).toBe('Major_CookingHearth1')
    expect(stack?.cardIds).toEqual(['Major_CookingHearth1'])
  })

  it('returns a major to its six-player stack and covers the duplicate again through session flow', () => {
    const session = prepareSixPlayerMajorSession()
    let state = buildMajor(session, 'Major_Joinery')
    expect(state.availableMajorImprovements).toContain('Major_Joinery2')

    state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('D27_Retraining')
    setCardFlag(player, 'D27_Retraining', true)
    resetMajorActionForPlayer0(session)

    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    const acceptOption = resp.interaction.options?.find(
      (candidate: ActionChoiceOption) => candidate.value !== '__skip__',
    )
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    const joineryStack = readMajorSupply(after).find((stack) => stack.familyId === 'joinery')
    expect(after.players[0]!.improvements).toContain('Major_Pottery')
    expect(after.players[0]!.improvements).not.toContain('Major_Joinery')
    expect(after.availableMajorImprovements).toContain('Major_Joinery')
    expect(after.availableMajorImprovements).not.toContain('Major_Joinery2')
    expect(joineryStack?.visibleId).toBe('Major_Joinery')
  })
})
