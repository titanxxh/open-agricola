import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { runCardEffectHook } from '../../shared/cards/card-effects'

const prepareSixPlayerMajorSession = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 6 })
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
    grain: 3,
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

const buyMajor = (session: GameSession, id: string) => {
  let resp = session.takeAction(0, 'major-improvement')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId === 'wait') {
    const option = resp.interaction.request.options?.find(
      (candidate: ActionChoiceOption) => candidate.value === id,
    )
    expect(option).toBeDefined()
    resp = session.resolveChoice(0, id)
    expect(resp.ok).toBe(true)
  }
  return resp
}

const readMajorSupply = (session: GameSession) =>
  session.getState().state.majorImprovementSupply ?? []

describe('duplicate six-player major behavior', () => {
  it('Well and Well2 each schedule independent future food entries when purchased', () => {
    const session = prepareSixPlayerMajorSession()

    buyMajor(session, 'Major_Well')
    resetMajorActionForPlayer0(session)
    const resp = buyMajor(session, 'Major_Well2')

    const entries = resp.state.futureMeeples.filter(
      (entry) => entry.cardId === 'Major_Well' || entry.cardId === 'Major_Well2',
    )
    expect(entries.filter((entry) => entry.cardId === 'Major_Well')).toHaveLength(5)
    expect(entries.filter((entry) => entry.cardId === 'Major_Well2')).toHaveLength(5)
    expect(entries.map((entry) => entry.resources)).toEqual(
      Array.from({ length: 10 }, () => ({ food: 1 })),
    )
  })

  it('ClayOven2 purchase offers immediate bake with the duplicate sourceCard', () => {
    const session = prepareSixPlayerMajorSession()

    buyMajor(session, 'Major_ClayOven')
    resetMajorActionForPlayer0(session)
    const resp = buyMajor(session, 'Major_ClayOven2')

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.sourceCard).toBe('Major_ClayOven2')
    expect(resp.interaction.request.options?.find((option) => option.value !== '__skip__')?.sourceCard)
      .toBe('Major_ClayOven2')
  })

  it('Cooking Hearth return-cost can return Fireplace3 through stack-aware supply', () => {
    const session = prepareSixPlayerMajorSession()

    buyMajor(session, 'Major_Fireplace1')
    resetMajorActionForPlayer0(session)
    buyMajor(session, 'Major_Fireplace3')
    resetMajorActionForPlayer0(session)
    let resp = buyMajor(session, 'Major_CookingHearth1')

    if (resp.interaction.stateId === 'wait') {
      const returnFireplace3 = resp.interaction.request.options?.find((option) =>
        JSON.stringify(option).includes('Major_Fireplace3'),
      )
      expect(returnFireplace3).toBeDefined()
      resp = session.resolveChoice(0, returnFireplace3!.value)
      expect(resp.ok).toBe(true)
    }

    const player = resp.state.players[0]!
    const fireplaceStack = readMajorSupply(session).find((stack) => stack.stackId === 'fireplace-1')
    expect(player.improvements).toEqual(expect.arrayContaining([
      'Major_Fireplace1',
      'Major_CookingHearth1',
    ]))
    expect(player.improvements).not.toContain('Major_Fireplace3')
    expect(resp.state.availableMajorImprovements).toContain('Major_Fireplace3')
    expect(fireplaceStack?.visibleId).toBe('Major_Fireplace3')
    expect(resp.state.log.some((entry) =>
      JSON.stringify(entry.params ?? {}).includes('Major_Fireplace3'),
    )).toBe(true)
  })

  it('workshop originals and duplicates each convert once during harvest', () => {
    const session = prepareSixPlayerMajorSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.improvements = [
      'Major_Joinery',
      'Major_Joinery2',
      'Major_Pottery',
      'Major_Pottery2',
      'Major_Basket',
      'Major_Basket2',
    ]
    player.resources = {
      ...player.resources,
      wood: 2,
      clay: 2,
      reed: 2,
      food: 0,
    }

    for (const cardId of player.improvements) {
      runCardEffectHook(state, player, cardId, 'onHarvest')
    }

    expect(player.resources).toMatchObject({
      wood: 0,
      clay: 0,
      reed: 0,
      food: 14,
    })
  })
})
