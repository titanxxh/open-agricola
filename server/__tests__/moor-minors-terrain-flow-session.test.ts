import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { Scoring } from '../../shared/domain'
import { getAllTilePositions, positionKey } from '../../shared/domain/farm'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { FarmTilePosition, GameState, PlayerState, ActionChoiceOption } from '../../shared/contract/types'

import { M015_PeatBurnOff } from '../../shared/cards/M/M015_PeatBurnOff'
import { M016_ClearFelling } from '../../shared/cards/M/M016_ClearFelling'
import { M017_Reforestation } from '../../shared/cards/M/M017_Reforestation'
import { M021_PeatCuttingExpedition } from '../../shared/cards/M/M021_PeatCuttingExpedition'
import { M040_MoorFire } from '../../shared/cards/M/M040_MoorFire'
import { M042_DeepPlow } from '../../shared/cards/M/M042_DeepPlow'
import { M066_LandParcel } from '../../shared/cards/M/M066_LandParcel'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

const FILLER = '__test_placeholder__'

const terrain = {
  forestA: { row: 1, col: 0, kind: 'forest' as const },
  forestB: { row: 1, col: 1, kind: 'forest' as const },
  forestC: { row: 2, col: 1, kind: 'forest' as const },
  moorA: { row: 0, col: 3, kind: 'moor' as const },
  moorB: { row: 2, col: 4, kind: 'moor' as const },
}

const tileKey = (tile: FarmTilePosition) => positionKey(tile)

const prepareHands = (state: GameState) => {
  for (const player of state.players) {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  }
}

const setup = (
  cardId: string,
  configure?: (player: PlayerState, state: GameState) => void,
) => {
  const session = new GameSession(377, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  prepareHands(state)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  for (const player of state.players) {
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  }
  const player = state.players[0]!
  player.minorHand = [cardId]
  player.resources = {
    ...player.resources,
    wood: 10,
    food: 10,
    fuel: 0,
  }
  player.rooms = 2
  player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
  player.fields = [{ row: 0, col: 2, stacks: [] }]
  player.farmTerrain = [
    { ...terrain.forestA },
    { ...terrain.forestB },
    { ...terrain.moorA },
    { ...terrain.moorB },
  ]
  player.stableTiles = []
  player.pastures = []
  configure?.(player, state)
  session.loadState(state)
  return session
}

const resolvePaymentIfNeeded = (session: GameSession, resp: ReturnType<GameSession['resolveChoice']>) => {
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const option = resp.interaction.options?.[0]
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
  const improvement = resp.interaction.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) {
    resp = session.resolveChoice(0, improvement.value)
    expect(resp.ok).toBe(true)
  }
  resp = resolvePaymentIfNeeded(session, resp)
  if (resp.interaction.stateId === 'wait' && resp.interaction.sourceCard === cardId) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const card = resp.interaction.options?.find((option) => option.value === `minor:${cardId}`)
  expect(card).toBeDefined()
  resp = session.resolveChoice(0, card!.value)
  expect(resp.ok).toBe(true)
  return resolvePaymentIfNeeded(session, resp)
}

const acceptOptional = (session: GameSession, resp: ReturnType<GameSession['takeAction']>) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.options?.find((entry: ActionChoiceOption) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

const commitTerrain = (
  session: GameSession,
  resp: ReturnType<GameSession['takeAction']>,
  tiles: FarmTilePosition[],
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.selection?.kind).toBe('farm-position')
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, {
    positions: tiles.map(({ row, col }) => ({ row, col })),
  })
}

const cardBonusVp = (state: GameState) =>
  Scoring.breakdown(state, 0).categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0

const fillFarmForUnused = (player: PlayerState, unused: number) => {
  const all = getAllTilePositions()
  player.rooms = 2
  player.roomTiles = [all[0]!, all[1]!]
  player.fields = all.slice(2, 15 - unused).map((tile) => ({ ...tile, stacks: [] }))
  player.farmTerrain = []
  player.stableTiles = []
  player.pastures = []
}

describe('Farmers of the Moor terrain minor cards', () => {
  it('M015 Peat Burn-off gains fuel and optionally replaces an adjacent moor with a field', () => {
    const session = setup('M015_PeatBurnOff')
    let resp = playMinor(session, 'M015_PeatBurnOff')
    resp = acceptOptional(session, resp)
    resp = commitTerrain(session, resp, [terrain.moorA])

    const player = resp.state.players[0]!
    expect(player.resources.fuel).toBe(1)
    expect(player.fields).toContainEqual({ row: terrain.moorA.row, col: terrain.moorA.col, stacks: [] })
    expect(player.farmTerrain).not.toContainEqual(terrain.moorA)
  })

  it('M016 Clear Felling turns up to 2 single forests into moors and gains wood', () => {
    const session = setup('M016_ClearFelling', (player) => {
      player.farmTerrain = [{ ...terrain.forestA }, { ...terrain.forestB }, { ...terrain.forestC }]
    })
    const woodBefore = session.state.players[0]!.resources.wood
    let resp = playMinor(session, 'M016_ClearFelling')
    resp = commitTerrain(session, resp, [terrain.forestA, terrain.forestB])

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(woodBefore + 2)
    expect(player.farmTerrain).toContainEqual({ row: terrain.forestA.row, col: terrain.forestA.col, kind: 'moor' })
    expect(player.farmTerrain).toContainEqual({ row: terrain.forestB.row, col: terrain.forestB.col, kind: 'moor' })
  })

  it('M017 Reforestation places 1 forest on an unused farmyard space', () => {
    const target = { row: 1, col: 4 }
    const session = setup('M017_Reforestation', (player) => {
      player.improvements = ['Major_Well', 'Major_Joinery', 'Major_Pottery']
    })
    const resp = commitTerrain(session, playMinor(session, 'M017_Reforestation'), [target])

    expect(resp.state.players[0]!.farmTerrain).toContainEqual({ ...target, kind: 'forest' })
  })

  it('M021 Peat-Cutting Expedition removes selected moors and pays fuel, bonus VP, and horse fuel', () => {
    const session = setup('M021_PeatCuttingExpedition', (player) => {
      player.resources.horse = 4
    })
    const resp = commitTerrain(
      session,
      playMinor(session, 'M021_PeatCuttingExpedition'),
      [terrain.moorA, terrain.moorB],
    )

    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(6)
    expect(player.resources.fuel).toBe(6)
    expect(player.cardStates?.M021_PeatCuttingExpedition?.counters?.bonusVp).toBe(2)
    expect(player.farmTerrain?.filter((tile) => tile.kind === 'moor')).toHaveLength(0)
  })

  it('M040 Moor Fire offers anytime moor-to-field only when exactly 1 moor remains', () => {
    const session = setup('M040_MoorFire', (player) => {
      player.minorPlayed = ['M040_MoorFire']
      player.minorHand = [FILLER]
      player.farmTerrain = [{ ...terrain.moorA }]
    })

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.anytimeActions.map((action) => action.id)).toContain('M040-moor-fire-anytime')
    resp = session.takeAnytimeAction(0, 'M040-moor-fire-anytime')
    resp = commitTerrain(session, resp, [terrain.moorA])

    expect(resp.state.players[0]!.fields).toContainEqual({ row: terrain.moorA.row, col: terrain.moorA.col, stacks: [] })
    expect(resp.state.players[0]!.farmTerrain).toEqual([])
  })

  it('M042 Deep Plow places a moor on buy and replaces a moor after Farmland', () => {
    const placedMoor = { row: 1, col: 4 }
    const session = setup('M042_DeepPlow', (player) => {
      player.improvements = ['Major_Well', 'Major_Joinery']
    })
    let resp = acceptOptional(session, playMinor(session, 'M042_DeepPlow'))
    resp = commitTerrain(session, resp, [placedMoor])
    expect(resp.state.players[0]!.farmTerrain).toContainEqual({ ...placedMoor, kind: 'moor' })

    resp = session.resolveChoice(0, 'confirm')
    expect(resp.ok).toBe(true)
    resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(1, 'confirm')
    expect(resp.ok).toBe(true)

    resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const field = resp.interaction.stateId === 'wait' ? resp.interaction.farm?.selectableTiles[0] : undefined
    expect(field).toBeDefined()
    resp = session.commitSelectionChoice(0, { tile: field })
    resp = acceptOptional(session, resp)
    resp = commitTerrain(session, resp, [terrain.moorA])

    expect(resp.state.players[0]!.fields).toContainEqual({ row: terrain.moorA.row, col: terrain.moorA.col, stacks: [] })
  })

  it('M066 Land Parcel places a forest and scores unused farmyard spaces', () => {
    const target = { row: 1, col: 4 }
    const session = setup('M066_LandParcel')
    const resp = commitTerrain(session, playMinor(session, 'M066_LandParcel'), [target])
    expect(resp.state.players[0]!.farmTerrain).toContainEqual({ ...target, kind: 'forest' })

    fillFarmForUnused(resp.state.players[0]!, 1)
    expect(cardBonusVp(resp.state)).toBe(2)
    fillFarmForUnused(resp.state.players[0]!, 2)
    expect(cardBonusVp(resp.state)).toBe(-1)
    fillFarmForUnused(resp.state.players[0]!, 3)
    expect(cardBonusVp(resp.state)).toBe(-3)
  })

  it('adds custom prerequisites for terrain-count minor cards', () => {
    const session = setup('M040_MoorFire')
    const player = session.state.players[0]!
    player.farmTerrain = [{ ...terrain.moorA }]
    expect(meetsCardPrerequisites(player, M040_MoorFire, session.state.round, session.state)).toBe(false)
    player.farmTerrain = [{ ...terrain.moorA }, { ...terrain.moorB }]
    expect(meetsCardPrerequisites(player, M040_MoorFire, session.state.round, session.state)).toBe(true)

    player.farmTerrain = [{ ...terrain.forestA }, { ...terrain.forestB }, { ...terrain.forestC }]
    expect(meetsCardPrerequisites(player, M016_ClearFelling, session.state.round, session.state)).toBe(true)
    player.farmTerrain.push({ row: 2, col: 3, kind: 'forest' })
    expect(meetsCardPrerequisites(player, M016_ClearFelling, session.state.round, session.state)).toBe(false)

    player.improvements = ['Major_Well', 'Major_Joinery', 'Major_Pottery']
    expect(meetsCardPrerequisites(player, M017_Reforestation, session.state.round, session.state)).toBe(true)
    player.improvements = ['Major_Well', 'Major_Joinery', 'Major_Pottery']
    player.minorPlayed = []
    expect(meetsCardPrerequisites(player, M042_DeepPlow, session.state.round, session.state)).toBe(true)
    player.improvements = ['Major_Well']
    player.minorPlayed = []
    expect(meetsCardPrerequisites(player, M042_DeepPlow, session.state.round, session.state)).toBe(false)
    player.improvements = ['Major_Well', 'Major_Joinery']
    player.minorPlayed = ['A037_Bucksaw']
    expect(meetsCardPrerequisites(player, M066_LandParcel, session.state.round, session.state)).toBe(false)

    expect(M015_PeatBurnOff.implemented).toBe(true)
    expect(M021_PeatCuttingExpedition.implemented).toBe(true)
  })
})
