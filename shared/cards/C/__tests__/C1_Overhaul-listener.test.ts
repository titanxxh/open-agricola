import { describe, expect, it } from 'vitest'
import { C1_Overhaul_impl } from '../C1_Overhaul'
import type { ActionFlow, GameState, PlayerState } from '../../../contract/types'

const makePlayer = (ownFenceCount: number): PlayerState => {
  const player = {
    id: 'p1',
    fenceSegments: [],
  } as unknown as PlayerState
  player.fenceSegments = Array.from({ length: ownFenceCount }, (_, i) => ({
    edge: `H-0-${i}`,
    type: 'fence',
    source: { kind: 'own', ownerPlayerId: player.id },
  }))
  return player
}

const runOnBuy = (ownFenceCount: number) =>
  C1_Overhaul_impl.effect.onBuy({} as GameState, makePlayer(ownFenceCount))

const expectC1RebuildFlow = (
  flow: ActionFlow | undefined,
  count: number,
  max: number,
) => {
  expect(flow).toMatchObject({
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: 'C1_Overhaul',
        params: {
          kind: 'consume-fence',
          count,
          segmentType: 'fence',
          sourcePolicy: 'ownOnly',
        },
      },
      {
        type: 'leaf',
        actionId: 'fence',
        sourceCard: 'C1_Overhaul',
        actionContext: {
          trueAction: false,
          fencePolicy: {
            allowedSegmentTypes: ['fence'],
            sourcePolicy: 'ownOnly',
            segmentBounds: { fence: { min: count, max } },
            costPolicy: { fence: { wood: 0 } },
            cancelPolicy: 'forbidCancel',
            preserveAnimalTotals: true,
          },
        },
      },
    ],
  })
  expect(flow).not.toHaveProperty('optional')
}

describe('C1 Overhaul onBuy policy flow', () => {
  it('does not register the removed fence-discount listener', () => {
    expect(C1_Overhaul_impl.listeners ?? []).toEqual([])
  })

  it('returns undefined when the buyer has no own ordinary fences', () => {
    expect(runOnBuy(0)).toBeUndefined()
  })

  it('returns consume-fence ownOnly followed by a C1 fence policy rebuild', () => {
    expectC1RebuildFlow(runOnBuy(2), 2, 5)
  })

  it('caps the C1 rebuild policy at the ordinary fence supply', () => {
    expectC1RebuildFlow(runOnBuy(13), 13, 15)
  })

  it('does not use c1Active or c1MaxRebuild card state logic', () => {
    const serialized = JSON.stringify(C1_Overhaul_impl)
    expect(serialized).not.toContain('C1-fence-discount')
    expect(serialized).not.toContain('c1Active')
    expect(serialized).not.toContain('c1MaxRebuild')
  })
})
