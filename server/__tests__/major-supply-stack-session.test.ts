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

  it('reveals the next card in a six-player stack after buying the visible top', () => {
    const session = prepareSixPlayerMajorSession()

    const state = buildMajor(session, 'Major_Well')
    const wellStack = readMajorSupply(state).find((stack) => stack.familyId === 'well')

    expect(state.players[0]!.improvements).toContain('Major_Well')
    expect(state.availableMajorImprovements).not.toContain('Major_Well')
    expect(state.availableMajorImprovements).toContain('Major_Well2')
    expect(wellStack?.visibleId).toBe('Major_Well2')
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
