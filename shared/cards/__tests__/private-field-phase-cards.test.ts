import { describe, expect, it } from 'vitest'
import type { ActionFlow, GameState, PlayerState, Resource } from '../../contract/types'
import { C72_FestivalPlanning_impl } from '../C/C72_FestivalPlanning'
import { E25_BumperCrop_impl } from '../E/E25_BumperCrop'

const emptyResources = (): Resource => ({
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
})

const state = (player: PlayerState): GameState => ({ players: [player] }) as GameState

const playerWithFields = (fields: PlayerState['fields']): PlayerState => ({
  id: 'p1',
  name: 'P1',
  resources: emptyResources(),
  fields,
  minorPlayed: [],
  occupationPlayed: [],
  improvements: [],
  cardStates: {},
} as PlayerState)

describe('Private Field Phase cards', () => {
  it('C72 Festival Planning runs mandatory Private Field Phase before optional improvement when crops exist', () => {
    const player = playerWithFields([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
    ])

    const flow = C72_FestivalPlanning_impl.effect.onBuy!(state(player), player) as ActionFlow

    expect(flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'private-field-phase',
          sourceCard: 'C72_FestivalPlanning',
        },
        {
          type: 'leaf',
          actionId: 'improvement',
          optional: true,
          sourceCard: 'C72_FestivalPlanning',
        },
      ],
    })
  })

  it('C72 Festival Planning offers only optional improvement when no crops exist', () => {
    const player = playerWithFields([
      { row: 0, col: 0, stacks: [] },
    ])

    const flow = C72_FestivalPlanning_impl.effect.onBuy!(state(player), player) as ActionFlow

    expect(flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'improvement',
          optional: true,
          sourceCard: 'C72_FestivalPlanning',
        },
      ],
    })
  })

  it('C72 Festival Planning runs Private Field Phase when only Card Fields have crops', () => {
    const player = playerWithFields([])
    player.minorPlayed = ['E68_CherryOrchard']
    player.cardStates = {
      E68_CherryOrchard: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] } },
    }

    const flow = C72_FestivalPlanning_impl.effect.onBuy!(state(player), player) as Extract<ActionFlow, { type: 'seq' }>

    expect(flow.children[0]).toEqual({
      type: 'leaf',
      actionId: 'private-field-phase',
      sourceCard: 'C72_FestivalPlanning',
    })
  })

  it('E25 Bumper Crop runs mandatory Private Field Phase when crops exist', () => {
    const player = playerWithFields([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
    ])

    const flow = E25_BumperCrop_impl.effect.onBuy!(state(player), player)

    expect(flow).toEqual({
      type: 'leaf',
      actionId: 'private-field-phase',
      sourceCard: 'E25_BumperCrop',
    })
  })

  it('E25 Bumper Crop returns undefined when no crops exist', () => {
    const player = playerWithFields([
      { row: 0, col: 0, stacks: [] },
    ])

    expect(E25_BumperCrop_impl.effect.onBuy!(state(player), player)).toBeUndefined()
  })

  it('E25 Bumper Crop runs Private Field Phase when only Card Fields have crops', () => {
    const player = playerWithFields([])
    player.minorPlayed = ['B113_PlantBreeder']
    player.cardStates = {
      B113_PlantBreeder: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
    }

    expect(E25_BumperCrop_impl.effect.onBuy!(state(player), player)).toEqual({
      type: 'leaf',
      actionId: 'private-field-phase',
      sourceCard: 'E25_BumperCrop',
    })
  })
})
