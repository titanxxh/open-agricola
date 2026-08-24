import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { getWorkerHeldOnCard } from '../../shared/cards/helpers/card-held-workers'
import { familySize, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { runCardListeners } from '../../shared/cards/card-listeners'
import type { ActionFlow, Resource, SessionResponse } from '../../shared/contract/types'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'

const M052 = 'M052_WeddingCoach'
const M053 = 'M053_ForestHut'
const PLACEHOLDER = '__test_placeholder__'

const resources = (overrides: Partial<Resource> = {}): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  fuel: 0,
  horse: 0,
  ...overrides,
})

const setup = (cardId: string) => {
  const session = new GameSession(410, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.resources = resources(index === 0
      ? { wood: 10, food: 10, horse: cardId === M052 ? 4 : 0 }
      : {})
    player.minorHand = index === 0 ? [cardId] : [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = index === 0 && cardId === M052
      ? [{
          id: 'horse-pasture',
          size: 2,
          tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
          stables: 0,
          animalType: 'horse',
          animalCount: 4,
        }]
      : []
    player.stableTiles = []
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'forest' },
      { row: 0, col: 1, kind: 'forest' },
    ]
    setWorkersAtHome(state, player, index === 0 ? 1 : 0)
  })
  session.loadState(state)
  return session
}

const chooseFirstPayment = (session: GameSession, response: SessionResponse) => {
  let resp = response
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const payment = resp.interaction.request.options?.[0]
    expect(payment).toBeDefined()
    resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, payment!.value)
    expect(resp.ok).toBe(true)
  }
  return resp
}

const playMinor = (session: GameSession, cardId: string) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp

  const improvementOption = resp.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-')
  )
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }

  resp = chooseFirstPayment(session, resp)
  if (!resp.state.players[0]!.minorPlayed.includes(cardId)) {
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return resp
    const cardOption = resp.interaction.request.options?.find((option) => option.value === cardId)
    expect(cardOption).toBeDefined()
    resp = session.resolveChoice(0, cardOption!.value)
    expect(resp.ok).toBe(true)
    resp = chooseFirstPayment(session, resp)
  }
  return resp
}

const acceptOptional = (session: GameSession, response: SessionResponse) => {
  let resp = response
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.request.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
  expect(resp.ok).toBe(true)
  return resp
}

const finishConfirmIfNeeded = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
    const resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    return resp
  }
  return response
}

const chooseForestBinding = (
  session: GameSession,
  response: SessionResponse,
  position = { row: 0, col: 0 },
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.sourceCard).toBe(M053)
  const resp = session.commitSelectionChoice(response.interaction.playerIndex ?? 0, {
    positions: [position],
  })
  expect(resp.ok).toBe(true)
  return resp
}

const findSpecialCard = (session: GameSession, actionId: string) =>
  session.getState().state.farmersOfTheMoor!.specialActionCards.find((card) =>
    card.actions.includes(actionId as never),
  )!

const actionIds = (flow: ActionFlow | undefined): string[] => {
  if (!flow) return []
  if (flow.type === 'leaf') return [flow.actionId]
  return flow.children.flatMap(actionIds)
}

const applySpecialEffects = (
  flow: ActionFlow | undefined,
  state: SessionResponse['state'],
  player: SessionResponse['state']['players'][number],
) => {
  if (!flow) return
  if (flow.type !== 'leaf') {
    flow.children.forEach((child) => applySpecialEffects(child, state, player))
    return
  }
  if (flow.actionId === 'special-effect') {
    specialEffectAction.execute({
      state,
      player,
      params: flow.params,
      sourceCard: flow.sourceCard,
      actionContext: flow.actionContext,
    } as never)
  }
}

describe('M052/M053 temporary people', () => {
  it('M052 grows without room, holds the newborn on the card, and releases it at returning home', () => {
    const session = setup(M052)
    let resp = playMinor(session, M052)
    resp = acceptOptional(session, resp)

    const player = resp.state.players[0]!
    const heldWorkerId = getWorkerHeldOnCard(player, M052)
    expect(heldWorkerId).toBeDefined()
    expect(player.workers.find((worker) => worker.id === heldWorkerId)).toMatchObject({
      isActive: true,
      isNewborn: true,
    })
    expect(familySize(player)).toBe(3)
    expect(workersAvailable(resp.state, player)).toBe(0)
    expect(resp.state.actionSpaces.some((space) =>
      space.takenBy.some((worker) => worker.playerId === player.id && worker.workerId === heldWorkerId)
    )).toBe(false)

    resp = finishConfirmIfNeeded(session, resp)
    expect(resp.ok).toBe(true)

    const returned = resp.state.players[0]!
    expect(getWorkerHeldOnCard(returned, M052)).toBeUndefined()
    expect(returned.workers.find((worker) => worker.id === heldWorkerId)).toMatchObject({
      isActive: true,
      isNewborn: true,
    })
  })

  it('M053 binds a supply person to a forest, unlocks it when that forest is removed, and returns it home', () => {
    const session = setup(M053)
    let resp = playMinor(session, M053)
    resp = chooseForestBinding(session, resp)

    const stateBeforeRemoval = session.getState().state
    stateBeforeRemoval.round = 5
    stateBeforeRemoval.roundPhase = 'work'
    stateBeforeRemoval.currentPlayerIndex = 0
    stateBeforeRemoval.actionSpaces.forEach((space) => { space.takenBy = [] })
    setWorkersAtHome(stateBeforeRemoval, stateBeforeRemoval.players[0]!, 1)
    setWorkersAtHome(stateBeforeRemoval, stateBeforeRemoval.players[1]!, 0)
    session.loadState(stateBeforeRemoval)

    let player = session.getState().state.players[0]!
    const workerId = player.cardStates[M053]?.extraData?.temporaryWorkerId
    expect(workerId).toBe('3')
    expect(player.workers.find((worker) => worker.id === workerId)).toMatchObject({
      isActive: false,
      removedFromSupply: true,
    })
    expect(player.cardStates[M053]?.extraData?.boundForest).toEqual({ row: 0, col: 0 })
    expect(player.cardStates[M053]?.extraData?.farmTerrainMarkers).toEqual([
      expect.objectContaining({ row: 0, col: 0, kind: 'person', workerId }),
    ])

    const card = findSpecialCard(session, 'fell-trees')
    resp = session.takeSpecialAction(0, card.id, 'fell-trees', { tile: { row: 0, col: 0 } })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(M053)

    resp = acceptOptional(session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, 'forest')
    expect(resp.ok).toBe(true)

    player = resp.state.players[0]!
    expect(familySize(player)).toBe(2)
    expect(workersAvailable(resp.state, player)).toBe(1)
    expect(player.workers.find((worker) => worker.id === workerId)).toMatchObject({
      isActive: false,
      removedFromSupply: true,
    })
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
      .toEqual(expect.arrayContaining([{ playerId: player.id, workerId }]))
    expect(player.cardStates[M053]?.extraData?.boundForest).toBeUndefined()
    expect(player.cardStates[M053]?.extraData?.farmTerrainMarkers).toEqual([])

    const endState = session.getState().state
    setWorkersAtHome(endState, endState.players[0]!, 0)
    setWorkersAtHome(endState, endState.players[1]!, 0)
    session.loadState(endState)
    resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    player = resp.state.players[0]!
    expect(player.workers.find((worker) => worker.id === workerId)).toMatchObject({
      isActive: false,
      isNewborn: false,
      removedFromSupply: false,
    })
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy ?? []).toEqual([])
  })

  it('M053 unlocks when Fell Trees removes the bound forest but reveals covered terrain', () => {
    const session = setup(M053)
    let resp = playMinor(session, M053)
    resp = chooseForestBinding(session, resp)

    const state = resp.state
    const player = state.players[0]!
    const workerId = player.cardStates[M053]?.extraData?.temporaryWorkerId
    player.farmTerrain = [{ row: 0, col: 0, kind: 'moor' }]

    const result = runCardListeners({
      state,
      player,
      actionId: 'fell-trees',
      phase: 'after',
      extraData: {
        payload: { tile: { row: 0, col: 0 } },
        terrainCleared: false,
      },
    })

    expect(result.flatMap((entry) => actionIds(entry.flow))).toEqual([
      'special-effect',
      'special-effect',
      'place-farmer',
    ])
    expect(player.cardStates[M053]?.extraData?.boundForest).toEqual({ row: 0, col: 0 })
    result.forEach((entry) => applySpecialEffects(entry.flow, state, player))
    expect(player.cardStates[M053]?.extraData?.boundForest).toBeUndefined()
    expect(player.cardStates[M053]?.extraData?.farmTerrainMarkers).toEqual([])
    expect(workerId).toBeDefined()
  })

  it('M053 unlocks when a terrain selection turns the bound forest into moor', () => {
    const session = setup(M053)
    let resp = playMinor(session, M053)
    resp = chooseForestBinding(session, resp)

    const state = resp.state
    const player = state.players[0]!
    player.farmTerrain = [{ row: 0, col: 0, kind: 'moor' }]

    const result = runCardListeners({
      state,
      player,
      actionId: 'selection',
      phase: 'after',
      actionContext: {
        terrainMode: 'replace-kind',
        terrainFromKind: 'forest',
        terrainToKind: 'moor',
      },
      result: {
        type: 'ok',
        extraData: { selectedPositions: ['0-0'] },
      },
    })

    expect(result.flatMap((entry) => actionIds(entry.flow))).toEqual([
      'special-effect',
      'special-effect',
      'place-farmer',
    ])
    expect(player.cardStates[M053]?.extraData?.boundForest).toEqual({ row: 0, col: 0 })
    result.forEach((entry) => applySpecialEffects(entry.flow, state, player))
    expect(player.cardStates[M053]?.extraData?.boundForest).toBeUndefined()
    expect(player.cardStates[M053]?.extraData?.farmTerrainMarkers).toEqual([])
  })
})
