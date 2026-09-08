import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { getWorkerHeldOnCard } from '../../shared/cards/helpers/card-held-workers'
import { familySize, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import type { Resource, SessionResponse } from '../../shared/contract/types'
import { chooseSupplyWorkerTurn, takeNormalWorkerTurn } from './_helpers/supply-worker-turn'
import { inactiveWorkersInSupply, setActiveWorkerCount } from '../../shared/domain/player'

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

const setup = (cardId: string, covered = false, extraMinor?: string) => {
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
      ? { wood: 10, food: 20, fuel: 20, horse: cardId === M052 ? 4 : 0 }
      : { food: 20, fuel: 20 })
    player.minorHand = index === 0 ? [cardId, ...(extraMinor ? [extraMinor] : [])] : [PLACEHOLDER]
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
      { row: 0, col: 0, kind: 'forest', ...(covered ? { covered: 'moor' as const } : {}) },
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
  if (resp.state.players[0]!.minorHand.includes(cardId)) {
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

  const startBoundRound = (covered = false, extraMinor?: string) => {
    const session = setup(M053, covered, extraMinor)
    const purchase = chooseForestBinding(session, playMinor(session, M053))
    expect(purchase.state.players[0]!.resources.wood).toBe(8)
    const workerId = purchase.state.players[0]!.cardStates[M053]?.extraData?.temporaryWorkerId
    expect(workerId).toBe('3')
    expect(inactiveWorkersInSupply(purchase.state.players[0]!)).toHaveLength(2)
    let response = finishConfirmIfNeeded(session, purchase)
    for (let step = 0; step < 12 && response.state.round === 4 && response.interaction.stateId === 'wait'; step++) {
      if (response.interaction.request.kind === 'heating') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', {
          fuelUsed: response.interaction.request.required, woodToFuel: 0,
        })
        expect(response.ok, response.error).toBe(true)
        continue
      }
      const skip = response.interaction.request.options?.find((option) => option.value === '__skip__')
      expect(skip, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, skip!.value)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.round, JSON.stringify(response.interaction)).toBe(5)
    expect(response.state.players[0]!.workers.find((worker) => worker.id === workerId)?.supplyUse)
      .toMatchObject({ sourceCard: M053, status: 'reserved' })
    expect(response.state.players[0]!.cardStates[M053]?.extraData?.boundForest).toEqual({ row: 0, col: 0 })
    return session
  }

  it.each([false, true])('M053 keeps the bound person across rounds and unlocks after Fell Trees, covered=%s', (covered) => {
    const session = startBoundRound(covered)
    const card = findSpecialCard(session, 'fell-trees')
    const removed = session.takeSpecialAction(0, card.id, 'fell-trees', { tile: { row: 0, col: 0 } })
    expect(removed.ok, removed.error).toBe(true)
    expect(removed.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(removed.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse)
      .toMatchObject({ status: 'reserved', returnRound: 5 })
    if (covered) expect(removed.state.players[0]!.farmTerrain).toContainEqual({ row: 0, col: 0, kind: 'moor' })
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    chooseSupplyWorkerTurn(session, M053)
    const placed = session.resolveChoice(0, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    const player = placed.state.players[0]!
    expect(familySize(player)).toBe(2)
    expect(workersAvailable(placed.state, player)).toBe(2)
    expect(player.workers.find((worker) => worker.id === '3')?.supplyUse)
      .toMatchObject({ sourceCard: M053, status: 'temporary' })
    expect(placed.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
      .toContainEqual({ playerId: player.id, workerId: '3' })
    expect(player.cardStates[M053]?.extraData?.farmTerrainMarkers).toEqual([])
    expect(confirmNextPlayer(session).ok).toBe(true)
    for (const spaceId of ['clay-pit', 'reed-bank', 'grain-seeds']) {
      const response = takeNormalWorkerTurn(session, spaceId)
      expect(response.ok, response.error).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }
    const returned = session.getState()
    expect(returned.state.round, JSON.stringify(returned.interaction)).toBe(6)
    expect(inactiveWorkersInSupply(returned.state.players[0]!)).toHaveLength(3)
    expect(returned.state.players[0]!.workers.find((worker) => worker.id === '3'))
      .toMatchObject({ isActive: false, isNewborn: false })
    expect(returned.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse).toBeUndefined()
    expect(returned.state.events).toContainEqual(expect.objectContaining({
      type: 'worker.returned', to: 'supply', workers: expect.arrayContaining([{ playerId: player.id, workerId: '3' }]),
    }))
  })

  it('M053 unlocks through a real terrain conversion selection', () => {
    const session = startBoundRound(false, 'M016_ClearFelling')
    const purchase = playMinor(session, 'M016_ClearFelling')
    expect(purchase.interaction.stateId).toBe('wait')
    const converted = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 0 }] })
    expect(converted.ok, converted.error).toBe(true)
    expect(converted.state.players[0]!.farmTerrain).toContainEqual({ row: 0, col: 0, kind: 'moor' })
    expect(converted.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse)
      .toMatchObject({ status: 'reserved', returnRound: 5 })
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    const pending = chooseSupplyWorkerTurn(session, M053)
    expect(pending.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse?.status).toBe('pending')
    expect(session.resolveChoice(0, 'forest').ok).toBe(true)
  })

  it('M053 keeps its reservation when another forest is removed', () => {
    const session = startBoundRound()
    const card = findSpecialCard(session, 'fell-trees')
    const removed = session.takeSpecialAction(0, card.id, 'fell-trees', { tile: { row: 0, col: 1 } })
    expect(removed.ok, removed.error).toBe(true)
    expect(removed.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse?.returnRound).toBeUndefined()
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    const next = confirmNextPlayer(session)
    expect(next.ok, next.error).toBe(true)
    expect(next.interaction.stateId).toBe('idle')
    expect(inactiveWorkersInSupply(next.state.players[0]!)).toHaveLength(2)
  })

  it('M053 leaves a normal Moor special action available while its placement is pending', () => {
    const session = startBoundRound()
    const card = findSpecialCard(session, 'fell-trees')
    expect(session.takeSpecialAction(0, card.id, 'fell-trees', { tile: { row: 0, col: 0 } }).ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    const turn = confirmNextPlayer(session)
    expect(turn.interaction.stateId).toBe('wait')
    if (turn.interaction.stateId !== 'wait') return
    const special = turn.interaction.request.options?.find((option) => option.labelKey === 'actions.moor-special-action-choice.name')
    expect(special, JSON.stringify(turn.interaction)).toBeDefined()
    let response = session.resolveChoice(0, special!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const hiring = response.interaction.request.options?.find((option) => option.labelKey === 'moor.specialActions.hiring-fair')
    expect(hiring, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, hiring!.value)
    expect(response.ok, response.error).toBe(true)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(2)
    expect(response.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse?.status).toBe('reserved')
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
  })

  it('M053 returns an unlocked person even when its optional turn is declined', () => {
    const session = startBoundRound()
    const card = findSpecialCard(session, 'fell-trees')
    expect(session.takeSpecialAction(0, card.id, 'fell-trees', { tile: { row: 0, col: 0 } }).ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    for (const spaceId of ['day-laborer', 'forest', 'clay-pit', 'reed-bank']) {
      expect(takeNormalWorkerTurn(session, spaceId).ok).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }
    const pending = session.getState()
    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait') return
    const decline = pending.interaction.request.options?.find((option) => option.labelKey === 'ui.interactionDecline')
    expect(decline, JSON.stringify(pending.interaction)).toBeDefined()
    expect(session.resolveChoice(0, decline!.value).ok).toBe(true)
    const returned = confirmNextPlayer(session)
    expect(returned.ok, returned.error).toBe(true)
    expect(returned.state.round).toBe(6)
    expect(inactiveWorkersInSupply(returned.state.players[0]!)).toHaveLength(3)
    expect(returned.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse).toBeUndefined()
  })


  it.each(['no-forest', 'no-supply'])('M053 does not bind a person with %s', (condition) => {
    const session = setup(M053)
    const state = session.getState().state
    if (condition === 'no-forest') state.players[0]!.farmTerrain = []
    else setActiveWorkerCount(state.players[0]!, 5)
    session.loadState(state)
    const response = playMinor(session, M053)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(M053)
    expect(response.state.players[0]!.cardStates[M053]?.extraData?.temporaryWorkerId).toBeUndefined()
    expect(response.state.players[0]!.workers.some((worker) => worker.supplyUse !== undefined)).toBe(false)
  })

})
