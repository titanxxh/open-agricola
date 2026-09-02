import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import {
  markAllWorkersUsed,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  resolveNonSkipChoice,
  resolveSkipChoice,
  resolveTriggerIfPresent,
} from './_helpers/trigger-select'

import '../../shared/cards/D/D071_Changeover'
import '../../shared/cards/D/D075_WoodField'
import '../../shared/cards/E/E070_CropRotationField'
import '../../shared/cards/E/E112_GrainThief'

const CARD_ID = 'D071_Changeover'
const ANYTIME_ID = 'D71-changeover-anytime'
const WOOD_FIELD = 'D075_WoodField'
const CROP_ROTATION_FIELD = 'E070_CropRotationField'
const GRAIN_THIEF = 'E112_GrainThief'

const setupHarvest = (options: {
  round?: number
  minorPlayed?: string[]
  occupationPlayed?: string[]
} = {}) => {
  const session = new GameSession(71)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = options.round ?? 4
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.startPlayer = index === 0
    player.resources.food = 20
    setActiveWorkerCount(player, 1)
    markAllWorkersUsed(state, player)
  })
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID, ...(options.minorPlayed ?? [])]
  player.occupationPlayed = [...(options.occupationPlayed ?? [])]
  player.fields = []
  session.loadState(state)
  return session
}

const expectSelection = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  expect(response.interaction.request.kind).toBe('selection')
  return response.interaction.request.selection?.selectablePositions ?? []
}

const takeChangeover = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.anytimeActions.map((action) => action.id)).toContain(ANYTIME_ID)
  const next = session.takeAnytimeAction(0, ANYTIME_ID)
  expectSelection(next)
  return next
}

const expectHarvestFinished = (response: SessionResponse, round: number) => {
  expect(response.state.harvestReapSummary).toBeUndefined()
  expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.selectedPositions).toBeUndefined()
  expect(response.state.players[0]!.resources.begging).toBe(0)
  expect(response.state.players[0]!.resources.food).toBe(18)
  expect(response.scores).toHaveLength(2)
  if (round === 14) {
    expect(response.state.gameOver).toBe(true)
    expect(response.interaction.stateId).toBe('gameover')
  } else {
    expect(response.state.round).toBe(round + 1)
    expect(response.state.roundPhase).toBe('work')
    expect(response.interaction.stateId).toBe('idle')
  }
}

describe('D071 Changeover session', () => {
  it('does not offer the action for a field that was not reaped this harvest', () => {
    const session = new GameSession(71)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 2
    state.roundPhase = 'work'
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push(CARD_ID)
    player.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] }]
    session.loadState(state)

    const response = session.takeAction(0, 'farmland')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.anytimeActions.map((action) => action.id)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 1 }])
    expect(response.state.harvestReapSummary).toBeUndefined()
    expect(response.scores).toHaveLength(2)
  })

  it('offers only the ordinary field actually reaped to one crop', () => {
    const session = setupHarvest({ occupationPlayed: [GRAIN_THIEF] })
    session.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]
    session.loadState(session.state)

    let response = session.performRoundEnd()
    response = resolveTriggerIfPresent(session, response, GRAIN_THIEF)
    response = resolveNonSkipChoice(session, response)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe(GRAIN_THIEF)
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })

    expect(response.state.players[0]!.fields.map((field) => field.stacks[0]?.remaining)).toEqual([1, 1])
    expect(response.state.harvestReapSummary?.[response.state.players[0]!.id]?.harvestedPositions)
      .toEqual([{ row: 0, col: 2 }])
    response = takeChangeover(session, response)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.selection?.selectablePositions
      : []).toEqual([{ row: 0, col: 2 }])
    const eventCount = response.state.events.length
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    response = resolveSkipChoice(session, response)

    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(response.state.players[0]!.fields[1]!.stacks).toEqual([{ kind: 'grain', remaining: 1 }])
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.cropRemoved',
        sourceCardId: CARD_ID,
        reason: 'cardEffect',
      }),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.reapDetail' }),
      expect.objectContaining({
        key: 'log.farmCropRemoved',
        params: expect.objectContaining({ crops: { grain: 1 } }),
      }),
    ]))
    expectHarvestFinished(response, 4)
  })

  it.each([
    { round: 4, sow: true },
    { round: 4, sow: false },
    { round: 14, sow: true },
  ])('removes an ordinary reaped field, optionally sows it, and resumes round $round', ({ round, sow }) => {
    const session = setupHarvest({ round })
    session.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 3, stacks: [] },
    ]
    session.state.players[0]!.resources.grain = 0
    session.loadState(session.state)

    let response = takeChangeover(session, session.performRoundEnd())
    const eventCount = response.state.events.length
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })

    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).toBe(CARD_ID)
    if (sow) {
      response = resolveNonSkipChoice(session, response)
      expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select'
        ? response.interaction.request.farm.selectableFields.map((field) => field.tile)
        : []).toEqual([{ row: 0, col: 2 }])
      response = session.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 2, crop: 'grain' }],
      })
      expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
      expect(response.state.players[0]!.resources.grain).toBe(0)
    } else {
      response = resolveSkipChoice(session, response)
      expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
    }
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'farm.cropRemoved', sourceCardId: CARD_ID }),
      ...(sow ? [expect.objectContaining({ type: 'farm.sown', sourceCardId: CARD_ID })] : []),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.reapDetail' }),
      expect.objectContaining({ key: 'log.farmCropRemoved' }),
      ...(sow ? [expect.objectContaining({ key: 'log.sow' })] : []),
    ]))
    expectHarvestFinished(response, round)
  })

  it('removes and re-sows the same D075 virtual field', () => {
    const session = setupHarvest({ minorPlayed: [WOOD_FIELD] })
    const player = session.state.players[0]!
    player.resources.wood = 0
    player.cardStates[WOOD_FIELD] = {
      extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 2 }] },
    }
    session.loadState(session.state)

    let response = session.performRoundEnd()
    expect(response.state.harvestReapSummary?.[player.id]?.harvestedPositions).toContainEqual({
      row: -1,
      col: 4075,
    })
    response = takeChangeover(session, response)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.selection?.selectablePositions
      : []).toEqual([{
      row: -1,
      col: 4075,
      sourceCard: WOOD_FIELD,
      groupKey: WOOD_FIELD,
      cardFieldSlot: 0,
    }])
    const eventCount = response.state.events.length
    response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 4075 }] })

    expect(response.state.players[0]!.cardStates[WOOD_FIELD]?.extraData?.cardFieldStacks).toEqual([null, null])
    response = resolveNonSkipChoice(session, response)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select'
      ? response.interaction.request.farm.selectableFields
      : []).toEqual([expect.objectContaining({
      tile: { row: -1, col: 4075 },
      sourceCard: WOOD_FIELD,
      allowedCrops: ['wood'],
    })])
    response = session.commitSelectionChoice(0, {
      crops: [{ row: -1, col: 4075, crop: 'wood' }],
    })

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates[WOOD_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 3 },
      null,
    ])
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.cropRemoved',
        sourceCardId: CARD_ID,
        crops: [{
          location: { kind: 'card', playerId: player.id, cardId: WOOD_FIELD },
          crop: 'wood',
          amount: 1,
        }],
      }),
      expect.objectContaining({ type: 'farm.sown', sourceCardId: CARD_ID }),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.farmCropRemoved' }),
      expect.objectContaining({ key: 'log.sow' }),
    ]))
    expectHarvestFinished(response, 4)
  })

  it.each([
    { acceptRotation: true },
    { acceptRotation: false },
  ])('resolves E070 before D071 sow when acceptRotation=$acceptRotation', ({ acceptRotation }) => {
    const session = setupHarvest({ minorPlayed: [CROP_ROTATION_FIELD] })
    const player = session.state.players[0]!
    player.resources.grain = 0
    player.resources.vegetable = 1
    player.cardStates[CROP_ROTATION_FIELD] = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] },
    }
    session.loadState(session.state)

    let response = takeChangeover(session, session.performRoundEnd())
    const eventCount = response.state.events.length
    response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 5070 }] })

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe(CROP_ROTATION_FIELD)
    expect(response.state.players[0]!.cardStates[CROP_ROTATION_FIELD]?.extraData?.cardFieldStacks).toEqual([null])
    if (acceptRotation) {
      response = resolveNonSkipChoice(session, response)
      expect(response.state.players[0]!.cardStates[CROP_ROTATION_FIELD]?.extraData?.cardFieldStacks).toEqual([
        { crop: 'vegetable', remaining: 2 },
      ])
      expect(response.state.players[0]!.resources.vegetable).toBe(0)
      expect(response.state.events.slice(eventCount).filter((event) => event.type === 'farm.sown'))
        .toEqual([expect.objectContaining({ sourceCardId: CROP_ROTATION_FIELD })])
    } else {
      response = resolveSkipChoice(session, response)
      expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
        .toBe(CARD_ID)
      response = resolveNonSkipChoice(session, response)
      expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select'
        ? response.interaction.request.farm.selectableFields.map((field) => field.tile)
        : []).toEqual([{ row: -1, col: 5070 }])
      response = session.commitSelectionChoice(0, {
        crops: [{ row: -1, col: 5070, crop: 'grain' }],
      })
      expect(response.state.players[0]!.cardStates[CROP_ROTATION_FIELD]?.extraData?.cardFieldStacks).toEqual([
        { crop: 'grain', remaining: 3 },
      ])
      expect(response.state.events.slice(eventCount).filter((event) => event.type === 'farm.sown'))
        .toEqual([expect.objectContaining({ sourceCardId: CARD_ID })])
    }
    expect(response.state.events.slice(eventCount)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.cropRemoved',
        sourceCardId: CARD_ID,
        crops: [{
          location: { kind: 'card', playerId: player.id, cardId: CROP_ROTATION_FIELD },
          crop: 'grain',
          amount: 1,
        }],
      }),
    ]))
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.farmCropRemoved' }),
      expect.objectContaining({ key: 'log.sow' }),
    ]))
    expectHarvestFinished(response, 4)
  })
})
