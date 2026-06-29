import { describe, expect, it } from 'vitest'
import type { ActionFlow, GameState, PlayerState, Resource } from '../../contract/types'
import { C072_FestivalPlanning_impl } from '../C/C072_FestivalPlanning'
import { E025_BumperCrop_impl } from '../E/E025_BumperCrop'

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

    const flow = C072_FestivalPlanning_impl.effect.onBuy!(state(player), player) as ActionFlow

    expect(flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'reap',
          sourceCard: 'C072_FestivalPlanning',
          actionContext: { trigger: { phase: 'private-field-phase' } },
        },
        {
          type: 'leaf',
          actionId: 'improvement',
          optional: true,
          sourceCard: 'C072_FestivalPlanning',
        },
      ],
    })
  })

  it('C72 Festival Planning offers only optional improvement when no crops exist', () => {
    const player = playerWithFields([
      { row: 0, col: 0, stacks: [] },
    ])

    const flow = C072_FestivalPlanning_impl.effect.onBuy!(state(player), player) as ActionFlow

    expect(flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'improvement',
          optional: true,
          sourceCard: 'C072_FestivalPlanning',
        },
      ],
    })
  })

  it('C72 Festival Planning runs Private Field Phase when only Card Fields have crops', () => {
    const player = playerWithFields([])
    player.minorPlayed = ['E068_CherryOrchard']
    player.cardStates = {
      E068_CherryOrchard: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] } },
    }

    const flow = C072_FestivalPlanning_impl.effect.onBuy!(state(player), player) as Extract<ActionFlow, { type: 'seq' }>

    expect(flow.children[0]).toEqual({
      type: 'leaf',
      actionId: 'reap',
      sourceCard: 'C072_FestivalPlanning',
      actionContext: { trigger: { phase: 'private-field-phase' } },
    })
  })

  it('E25 Bumper Crop runs mandatory Private Field Phase when crops exist', () => {
    const player = playerWithFields([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
    ])

    const flow = E025_BumperCrop_impl.effect.onBuy!(state(player), player)

    expect(flow).toEqual({
      type: 'leaf',
      actionId: 'reap',
      sourceCard: 'E025_BumperCrop',
      actionContext: { trigger: { phase: 'private-field-phase' } },
    })
  })

  it('E25 Bumper Crop returns undefined when no crops exist', () => {
    const player = playerWithFields([
      { row: 0, col: 0, stacks: [] },
    ])

    expect(E025_BumperCrop_impl.effect.onBuy!(state(player), player)).toBeUndefined()
  })

  it('E25 Bumper Crop runs Private Field Phase when only Card Fields have crops', () => {
    const player = playerWithFields([])
    player.minorPlayed = ['B113_PlantBreeder']
    player.cardStates = {
      B113_PlantBreeder: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
    }

    expect(E025_BumperCrop_impl.effect.onBuy!(state(player), player)).toEqual({
      type: 'leaf',
      actionId: 'reap',
      sourceCard: 'E025_BumperCrop',
      actionContext: { trigger: { phase: 'private-field-phase' } },
    })
  })
})
