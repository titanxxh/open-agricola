import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionChoiceOption, AnytimeAction } from '../../shared/contract/types'

import '../../shared/cards/B/B19_MoldboardPlow'
import '../../shared/cards/B/B173_Sweeper'
import '../../shared/cards/C/C172_FieldCounter'
import '../../shared/cards/D/D173_TownClerk'

const CASHOUT_IDS = {
  B173_Sweeper: 'B173-sweeper-cashout',
  C172_FieldCounter: 'C172-field-counter-cashout',
  D173_TownClerk: 'D173-town-clerk-cashout',
} as const

type StoredFoodCardId = keyof typeof CASHOUT_IDS

const placeholderHands = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  session.loadState(state)
}

const setupOwnerCard = (cardId: StoredFoodCardId, currentPlayerIndex = 0) => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  placeholderHands(session)
  const state = session.getState().state
  state.currentPlayerIndex = currentPlayerIndex
  state.players.forEach((player) => {
    player.resources.food = 0
  })
  state.players[0]!.occupationPlayed = [cardId]
  session.loadState(state)
  return session
}

const storedFood = (session: GameSession, cardId: StoredFoodCardId) =>
  session.getState().state.players[0]!.cardStates?.[cardId]?.counters?.food ?? 0

const completeFirstPlow = (
  session: GameSession,
  playerIndex: number,
  resp: ReturnType<GameSession['takeAction']> | ReturnType<GameSession['resolveChoice']>,
) => {
  if (resp.interaction.stateId !== 'wait') throw new Error('expected farm-select')
  const tile = resp.interaction.farm.selectableTiles[0]
  expect(tile).toBeDefined()
  return session.commitSelectionChoice(playerIndex, { tile })
}

const enterMinorChoice = (session: GameSession, playerIndex: number) => {
  let resp = session.takeAction(playerIndex, 'meeting-place')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') throw new Error('expected minor entry choice')
  resp = session.resolveChoice(playerIndex, 'action-improvement-1')
  expect(resp.ok).toBe(true)
  return resp
}

const playMinor = (session: GameSession, playerIndex: number, cardId: string) => {
  let resp = enterMinorChoice(session, playerIndex)
  if (resp.state.players[playerIndex]!.minorPlayed.includes(cardId)) {
    return resp
  }
  if (resp.interaction.stateId !== 'wait') throw new Error('expected minor choice')
  const option = resp.interaction.options?.find(
    (candidate: ActionChoiceOption) => candidate.value === `minor:${cardId}`,
  )
  expect(option).toBeDefined()
  resp = session.resolveChoice(playerIndex, option!.value)
  expect(resp.ok).toBe(true)
  return resp
}

const playMajor = (session: GameSession, playerIndex: number, cardId: string) => {
  let resp = session.takeAction(playerIndex, 'major-improvement')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') throw new Error('expected major choice')
  const option = resp.interaction.options?.find(
    (candidate: ActionChoiceOption) => candidate.value === `major:${cardId}`,
  )
  expect(option).toBeDefined()
  resp = session.resolveChoice(playerIndex, option!.value)
  expect(resp.ok).toBe(true)
  return resp
}

describe('5+ stored-food cashout occupations', () => {
  it('Sweeper stores food when the owner uses an extension meeple space and ignores other spaces', () => {
    const matching = setupOwnerCard('B173_Sweeper')

    let resp = matching.takeAction(0, 'copse-56')

    expect(resp.ok).toBe(true)
    expect(storedFood(matching, 'B173_Sweeper')).toBe(1)

    const nonMatching = setupOwnerCard('B173_Sweeper')
    resp = nonMatching.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(storedFood(nonMatching, 'B173_Sweeper')).toBe(0)
  })

  it('Field Counter stores food for each field another player plows and ignores the owner plowing', () => {
    const session = setupOwnerCard('C172_FieldCounter', 1)
    const state = session.getState().state
    const opponent = state.players[1]!
    opponent.minorPlayed = ['B19_MoldboardPlow']
    opponent.cardStates ??= {}
    opponent.cardStates.B19_MoldboardPlow = { stack: ['field', 'field'] }
    session.loadState(state)

    let resp = session.takeAction(1, 'farmland')
    expect(resp.ok).toBe(true)
    resp = completeFirstPlow(session, 1, resp)
    expect(resp.ok).toBe(true)
    expect(storedFood(session, 'C172_FieldCounter')).toBe(1)

    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional extra plow')
    const extraPlow = resp.interaction.options?.find(
      (option: ActionChoiceOption) => option.value !== '__skip__',
    )
    expect(extraPlow).toBeDefined()
    resp = session.resolveChoice(1, extraPlow!.value)
    expect(resp.ok).toBe(true)
    resp = completeFirstPlow(session, 1, resp)
    expect(resp.ok).toBe(true)
    expect(storedFood(session, 'C172_FieldCounter')).toBe(2)

    const ownerPlow = setupOwnerCard('C172_FieldCounter')
    resp = ownerPlow.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    resp = completeFirstPlow(ownerPlow, 0, resp)
    expect(resp.ok).toBe(true)
    expect(storedFood(ownerPlow, 'C172_FieldCounter')).toBe(0)
  })

  it('Town Clerk stores food for major and dual-type minor improvements, but ignores ordinary minors', () => {
    const major = setupOwnerCard('D173_TownClerk', 1)
    let state = major.getState().state
    state.players[1]!.resources.clay = 5
    major.loadState(state)

    playMajor(major, 1, 'Major_Fireplace1')
    expect(storedFood(major, 'D173_TownClerk')).toBe(1)

    const dualTypeMinor = setupOwnerCard('D173_TownClerk')
    state = dualTypeMinor.getState().state
    const owner = state.players[0]!
    owner.minorHand = ['D25_WitchesDanceFloor']
    dualTypeMinor.loadState(state)

    playMinor(dualTypeMinor, 0, 'D25_WitchesDanceFloor')
    expect(storedFood(dualTypeMinor, 'D173_TownClerk')).toBe(1)

    const ordinaryMinor = setupOwnerCard('D173_TownClerk')
    state = ordinaryMinor.getState().state
    const ordinaryOwner = state.players[0]!
    ordinaryOwner.resources.wood = 5
    ordinaryOwner.resources.clay = 5
    ordinaryOwner.minorHand = ['A55_JunkRoom']
    ordinaryMinor.loadState(state)

    playMinor(ordinaryMinor, 0, 'A55_JunkRoom')
    expect(storedFood(ordinaryMinor, 'D173_TownClerk')).toBe(0)
  })

  it.each([
    ['B173_Sweeper', CASHOUT_IDS.B173_Sweeper],
    ['C172_FieldCounter', CASHOUT_IDS.C172_FieldCounter],
    ['D173_TownClerk', CASHOUT_IDS.D173_TownClerk],
  ] as const)('%s can cash out stored food once and remains a played occupation', (cardId, actionId) => {
    const session = setupOwnerCard(cardId)
    const state = session.getState().state
    const owner = state.players[0]!
    owner.cardStates ??= {}
    owner.cardStates[cardId] = { counters: { food: 2 } }
    session.loadState(state)

    let resp = session.getState()
    expect(resp.interaction.anytimeActions.map((entry: AnytimeAction) => entry.id)).toContain(actionId)

    resp = session.takeAnytimeAction(0, actionId)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.cardStates?.[cardId]?.counters?.food).toBe(0)
    expect(resp.state.players[0]!.cardStates?.[cardId]?.extraData?.cashedOut).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain(cardId)
    expect(resp.interaction.anytimeActions.map((entry: AnytimeAction) => entry.id)).not.toContain(actionId)
  })

  it('Sweeper stops accumulating after cashout', () => {
    const session = setupOwnerCard('B173_Sweeper')
    let state = session.getState().state
    const owner = state.players[0]!
    owner.cardStates ??= {}
    owner.cardStates.B173_Sweeper = { counters: { food: 1 } }
    session.loadState(state)

    let resp = session.takeAnytimeAction(0, CASHOUT_IDS.B173_Sweeper)
    expect(resp.ok).toBe(true)

    state = resp.state
    state.currentPlayerIndex = 0
    session.loadState(state)
    resp = session.takeAction(0, 'copse-56')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates?.B173_Sweeper?.counters?.food).toBe(0)
  })
})
