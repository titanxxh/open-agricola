import { describe, expect, it } from 'vitest'
import { applyFarmChoice } from '../../shared/logic/farm/farm-choice.ts'
import { constructAction } from '../../shared/actions/effects/construct.ts'
import { storePendingFenceBonus } from '../../shared/cards/helpers/pending-fence-bonus'
import type { ActionExecutionContext, ActionSpace, GameState, PlayerState } from '../../shared/game/types.ts'
import { buildRoomFarmInteraction } from '../../shared/logic/farm/farm-interaction.ts'
import { A14_CarpentersHammer } from '../../shared/cards/A/A14_CarpentersHammer'
import { A123_FrameBuilder } from '../../shared/cards/A/A123_FrameBuilder'

const dummySpace: ActionSpace = { id: 'construct', type: 'construct' } as unknown as ActionSpace

const buildRoomCtx = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): ActionExecutionContext => ({
  state: { players: [player] } as unknown as GameState,
  player,
  space: dummySpace,
  actionContext,
})


const fenceTradeModifiers: PlayerState['activeModifiers'] = [
  {
    type: 'trade',
    cardId: 'Test_Fence_Clay',
    appliesTo: ['fencing'],
    from: { clay: 2 },
    to: { wood: 2 },
    max: 2,
  },
  {
    type: 'trade',
    cardId: 'Test_Fence_Stone',
    appliesTo: ['fencing'],
    from: { stone: 2 },
    to: { wood: 2 },
    max: 2,
  },
]

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
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
  },
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [
    { row: 2, col: 0 },
    { row: 1, col: 0 },
  ],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: ['E74_AshTrees'],
  occupationHand: [],
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {
    E74_AshTrees: { counters: { fences: 5 } },
  },
})

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('farm choice', () => {
  it('consumes reserved Ash Trees fences instead of wood', () => {
    const player = createPlayer()
    storePendingFenceBonus(player, {
      sourceCard: 'E74_AshTrees',
      counterKey: 'fences',
      freeFences: 4,
    })

    const result = applyFarmChoice(player, 'fence', {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.player.resources.wood).toBe(0)
    expect(result.player.cardStates?.E74_AshTrees?.counters?.fences).toBe(1)
    expect(result.meta).toMatchObject({
      sourceCard: 'E74_AshTrees',
      usedFreeFences: 4,
      newFenceEdges: edgesForTile(1, 1),
    })
    expect(result.meta?.newPastures).toHaveLength(1)
  })

  it('requires an explicit payment choice when multiple fence payments are legal', () => {
    const player = createPlayer()
    player.resources.wood = 0
    player.resources.clay = 2
    player.resources.stone = 2
    player.activeModifiers = [...fenceTradeModifiers]
    storePendingFenceBonus(player, {
      sourceCard: 'E74_AshTrees',
      counterKey: 'fences',
      freeFences: 2,
    })

    const result = applyFarmChoice(player, 'fence', {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('payment choice required')
  })

  it('pays frame builder room costs using alternate clay payment', () => {
    const player = createPlayer()
    player.houseType = 'clay'
    player.resources.wood = 1
    player.resources.clay = 3
    player.resources.reed = 2
    player.activeModifiers = [...((A123_FrameBuilder as unknown as { modifiers: PlayerState['activeModifiers'] }).modifiers ?? [])]

    const interaction = buildRoomFarmInteraction(player)
    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return

    // Single combo (1 wood + 3 clay + 2 reed → 0 left of all) finalizes
    // immediately; no payment-choice prompt needed.
    const result = constructAction.resolveChoice!(buildRoomCtx(player), 'confirm', {
      rooms: [interaction.selectableTiles[0]!],
    })

    expect(result.type).toBe('ok')
    expect(player.resources.wood).toBe(0)
    expect(player.resources.clay).toBe(0)
    expect(player.resources.reed).toBe(0)
    expect(player.rooms).toBe(3)
  })

  it('requires an explicit payment choice when multiple room payments are legal', () => {
    const player = createPlayer()
    player.houseType = 'stone'
    player.resources.wood = 1
    player.resources.stone = 5
    player.resources.reed = 2
    player.activeModifiers = [...((A123_FrameBuilder as unknown as { modifiers: PlayerState['activeModifiers'] }).modifiers ?? [])]

    const interaction = buildRoomFarmInteraction(player)
    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return

    const result = constructAction.resolveChoice!(buildRoomCtx(player), 'confirm', {
      rooms: [interaction.selectableTiles[0]!],
    })

    // Multi-combo: returns `choice` (engine forwards it as a payment-select
    // pending) rather than a fail.
    expect(result.type).toBe('choice')
  })

  it('rejects room selections above the true max buildable room count', () => {
    const player = createPlayer()
    player.resources.wood = 8
    player.resources.reed = 2
    player.activeModifiers = [
      ...((A14_CarpentersHammer as unknown as { modifiers: PlayerState['activeModifiers'] }).modifiers ?? []),
    ]

    const interaction = buildRoomFarmInteraction(player)
    expect(interaction.farmType).toBe('room')
    if (interaction.farmType !== 'room') return
    expect(interaction.maxSelections).toBe(2)

    const result = constructAction.resolveChoice!(buildRoomCtx(player), 'confirm', {
      rooms: interaction.selectableTiles.slice(0, 3),
    })

    expect(result.type).toBe('fail')
  })

})
