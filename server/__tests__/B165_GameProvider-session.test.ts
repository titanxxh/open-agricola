import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { FarmTilePosition, PlayerState } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/B/B165_GameProvider'
import '../../shared/cards/B/B113_PatchCaregiver'
import { resolveNonSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

const CARD_ID = 'B165_GameProvider'
const FILLER = '__test_placeholder__'

const setupHarvest = (
  fields: PlayerState['fields'] = [
    { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
    { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
    { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
  ],
) => {
  const session = new GameSession(5165, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = player === state.players[0] ? 0 : 20
    player.resources.boar = 0
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.fields = []
    player.pastures = []
    player.stableAnimals = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
  })

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.fields = fields
  session.loadState(state)
  return session
}

const acceptB165 = (session: GameSession) => {
  let resp = session.performRoundEnd()
  resp = resolveTriggerIfPresent(session, resp, CARD_ID)
  resp = resolveNonSkipChoice(session, resp)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
  expect(resp.interaction.sourceCard).toBe(CARD_ID)
  expect(resp.interaction.request.selection?.kind).toBe('farm-position')
  return resp
}

const selectPositions = (session: GameSession, positions: FarmTilePosition[]) =>
  session.commitSelectionChoice(0, { positions })

const fieldCounts = (player: PlayerState) =>
  player.fields.map((field) => field.stacks.at(-1)?.remaining ?? 0)

describe('B165_GameProvider session', () => {
  it('B165 S1: playing Game Provider through Lessons leaves it in play', () => {
    const session = new GameSession(5165, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.resources.food = 5
    })
    state.players[0]!.occupationHand = [CARD_ID]
    session.loadState(state)

    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') return
      const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
      expect(option, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(0, option!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B165 S2: lets player discard 1 grain field for 1 boar', () => {
    const session = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
    ])
    let resp = acceptB165(session)

    expect(resp.interaction.request.selection?.selectablePositions).toEqual([{ row: 0, col: 0 }])

    resp = selectPositions(session, [{ row: 0, col: 0 }])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(1)
    expect(fieldCounts(player)).toEqual([0])
  })

  it('lets player discard grain from one Card Field', () => {
    const session = setupHarvest([])
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push('B113_PatchCaregiver')
    player.cardStates.B113_PatchCaregiver = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 3 }] },
    }
    session.loadState(state)
    let resp = acceptB165(session)

    expect(resp.interaction.request.selection?.selectablePositions).toEqual([{
      row: -1,
      col: 2113,
      sourceCard: 'B113_PatchCaregiver',
      groupKey: 'B113_PatchCaregiver',
      cardFieldSlot: 0,
    }])
    resp = selectPositions(session, [{ row: -1, col: 2113 }])

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.state.players[0]!.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 1 },
    ])
  })

  it('B165 S5: rejects exactly 2 selected grain fields without mutating grain or boar', () => {
    const session = setupHarvest()
    let resp = acceptB165(session)

    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 1 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection count')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe(CARD_ID)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(0)
    expect(fieldCounts(player)).toEqual([3, 3, 3])
  })

  it('B165 S3: selecting 3 grain fields gains 2 boars', () => {
    const session = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
    ])
    let resp = acceptB165(session)

    resp = selectPositions(session, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(2)
    expect(fieldCounts(player)).toEqual([0, 0, 0])
  })

  it('B165 S4: selecting 4 grain fields gains 3 boars', () => {
    const session = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] },
    ])
    let resp = acceptB165(session)

    resp = selectPositions(session, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ])

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.resources.boar).toBe(3)
    expect(fieldCounts(resp.state.players[0]!)).toEqual([0, 0, 0, 0])
  })

  it('B165 S6: without a grain field Game Provider is not offered', () => {
    const response = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources.boar).toBe(0)
  })

  it('rejects non-selectable crop field without partial mutation', () => {
    const session = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ])
    let resp = acceptB165(session)

    expect(resp.interaction.request.selection?.selectablePositions).toEqual([{ row: 0, col: 0 }])
    resp = selectPositions(session, [{ row: 0, col: 1 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection position')

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(0)
    expect(fieldCounts(player)).toEqual([3, 2])
  })
})
