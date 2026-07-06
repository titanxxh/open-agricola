import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { Scoring } from '../../shared/domain'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'
import { positionKey } from '../../shared/domain/farm'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { MoorSpecialActionId } from '../../shared/moor/types'
import type { FarmTilePosition, GameState, PlayerState } from '../../shared/contract/types'

const PLACEHOLDER = '__test_placeholder__'

const setup = (cardId: string) => {
  const session = new GameSession(395, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  for (const player of state.players) {
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.farmTerrain = []
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  }
  const player = state.players[0]!
  player.minorHand = [cardId]
  player.houseType = 'stone'
  player.resources.stone = 2
  player.resources.food = 5
  session.loadState(state)
  return session
}

const resolvePaymentIfNeeded = (
  session: GameSession,
  resp: ReturnType<GameSession['resolveChoice']>,
) => {
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const option = resp.interaction.request.options?.[0]
    expect(option).toBeDefined()
    return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
  }
  return resp
}

const playMinor = (session: GameSession, cardId: string) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const improvement = resp.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  expect(improvement).toBeDefined()
  resp = session.resolveChoice(0, improvement!.value)
  expect(resp.ok).toBe(true)
  resp = resolvePaymentIfNeeded(session, resp)
  if (resp.interaction.stateId === 'wait' && resp.interaction.request.selection?.kind === 'farm-position') {
    return resp
  }
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionOptionalAction') {
    return resp
  }
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const card = resp.interaction.request.options?.find((option) => option.value === cardId)
  expect(card).toBeDefined()
  resp = session.resolveChoice(0, card!.value)
  expect(resp.ok).toBe(true)
  return resolvePaymentIfNeeded(session, resp)
}

const commitPosition = (
  session: GameSession,
  resp: ReturnType<typeof playMinor>,
  tile: FarmTilePosition,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.request.selection?.kind).toBe('farm-position')
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, {
    positions: [{ row: tile.row, col: tile.col }],
  })
}

const acceptOptionalAction = (
  session: GameSession,
  resp: ReturnType<typeof playMinor>,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
  const option = resp.interaction.request.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

const skipOptionalAction = (
  session: GameSession,
  resp: ReturnType<typeof playMinor>,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
}

const cardBonusVp = (state: GameState) =>
  Scoring.breakdown(state, 0).categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0

const setupPlayed = (
  cardIds: string[],
  terrain: NonNullable<PlayerState['farmTerrain']>,
) => {
  const session = setup(PLACEHOLDER)
  const state = session.state
  const player = state.players[0]!
  player.minorHand = [PLACEHOLDER]
  player.minorPlayed = [...cardIds]
  player.improvements = []
  player.resources = {
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
  }
  player.houseType = 'clay'
  player.farmTerrain = terrain
  setActiveWorkerCount(player, 3)
  setWorkersAtHome(state, player, 3)
  session.loadState(state)
  return session
}

const specialCard = (session: GameSession, actionId: MoorSpecialActionId) =>
  session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
    card.actions.includes(actionId),
  )!

const takeSpecialAt = (
  session: GameSession,
  actionId: MoorSpecialActionId,
  tile: FarmTilePosition,
) => session.takeSpecialAction(0, specialCard(session, actionId).id, actionId, { tile })

const acceptOptional = (
  session: GameSession,
  resp: ReturnType<GameSession['takeSpecialAction']>,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.request.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

const resetOwnTurn = (session: GameSession) => {
  const state = session.state
  const player = state.players[0]!
  state.currentPlayerIndex = 0
  setActiveWorkerCount(player, 3)
  setWorkersAtHome(state, player, 3)
  session.loadState(state)
}

const plowTile = (session: GameSession, tile: FarmTilePosition) => {
  const resp = session.takeAction(0, 'farmland')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  return session.commitSelectionChoice(0, { tile })
}

describe('Moor farmyard space states', () => {
  it('M064 blocks one unused farmyard space and scores the tombstone bonus', () => {
    const target = { row: 1, col: 3 }
    const session = setup('M064_FamilyBurialPlot')
    const resp = commitPosition(
      session,
      acceptOptionalAction(session, playMinor(session, 'M064_FamilyBurialPlot')),
      target,
    )
    const player = resp.state.players[0]!

    expect(player.farmyardSpaceStates).toContainEqual({
      spaceKey: positionKey(target),
      sourceCardId: 'M064_FamilyBurialPlot',
      kind: 'blocked-farmyard-space',
      bonusVp: 1,
      blocksPlacement: true,
    })
    expect(getUsedFarmyardTileKeys(player)).toContain(positionKey(target))
    expect(cardBonusVp(resp.state)).toBe(1)
  })

  it('M064 can skip placing the optional tombstone', () => {
    const session = setup('M064_FamilyBurialPlot')
    const resp = skipOptionalAction(session, playMinor(session, 'M064_FamilyBurialPlot'))
    const player = resp.state.players[0]!

    expect(resp.ok).toBe(true)
    expect(player.farmyardSpaceStates ?? []).toEqual([])
    expect(cardBonusVp(resp.state)).toBe(0)
  })

  it('M070 can spend a fence after Cut Peat to block and score the emptied space', () => {
    const target = { row: 0, col: 3 }
    const session = setupPlayed(['M070_MoorArchaeology'], [
      { ...target, kind: 'moor' },
    ])
    const resp = acceptOptional(session, takeSpecialAt(session, 'cut-peat', target))
    const player = resp.state.players[0]!

    expect(player.farmyardSpaceStates).toContainEqual({
      spaceKey: positionKey(target),
      sourceCardId: 'M070_MoorArchaeology',
      kind: 'blocked-farmyard-space',
      bonusVp: 1,
      blocksPlacement: true,
    })
    expect(player.supplyTokensConsumed?.fence).toBe(1)
    expect(getUsedFarmyardTileKeys(player)).toContain(positionKey(target))
    expect(cardBonusVp(resp.state)).toBe(1)
  })

  it('M092 stores fuel and food on the emptied peat space until that space is used', () => {
    const target = { row: 0, col: 4 }
    const session = setupPlayed(['M092_AridField'], [
      { ...target, kind: 'moor' },
    ])
    let resp = takeSpecialAt(session, 'cut-peat', target)
    let player = resp.state.players[0]!

    expect(player.farmyardSpaceStates).toContainEqual({
      spaceKey: positionKey(target),
      sourceCardId: 'M092_AridField',
      kind: 'farmyard-goods-token',
      resources: { fuel: 1, food: 1 },
      claimPolicy: 'when-no-longer-unused',
    })
    expect(getUsedFarmyardTileKeys(player)).not.toContain(positionKey(target))
    expect(player.resources.fuel).toBe(3)
    expect(player.resources.food).toBe(0)

    resetOwnTurn(session)
    resp = plowTile(session, target)
    player = resp.state.players[0]!
    expect(player.farmyardSpaceStates).toEqual([])
    expect(player.resources.fuel).toBe(4)
    expect(player.resources.food).toBe(1)
  })

  it('M096 stores food after Fell Trees and pays it when the emptied space is used', () => {
    const target = { row: 1, col: 4 }
    const session = setupPlayed(['M096_FallowLand'], [
      { ...target, kind: 'forest' },
    ])
    let resp = takeSpecialAt(session, 'fell-trees', target)
    let player = resp.state.players[0]!

    expect(player.farmyardSpaceStates).toContainEqual({
      spaceKey: positionKey(target),
      sourceCardId: 'M096_FallowLand',
      kind: 'farmyard-goods-token',
      resources: { food: 1 },
      claimPolicy: 'when-no-longer-unused',
    })
    expect(player.resources.food).toBe(0)

    resetOwnTurn(session)
    resp = plowTile(session, target)
    player = resp.state.players[0]!
    expect(player.farmyardSpaceStates).toEqual([])
    expect(player.resources.food).toBe(1)
  })
})
