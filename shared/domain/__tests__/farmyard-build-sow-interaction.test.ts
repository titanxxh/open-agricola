import { describe, it, expect, afterEach } from 'vitest'
import { buildSowFarmInteraction } from '../farmyard'
import { makeBlankPlayer } from './helpers'
import { CardRegistry } from '../../cards/registry'
import {
  getActiveCardRegistry,
  setActiveCardRegistry,
} from '../../cards/active-registry'
import type { CardEffect, ExtraSowableField } from '../../cards/card-effects'
import type { PlayerState } from '../../contract/types'

const FAKE_PROVIDER_ID = 'FAKE_EXTRA_PROVIDER'

const withFakeExtra = (entries: ExtraSowableField[], fn: () => void) => {
  const prev = getActiveCardRegistry()
  const reg = new CardRegistry()
  const effect: CardEffect = {
    id: FAKE_PROVIDER_ID,
    onComputeSowableFields: () => entries,
  }
  reg.loadImpl(FAKE_PROVIDER_ID, { effect })
  setActiveCardRegistry(reg)
  try {
    fn()
  } finally {
    setActiveCardRegistry(prev)
  }
}

afterEach(() => {
  // safety net: ensure no stale registry leaks between cases
  setActiveCardRegistry(null)
})

describe('buildSowFarmInteraction', () => {
  it('passes through groupKey from extra fields', () => {
    const player = makeBlankPlayer({
      resources: { wood: 2 },
      minorPlayed: [FAKE_PROVIDER_ID],
    }) as unknown as PlayerState
    withFakeExtra(
      [
        {
          tile: { row: -75, col: 0 },
          allowedCrops: ['wood'],
          sourceCard: 'D075_WoodField',
          groupKey: 'D075_WoodField',
        },
      ],
      () => {
        const interaction = buildSowFarmInteraction(player)
        if (interaction.farmType !== 'sow') throw new Error('expected sow farmType')
        const extra = interaction.selectableFields.find((f) => f.tile.row === -75)
        expect(extra).toBeDefined()
        expect(extra!.groupKey).toBe('D075_WoodField')
        expect(extra!.allowedCrops).toEqual(['wood'])
      },
    )
  })

  it('filters stone extra field by resources.stone', () => {
    const playerNoStone = makeBlankPlayer({
      resources: { stone: 0 },
      minorPlayed: [FAKE_PROVIDER_ID],
    }) as unknown as PlayerState
    withFakeExtra(
      [
        {
          tile: { row: -80, col: 0 },
          allowedCrops: ['stone'],
          sourceCard: 'E080_RockGarden',
          groupKey: 'E080_RockGarden',
        },
      ],
      () => {
        const interaction = buildSowFarmInteraction(playerNoStone)
        if (interaction.farmType !== 'sow') throw new Error('expected sow farmType')
        expect(
          interaction.selectableFields.find((f) => f.tile.row === -80),
        ).toBeUndefined()
      },
    )

    const playerWithStone = makeBlankPlayer({
      resources: { stone: 2 },
      minorPlayed: [FAKE_PROVIDER_ID],
    }) as unknown as PlayerState
    withFakeExtra(
      [
        {
          tile: { row: -80, col: 0 },
          allowedCrops: ['stone'],
          sourceCard: 'E080_RockGarden',
          groupKey: 'E080_RockGarden',
        },
      ],
      () => {
        const interaction = buildSowFarmInteraction(playerWithStone)
        if (interaction.farmType !== 'sow') throw new Error('expected sow farmType')
        const extra = interaction.selectableFields.find((f) => f.tile.row === -80)
        expect(extra).toBeDefined()
        expect(extra!.allowedCrops).toEqual(['stone'])
      },
    )
  })

  it('actionContext.cropType="grain" restricts normal field to grain only', () => {
    const player = makeBlankPlayer({
      resources: { grain: 2, vegetable: 2 },
      fields: [{ row: 0, col: 0, stacks: [] }],
    }) as unknown as PlayerState
    const interaction = buildSowFarmInteraction(player, { cropType: 'grain' })
    if (interaction.farmType !== 'sow') throw new Error('expected sow farmType')
    const normal = interaction.selectableFields.find(
      (f) => f.tile.row === 0 && f.tile.col === 0,
    )
    expect(normal).toBeDefined()
    expect(normal!.allowedCrops).toEqual(['grain'])
  })

  it('actionContext.cropType="grain" excludes wood extra field', () => {
    const player = makeBlankPlayer({
      resources: { grain: 2, wood: 2 },
      minorPlayed: [FAKE_PROVIDER_ID],
    }) as unknown as PlayerState
    withFakeExtra(
      [
        {
          tile: { row: -1, col: 68 },
          allowedCrops: ['wood'],
          sourceCard: 'E068_CherryOrchard',
        },
      ],
      () => {
        const interaction = buildSowFarmInteraction(player, { cropType: 'grain' })
        if (interaction.farmType !== 'sow') throw new Error('expected sow farmType')
        expect(
          interaction.selectableFields.find((f) => f.tile.row === -1),
        ).toBeUndefined()
      },
    )
  })
})
