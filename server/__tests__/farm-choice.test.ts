import { describe, expect, it } from 'vitest'
import { constructAction } from '../../shared/actions/effects/construct.ts'
import type { ActionExecutionContext, ActionSpace, GameState, PlayerState } from '../../shared/contract/types.ts'
import { buildRoomFarmInteraction } from '../../shared/domain/farmyard'
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
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
})

describe('farm choice', () => {
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

    // Multi-combo: returns `request` with payment `choice` kind (engine forwards
    // it as a payment-select pending) rather than a fail.
    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
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
