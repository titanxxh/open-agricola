import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { hasPendingExtraTurn } from '../../shared/cards/card-effects'
import { getCardEffect } from '../../shared/cards/card-effects'
import { readActionSnapshotToken } from '../../shared/cards/helpers/action-snapshot'
import {
  markAllWorkersUsed,
  newbornCount,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../../shared/domain/player'

import '../../shared/cards/E/E010_StrawHat'
import '../../shared/cards/A/A074_StableTree'
import '../../shared/cards/A/A092_AdoptiveParents'
import '../../shared/cards/B/B151_LittlePeasant'
import '../../shared/cards/C/C002_Stable'
import '../../shared/cards/D/D050_ForeignAid'
import '../../shared/cards/D/D051_Archway'

const CARD_ID = 'E010_StrawHat'
const A092_ID = 'A092_AdoptiveParents'
const D050_ID = 'D050_ForeignAid'
const D051_ID = 'D051_Archway'
const A074_ID = 'A074_StableTree'

const requestKind = (resp: ReturnType<GameSession['takeAction']>): string =>
  resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : 'idle'

const placeableSpaces = (session: GameSession) =>
  session
    .getState()
    .state.actionSpaces.filter((space) =>
      space.id !== '__test-worker-sink__' &&
      (!space.takenBy || space.takenBy.length === 0) &&
      (space.roundAvailable ?? 1) <= session.getState().state.round,
    )
    .map((space) => space.id)

const setupRoundEnd = (options?: {
  farmlandWorkerIds?: string[]
  occupationHand?: string[]
}) => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundPhase = 'work'

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.occupationHand = options?.occupationHand ?? ['A116_WoodCutter']
  player.resources.food = 5
  player.minorHand = ['__test_placeholder__']

  const opponent = state.players[1]!
  opponent.minorHand = ['__test_placeholder__']
  opponent.occupationHand = ['__test_placeholder__']

  const farmland = state.actionSpaces.find((space) => space.id === 'farmland')!
  const farmlandWorkerIds = options?.farmlandWorkerIds ?? ['1']
  farmland.takenBy = farmlandWorkerIds.map((workerId) => ({ playerId: player.id, workerId }))
  if (farmlandWorkerIds.length > 1) player.occupationPlayed.push('B151_LittlePeasant')
  markAllWorkersUsed(state, player)
  markAllWorkersUsed(state, opponent)

  session.loadState(state)
  return session
}

const setupStrawHatStableTurns = () => {
  const session = setupRoundEnd({
    farmlandWorkerIds: ['1', '2'],
    occupationHand: ['__test_placeholder__'],
  })
  const state = session.getState().state
  const player = state.players[0]!
  player.minorPlayed.push(A074_ID)
  player.minorHand = ['C002_Stable']
  player.resources.wood = 5
  player.resources.reed = 0
  session.loadState(state)
  return session
}

describe('E010_StrawHat session', () => {
  it('choosing food gains exactly 1 food without opening a turn scope', () => {
    const session = setupRoundEnd()
    const state = session.getState().state
    state.players[0]!.minorPlayed.push(A074_ID)
    session.loadState(state)
    const beforeFood = session.getState().state.players[0]!.resources.food

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected StrawHat choice')
    expect(resp.interaction.request.options?.some(option => option.value === '__skip__')).toBe(false)

    resp = session.resolveChoice(0, resp.interaction.request.options![0]!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(beforeFood + 1)
    expect(resp.state.events.some(
      (event) => event.type === 'futureMeeple.queued' && event.sourceCardId === A074_ID,
    )).toBe(false)
    expect(readActionSnapshotToken(resp.state.players[0]!)).toBeUndefined()
  })

  it('choosing move clears Farmland and resolves the target action flow', () => {
    const session = setupRoundEnd()

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected StrawHat choice')

    resp = session.resolveChoice(0, resp.interaction.request.options![1]!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected move target choice')

    const lessonsOption = resp.interaction.request.options?.find(option => option.value === 'lessons')
    expect(lessonsOption).toBeDefined()
    resp = session.resolveChoice(0, lessonsOption!.value)

    const farmland = resp.state.actionSpaces.find((space) => space.id === 'farmland')!
    expect(farmland.takenBy).toEqual([])
    expect(resp.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(resp.interaction.stateId).toBe('idle')
  })

  it('offers food or movement separately for each worker on Farmland', () => {
    const session = setupRoundEnd({
      farmlandWorkerIds: ['1', '2'],
      occupationHand: ['A116_WoodCutter', 'A117_WoodCarrier'],
    })
    const beforeFood = session.getState().state.players[0]!.resources.food

    let resp = session.performRoundEnd()
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first worker choice')
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(false)
    resp = session.resolveChoice(0, resp.interaction.request.options![1]!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first move target')
    resp = session.resolveChoice(0, 'forest')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected second worker choice')
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(false)
    expect(resp.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy)
      .toEqual([{ playerId: resp.state.players[0]!.id, workerId: '2' }])
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
      .toContainEqual({ playerId: resp.state.players[0]!.id, workerId: '1' })
    resp = session.resolveChoice(0, resp.interaction.request.options![0]!.value)

    expect(resp.state.players[0]!.resources.food).toBe(beforeFood + 1)
    expect(resp.state.round).toBe(4)
  })

  it('moves both Farmland workers independently', () => {
    const session = setupRoundEnd({
      farmlandWorkerIds: ['1', '2'],
      occupationHand: ['A116_WoodCutter', 'A117_WoodCarrier'],
    })

    let resp = session.performRoundEnd()
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first worker choice')
    const firstMove = resp.interaction.request.options?.find((option) =>
      option.labelKey === 'actions.move-farmer-to-space.name'
    )
    resp = session.resolveChoice(0, firstMove!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first move target')
    resp = session.resolveChoice(0, 'forest')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected second worker choice')
    const secondMove = resp.interaction.request.options?.find((option) =>
      option.labelKey === 'actions.move-farmer-to-space.name'
    )
    resp = session.resolveChoice(0, secondMove!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected second move target')
    resp = session.resolveChoice(0, 'lessons')

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy).toEqual([])
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
      .toContainEqual({ playerId: resp.state.players[0]!.id, workerId: '1' })
    expect(resp.state.actionSpaces.find((space) => space.id === 'lessons')?.takenBy)
      .toContainEqual({ playerId: resp.state.players[0]!.id, workerId: '2' })
  })

  it('opens a separate turn for each moved Farmland worker', () => {
    const session = setupStrawHatStableTurns()
    let resp = session.performRoundEnd()
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first worker choice')
    const firstMove = resp.interaction.request.options?.find(
      (option) => option.labelKey === 'actions.move-farmer-to-space.name',
    )
    resp = session.resolveChoice(0, firstMove!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first move target')
    resp = session.resolveChoice(0, 'farm-expansion')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first stable selection')
    if (resp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stable selection')
    const firstStable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [firstStable] })

    expect(resp.interaction.stateId).toBe('wait')
    expect(readActionSnapshotToken(resp.state.players[0]!)).toBeUndefined()
    expect(resp.state.events.filter(
      (event) => event.type === 'futureMeeple.queued' && event.sourceCardId === A074_ID,
    )).toHaveLength(1)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected second worker choice')
    const secondMove = resp.interaction.request.options?.find(
      (option) => option.labelKey === 'actions.move-farmer-to-space.name',
    )
    resp = session.resolveChoice(0, secondMove!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected second move target')
    expect(resp.interaction.request.options?.some((option) => option.value === 'meeting-place'))
      .toBe(true)
    resp = session.resolveChoice(0, 'meeting-place')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected minor improvement offer')
    const acceptMinor = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    resp = session.resolveChoice(0, acceptMinor!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected minor improvement selection')
    const stableCard = resp.interaction.request.options?.find((option) => option.value === 'C002_Stable')
    if (stableCard) resp = session.resolveChoice(0, stableCard.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected second stable selection')
    if (resp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stable selection')
    const secondStable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [secondStable] })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles).toHaveLength(2)
    const queued = resp.state.events.filter(
      (event) => event.type === 'futureMeeple.queued' && event.sourceCardId === A074_ID,
    )
    expect(queued).toHaveLength(2)
    expect(queued.every((event) => event.entries.length === 3)).toBe(true)
    expect(readActionSnapshotToken(resp.state.players[0]!)).toBeUndefined()
  })

  it('moving an A92 extra-turn worker does not lose or duplicate the A92 opportunity', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 1
    state.round = 3
    state.roundPhase = 'work'

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationPlayed.push(A092_ID)
    player.resources.food = 5
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['A116_WoodCutter']
    setActiveWorkerCount(player, 1)
    setWorkersAtHome(state, player, 0)
    const newborn = player.workers.find((worker) => worker.isActive)!
    newborn.isNewborn = true
    state.actionSpaces.find((space) => space.id === 'forest')!.takenBy = [
      { playerId: player.id, workerId: newborn.id },
    ]

    const opponent = state.players[1]!
    opponent.minorHand = ['__test_placeholder__']
    opponent.occupationHand = ['__test_placeholder__']
    setActiveWorkerCount(opponent, 1)
    setWorkersAtHome(state, opponent, 1)

    session.loadState(state)

    let resp = session.takeAction(
      1,
      placeableSpaces(session).find((id) => id !== 'farmland' && id !== 'lessons')!,
    )
    while (requestKind(resp) === 'confirm-next-player') {
      if (resp.interaction.stateId !== 'wait') throw new Error('expected confirm-next-player')
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm')
    }

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFlowSelect')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected A92 choice')
    expect(hasPendingExtraTurn(resp.state, resp.state.players[0]!)).toBe(true)

    resp = session.resolveChoice(0, resp.interaction.request.options![0]!.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionPlaceFarmerExtra')
    expect(newbornCount(resp.state.players[0]!)).toBe(0)
    expect(hasPendingExtraTurn(resp.state, resp.state.players[0]!)).toBe(false)

    resp = session.resolveChoice(0, 'farmland')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionPlowSelect')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow selection')
    const tile = resp.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()

    resp = session.commitSelectionChoice(0, { tile })
    expect(requestKind(resp)).toBe('confirm-next-player')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected confirm-next-player')
    resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFlowSelect')
    expect(resp.interaction.stateId === 'wait'
      ? resp.interaction.request.options?.map((option) => option.sourceCard)
      : []).toEqual([CARD_ID, CARD_ID])

    if (resp.interaction.stateId !== 'wait') throw new Error('expected E10 choice')
    const move = resp.interaction.request.options!.find((option) => option.labelKey === 'actions.move-farmer-to-space.name')!
    resp = session.resolveChoice(0, move.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionMoveFarmerToSpace')

    resp = session.resolveChoice(0, 'lessons')

    expect(resp.state.round).toBe(4)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(resp.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy).toEqual([])
    expect(hasPendingExtraTurn(resp.state, resp.state.players[0]!)).toBe(false)
    expect(newbornCount(resp.state.players[0]!)).toBe(0)
  })
})

const setupArchwayRoundEnd = (withAllowedTarget: boolean) => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  const player = state.players[0]!
  const opponent = state.players[1]!
  player.minorPlayed.push(D050_ID, D051_ID)
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  opponent.minorHand = ['__test_placeholder__']
  opponent.occupationHand = ['__test_placeholder__']
  setActiveWorkerCount(player, 1)
  setActiveWorkerCount(opponent, 0)
  player.resources.food = 10
  getCardEffect(D051_ID)!.onBuy!(state, player)
  const archway = state.actionSpaces.find((space) => space.id === D051_ID)!
  archway.takenBy = [{ playerId: player.id, workerId: '1' }]
  state.roundActionOrder[11] = 'forest'
  state.roundActionOrder[12] = 'clay-pit'
  state.roundActionOrder[13] = 'day-laborer'
  for (const space of state.actionSpaces) {
    if (
      space.id === D051_ID
      || space.id === 'forest'
      || (withAllowedTarget && (space.id === 'fishing' || space.id === 'reed-bank'))
    ) continue
    space.takenBy = [{ playerId: opponent.id, workerId: `blocked-${space.id}` }]
  }
  session.loadState(state)
  return session
}

const acceptArchwayMove = (session: GameSession, resp: SessionResponse) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected Archway optional move')
  const move = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(move?.sourceCard).toBe(D051_ID)
  return session.resolveChoice(0, move!.value)
}

const setupArchwayStableTurn = () => {
  const session = new GameSession(42, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundPhase = 'work'
  const player = state.players[0]!
  const opponent = state.players[1]!
  player.minorPlayed.push(D051_ID, A074_ID)
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  opponent.minorHand = ['__test_placeholder__']
  opponent.occupationHand = ['__test_placeholder__']
  setActiveWorkerCount(player, 1)
  setActiveWorkerCount(opponent, 0)
  player.resources.food = 10
  player.resources.wood = 5
  getCardEffect(D051_ID)!.onBuy!(state, player)
  state.actionSpaces.find((space) => space.id === D051_ID)!.takenBy = [
    { playerId: player.id, workerId: '1' },
  ]
  session.loadState(state)
  return session
}

describe('D051_Archway session', () => {
  it('treats the moved worker action as a turn for Stable Tree', () => {
    const session = setupArchwayStableTurn()
    let resp = acceptArchwayMove(session, session.performRoundEnd())

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Archway move target')
    expect(resp.interaction.request.options?.some((option) => option.value === 'farm-expansion'))
      .toBe(true)

    resp = session.resolveChoice(0, 'farm-expansion')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected stable selection')
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stable selection')

    const stable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles).toContainEqual(stable)
    const queued = resp.state.events.filter(
      (event) => event.type === 'futureMeeple.queued' && event.sourceCardId === A074_ID,
    )
    expect(queued).toHaveLength(1)
    expect(queued[0]?.entries).toHaveLength(3)
    expect(resp.state.log.some((entry) => {
      const detailParts = entry.params?.detailParts as { effects?: { buildStables?: number } } | undefined
      return detailParts?.effects?.buildStables === 1
    })).toBe(true)
    expect(readActionSnapshotToken(resp.state.players[0]!)).toBeUndefined()
  })

  it('does not offer a move when every empty target is blocked by Foreign Aid', () => {
    const resp = setupArchwayRoundEnd(false).performRoundEnd()

    expect(resp.interaction.stateId).not.toBe('wait')
  })

  it('filters Foreign Aid targets and rejects a forged blocked target', () => {
    const session = setupArchwayRoundEnd(true)
    let resp = acceptArchwayMove(session, session.performRoundEnd())

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Archway move target')
    expect(resp.interaction.request.options?.some((option) => option.value === 'forest')).toBe(false)
    expect(resp.interaction.request.options?.some((option) => option.value === 'fishing')).toBe(true)

    resp = session.resolveChoice(0, 'forest')
    expect(resp.ok).toBe(false)
    expect(resp.state.actionSpaces.find((space) => space.id === D051_ID)?.takenBy)
      .toEqual([{ playerId: resp.state.players[0]!.id, workerId: '1' }])
  })
})
