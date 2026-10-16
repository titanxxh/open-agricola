import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { hasPendingExtraTurn, getCardEffect } from '../../shared/cards/card-effects'
import { readActionSnapshotToken } from '../../shared/cards/helpers/action-snapshot'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { moveMajorImprovementToSupplyTop } from '../../shared/cards/major/supply'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { markAllWorkersUsed, newbornCount, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/E/E010_StrawHat'
import '../../shared/cards/E/E024_Ambition'
import '../../shared/cards/A/A074_StableTree'
import '../../shared/cards/A/A092_AdoptiveParents'
import '../../shared/cards/B/B151_LittlePeasant'
import '../../shared/cards/C/C002_Stable'
import '../../shared/cards/D/D050_ForeignAid'
import '../../shared/cards/D/D051_Archway'
import '../../shared/cards/D/D074_RoyalWood'
import '../../shared/cards/M/M062_HearthBrush'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions, expectFarmSelection, expectTileFarmSelection } from './_helpers/session-assertions'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'E010_StrawHat'
const A092_ID = 'A092_AdoptiveParents'
const D050_ID = 'D050_ForeignAid'
const D051_ID = 'D051_Archway'
const A074_ID = 'A074_StableTree'
const D074_ID = 'D074_RoyalWood'
const E024_ID = 'E024_Ambition'
const M062_ID = 'M062_HearthBrush'
const TILED_OVEN_ID = 'Major_Moor_TiledOven'

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
  const session = evidence.track(createWorkSession({ seed: 2010 }))
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
    expect(getChoiceOptions(resp)?.some(option => option.value === '__skip__')).toBe(false)

    resp = session.resolveChoice(0, getChoiceOptions(resp)![0]!.value)

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

    resp = session.resolveChoice(0, getChoiceOptions(resp)![1]!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected move target choice')

    const lessonsOption = getChoiceOptions(resp)?.find(option => option.value === 'lessons')
    expect(lessonsOption).toBeDefined()
    resp = session.resolveChoice(0, lessonsOption!.value)

    const farmland = resp.state.actionSpaces.find((space) => space.id === 'farmland')!
    expect(farmland.takenBy).toEqual([])
    expect(resp.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(resp.interaction.stateId).toBe('idle')
  })

  it('keeps Ambition available after moving to a Minor Improvement action space', () => {
    const session = setupRoundEnd({ occupationHand: ['__test_placeholder__'] })
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(E024_ID)
    Object.assign(player.resources, { wood: 10, clay: 10, reed: 10, stone: 10 })
    session.loadState(state)

    let resp = session.performRoundEnd()
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Straw Hat choice')
    const move = getChoiceOptions(resp)?.find(
      (option) => option.labelKey === 'actions.move-farmer-to-space.name',
    )
    resp = session.resolveChoice(0, move!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected move target')
    resp = session.resolveChoice(0, 'meeting-place')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected Minor Improvement action')
    const takeImprovement = getChoiceOptions(resp)?.find(
      (option) => option.value !== '__skip__',
    )
    resp = session.resolveChoice(0, takeImprovement!.value)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected improvement choice')
    expect(getChoiceOptions(resp)?.map((option) => option.value))
      .toContain('Major_Pottery')
  })

  it('offers food or movement separately for each worker on Farmland', () => {
    const session = setupRoundEnd({
      farmlandWorkerIds: ['1', '2'],
      occupationHand: ['A116_WoodCutter', 'A117_WoodCarrier'],
    })
    const beforeFood = session.getState().state.players[0]!.resources.food

    let resp = session.performRoundEnd()
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first worker choice')
    expect(getChoiceOptions(resp)?.some((option) => option.value === '__skip__')).toBe(false)
    resp = session.resolveChoice(0, getChoiceOptions(resp)![1]!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first move target')
    resp = session.resolveChoice(0, 'forest')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected second worker choice')
    expect(getChoiceOptions(resp)?.some((option) => option.value === '__skip__')).toBe(false)
    expect(resp.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy)
      .toEqual([{ playerId: resp.state.players[0]!.id, workerId: '2' }])
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
      .toContainEqual({ playerId: resp.state.players[0]!.id, workerId: '1' })
    resp = session.resolveChoice(0, getChoiceOptions(resp)![0]!.value)

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
    const firstMove = getChoiceOptions(resp)?.find((option) =>
      option.labelKey === 'actions.move-farmer-to-space.name'
    )
    resp = session.resolveChoice(0, firstMove!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first move target')
    resp = session.resolveChoice(0, 'forest')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected second worker choice')
    const secondMove = getChoiceOptions(resp)?.find((option) =>
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
    const firstMove = getChoiceOptions(resp)?.find(
      (option) => option.labelKey === 'actions.move-farmer-to-space.name',
    )
    resp = session.resolveChoice(0, firstMove!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first move target')
    resp = session.resolveChoice(0, 'farm-expansion')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected first stable selection')
    if (expectFarmSelection(resp).farmType !== 'stable') throw new Error('expected stable selection')
    const firstStable = expectTileFarmSelection(resp, 'stable').selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [firstStable] })

    expect(resp.interaction.stateId).toBe('wait')
    expect(readActionSnapshotToken(resp.state.players[0]!)).toBeUndefined()
    expect(resp.state.events.filter(
      (event) => event.type === 'futureMeeple.queued',
    ).filter(event => event.sourceCardId === A074_ID
    )).toHaveLength(1)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected second worker choice')
    const secondMove = getChoiceOptions(resp)?.find(
      (option) => option.labelKey === 'actions.move-farmer-to-space.name',
    )
    resp = session.resolveChoice(0, secondMove!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected second move target')
    expect(getChoiceOptions(resp)?.some((option) => option.value === 'meeting-place'))
      .toBe(true)
    resp = session.resolveChoice(0, 'meeting-place')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected minor improvement offer')
    const acceptMinor = getChoiceOptions(resp)?.find((option) => option.value !== '__skip__')
    resp = session.resolveChoice(0, acceptMinor!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected minor improvement selection')
    const stableCard = getChoiceOptions(resp)?.find((option) => option.value === 'C002_Stable')
    if (stableCard) resp = session.resolveChoice(0, stableCard.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected second stable selection')
    if (expectFarmSelection(resp).farmType !== 'stable') throw new Error('expected stable selection')
    const secondStable = expectTileFarmSelection(resp, 'stable').selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [secondStable] })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles).toHaveLength(2)
    const queued = resp.state.events.filter(
      (event) => event.type === 'futureMeeple.queued',
    ).filter(event => event.sourceCardId === A074_ID
    )
    expect(queued).toHaveLength(2)
    expect(queued.every((event) => event.entries.length === 3)).toBe(true)
    expect(readActionSnapshotToken(resp.state.players[0]!)).toBeUndefined()
  })

  it('moving an A92 extra-turn worker does not lose or duplicate the A92 opportunity', () => {
    const session = evidence.track(createWorkSession({ seed: 2010 }))
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
    expect(session.withCtx(() => hasPendingExtraTurn(resp.state, resp.state.players[0]!))).toBe(true)

    resp = session.resolveChoice(0, getChoiceOptions(resp)![0]!.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionPlaceFarmerExtra')
    expect(newbornCount(resp.state.players[0]!)).toBe(0)
    expect(session.withCtx(() => hasPendingExtraTurn(resp.state, resp.state.players[0]!))).toBe(false)

    resp = session.resolveChoice(0, 'farmland')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionPlowSelect')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow selection')
    const tile = expectTileFarmSelection(resp, 'plow').selectableTiles[0]
    expect(tile).toBeDefined()

    resp = session.commitSelectionChoice(0, { tile })
    expect(requestKind(resp)).toBe('confirm-next-player')

    if (resp.interaction.stateId !== 'wait') throw new Error('expected confirm-next-player')
    resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFlowSelect')
    expect(resp.interaction.stateId === 'wait'
      ? getChoiceOptions(resp)?.map((option) => option.sourceCard)
      : []).toEqual([CARD_ID, CARD_ID])

    if (resp.interaction.stateId !== 'wait') throw new Error('expected E10 choice')
    const move = getChoiceOptions(resp)!.find((option) => option.labelKey === 'actions.move-farmer-to-space.name')!
    resp = session.resolveChoice(0, move.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionMoveFarmerToSpace')

    resp = session.resolveChoice(0, 'lessons')

    expect(resp.state.round).toBe(4)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(resp.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy).toEqual([])
    expect(session.withCtx(() => hasPendingExtraTurn(resp.state, resp.state.players[0]!))).toBe(false)
    expect(newbornCount(resp.state.players[0]!)).toBe(0)
  })
})

const setupArchwayRoundEnd = (withAllowedTarget: boolean) => {
  const session = evidence.track(createWorkSession({ seed: 2010 }))
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
  session.withCtx(() => session.withCtx(() => getCardEffect(D051_ID))!.onBuy!(state, player))
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
  const move = getChoiceOptions(resp)?.find((option) => option.value !== '__skip__')
  expect(move?.sourceCard).toBe(D051_ID)
  return session.resolveChoice(0, move!.value)
}

const setupArchwayStableTurn = (options?: {
  hearthBrush?: boolean
  royalWood?: boolean
  stableTree?: boolean
}) => {
  const session = evidence.track(createWorkSession({
    seed: 42, options: {
      playerCount: 2,
      ...(options?.hearthBrush
        ? { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }
        : {}),
    }
  }))
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundPhase = 'work'
  const player = state.players[0]!
  const opponent = state.players[1]!
  player.minorPlayed.push(D051_ID)
  if (options?.stableTree !== false) player.minorPlayed.push(A074_ID)
  if (options?.royalWood) player.minorPlayed.push(D074_ID)
  if (options?.hearthBrush) {
    player.minorPlayed.push(M062_ID)
    writeCardExtraData(player, M062_ID, 'playedRound', state.round - 1)
    moveMajorImprovementToSupplyTop(state, TILED_OVEN_ID)
    Object.assign(player.resources, { clay: 2, stone: 1 })
  }
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  opponent.minorHand = ['__test_placeholder__']
  opponent.occupationHand = ['__test_placeholder__']
  setActiveWorkerCount(player, 1)
  setActiveWorkerCount(opponent, 0)
  player.resources.food = 10
  player.resources.wood = 5
  session.withCtx(() => session.withCtx(() => getCardEffect(D051_ID))!.onBuy!(state, player))
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
    expect(getChoiceOptions(resp)?.some((option) => option.value === 'farm-expansion'))
      .toBe(true)

    resp = session.resolveChoice(0, 'farm-expansion')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected stable selection')
    expect(expectFarmSelection(resp).farmType).toBe('stable')
    if (expectFarmSelection(resp).farmType !== 'stable') throw new Error('expected stable selection')

    const stable = expectTileFarmSelection(resp, 'stable').selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles).toContainEqual(stable)
    const queued = resp.state.events.filter(
      (event) => event.type === 'futureMeeple.queued',
    ).filter(event => event.sourceCardId === A074_ID
    )
    expect(queued).toHaveLength(1)
    expect(queued[0]?.entries).toHaveLength(3)
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      params: expect.objectContaining({
        detailParts: expect.objectContaining({ effects: expect.objectContaining({ buildStables: 1 }) }),
      }),
    }))
    expect(readActionSnapshotToken(resp.state.players[0]!)).toBeUndefined()
  })

  it('runs Royal Wood at the end of the moved-worker turn', () => {
    const session = setupArchwayStableTurn({ royalWood: true, stableTree: false })
    let resp = acceptArchwayMove(session, session.performRoundEnd())
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Archway move target')
    resp = session.resolveChoice(0, 'farm-expansion')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected stable selection')
    if (expectFarmSelection(resp).farmType !== 'stable') throw new Error('expected stable selection')

    const stable = expectTileFarmSelection(resp, 'stable').selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    resp = resolveTriggerIfPresent(session, resp, D074_ID)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.cardStates?.[D074_ID]?.extraData?.woodSpent).toBe(0)
    expect(readActionSnapshotToken(resp.state.players[0]!)).toBeUndefined()
  })

  it('runs person-action end hooks after the moved-worker turn', () => {
    const session = setupArchwayStableTurn({ hearthBrush: true, stableTree: false })
    let resp = acceptArchwayMove(session, session.performRoundEnd())
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Archway move target')

    resp = session.resolveChoice(0, 'forest')

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Hearth Brush purchase')
    expect(resp.interaction.sourceCard).toBe(M062_ID)
    const skip = getChoiceOptions(resp)?.find((option) => option.value === '__skip__')
    expect(skip).toBeDefined()
    resp = session.resolveChoice(0, skip!.value)
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
    expect(getChoiceOptions(resp)?.some((option) => option.value === 'forest')).toBe(false)
    expect(getChoiceOptions(resp)?.some((option) => option.value === 'fishing')).toBe(true)

    resp = session.resolveChoice(0, 'forest')
    expect(resp.ok).toBe(false)
    expect(resp.state.actionSpaces.find((space) => space.id === D051_ID)?.takenBy)
      .toEqual([{ playerId: resp.state.players[0]!.id, workerId: '1' }])
  })
})

describe('E010 rule boundaries', () => {

  const D = 'D051_Archway', E = 'E010_StrawHat', L = 'E148_Lazybones'

  function setup(card: string, round = 3, configure: (state: GameState) => void = () => { }, played = true) {
    return evidence.track(createWorkSession({
      seed: 8251, options: { playerCount: card === L ? 4 : 2 }, configure: state => {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.resources = { ...p.resources, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 }
        }
        const owner = state.players[0]!
        if (played)
          (card === L ? owner.occupationPlayed : owner.minorPlayed).push(card)
        else
          (card === L ? owner.occupationHand : owner.minorHand).splice(0, 1, card)
        configure(state)
        if (card === D && played)
          state.actionSpaces.push(...createPlayerActionSpaces(state))
      }
    }))
  }

  function wait(r: SessionResponse) { assert.equal(r.ok, true, r.error); assert.ok(r.interaction.stateId === 'wait'); return r.interaction }

  function option(r: SessionResponse, predicate: (value: {
    value: string
    labelKey?: string
  }) => boolean) {
    const i = wait(r)
    assert.ok(i.request.kind === 'choice')
    const o = getChoiceOptions({ interaction: i })?.find(predicate)
    assert.ok(o, JSON.stringify(i))
    return o.value
  }

  function finish(s: GameSession, initial: SessionResponse) {
    let r = initial
    for (let n = 0; n < 10 && r.interaction.stateId === 'wait'; n++) {
      const kind = r.interaction.request.kind
      if (kind === 'confirm-next-player')
        r = confirmNext(s, r)
      else if (kind === 'choice' && getChoiceOptions(r)?.some(o => o.value === '__skip__'))
        r = s.resolveChoice(r.interaction.playerIndex, '__skip__')
      else
        break
      assert.equal(r.ok, true, r.error)
    }
    return r
  }

  function place(s: GameSession, actor: number, id: string) {
    let r = s.takeAction(actor, id)
    assert.equal(r.ok, true, r.error)
    if (id === 'farmland') {
      wait(r)
      r = s.commitSelectionChoice(actor, { tile: { row: 0, col: 2 } })
      assert.equal(r.ok, true, r.error)
    }
    return r
  }

  function endWork(s: GameSession, first = 'grain-seeds', second = 'reed-bank') {
    finish(s, place(s, 0, first))
    finish(s, place(s, 1, second))
    finish(s, place(s, 0, 'clay-pit'))
    const r = place(s, 1, 'forest')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      return confirmNext(s, r)
    if (r.interaction.stateId === 'idle' && r.state.roundPhase === 'work')
      return s.performRoundEnd()
    return r
  }

  it("actual Farmland food choice rewards once in round three and stale acceptance is rejected", () => {
    const s = setup(E)
    let r = endWork(s, 'farmland')
    const food = option(r, o => o.labelKey === 'actions.gain.name')
    r = s.resolveChoice(0, food)
    assert.equal(r.ok, true, r.error)
    assert.equal(r.state.players[0]!.resources.food, 21)
    assert.equal(r.state.round, 4)
    assert.equal(r.state.players[0]!.workers.filter(w => w.isActive).length, 2)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, food))
  })

  it("no Farmland person gives no food and no response", () => {
    const s = setup(E)
    const r = endWork(s)
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(r.state.round, 4)
    assert.equal(r.interaction.stateId, 'idle')
  })

  it("actual Farmland move gives two food without another worker or rotation", () => {
    const s = setup(E)
    let r = endWork(s, 'farmland')
    const owner = r.state.players[0]!
    const sourceWorkers = r.state.actionSpaces.find(space => space.id === 'farmland')!.takenBy
    assert.equal(sourceWorkers.length, 1)
    const source = sourceWorkers[0]!
    assert.equal(source.playerId, owner.id)
    const workers = structuredClone(owner.workers)
    const originalPlacement = r.state.events.find(event => event.type === 'worker.placed'
      && event.actorPlayerId === owner.id && event.workerId === source.workerId && event.spaceId === 'farmland')
    assert.ok(originalPlacement)
    r = s.resolveChoice(0, option(r, o => o.labelKey === 'actions.move-farmer-to-space.name'))
    const move = wait(r)
    assert.equal(move.playerIndex, 0)
    assert.equal(move.promptKey, 'ui.interactionMoveFarmerToSpace')
    assert.equal(r.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, 'day-laborer'))
    r = s.resolveChoice(0, 'day-laborer')
    assert.equal(r.ok, true, r.error)
    assert.equal(r.state.players[0]!.resources.food, 22)
    assert.equal(r.state.round, 4)
    assert.equal(r.state.players[0]!.workers.filter(w => w.isActive).length, 2)
    assert.deepEqual(r.state.players[0]!.workers, workers)
    const placements = r.state.events.filter(event => event.type === 'worker.placed')
    assert.equal(placements.length, 5)
    const moved = placements.filter(event => event.viaCardId === E)
    assert.equal(moved.length, 1)
    assert.deepEqual({ worker: moved[0]!.workerId, player: moved[0]!.actorPlayerId, space: moved[0]!.spaceId, round: moved[0]!.round, phase: moved[0]!.phase }, { worker: source.workerId, player: owner.id, space: 'day-laborer', round: 3, phase: 'returning-home' })
    const returned = r.state.events.find(event => event.type === 'worker.returned')
    assert.ok(returned?.type === 'worker.returned')
    assert.equal(returned.workers.length, 4)
    assert.equal(returned.workers.filter(worker => worker.playerId === owner.id && worker.workerId === source.workerId).length, 1)
    assert.equal(new Set(returned.workers.map(worker => `${worker.playerId}:${worker.workerId}`)).size, 4)
    const nextRound = r.state.events.find(event => event.type === 'round.started' && event.round === 4)
    assert.ok(nextRound)
    assert.ok(originalPlacement.seq < moved[0]!.seq && moved[0]!.seq < returned.seq && returned.seq < nextRound.seq)
    assert.deepEqual(r.state.actionSpaces.find(space => space.id === 'farmland')!.takenBy, [])
    assert.deepEqual(r.state.actionSpaces.find(space => space.id === 'day-laborer')!.takenBy, [])
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'day-laborer'))
  })

  it("real Farmland placement outside its two rounds has no bonus", () => {
    const s = setup(E, 2)
    const r = endWork(s, 'farmland')
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(r.state.round, 3)
    assert.equal(r.interaction.stateId, 'idle')
  })

  it("real round six Farmland food choice rewards exactly one food", () => {
    const s = setup(E, 6)
    let r = endWork(s, 'farmland')
    r = s.resolveChoice(0, option(r, o => o.labelKey === 'actions.gain.name'))
    assert.equal(r.ok, true, r.error)
    assert.equal(r.state.players[0]!.resources.food, 21)
    assert.equal(r.state.round, 7)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
  })

  it("opponents Farmland person cannot grant the owner a food choice", () => {
    const s = setup(E)
    const r = endWork(s, 'grain-seeds', 'farmland')
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(r.state.round, 4)
    assert.equal(r.interaction.stateId, 'idle')
  })
})
