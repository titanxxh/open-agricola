import { describe, it, expect } from 'vitest'
import { E080_RockGarden_impl } from '../E/E080_RockGarden'
import type { PlayerState } from '../../contract/types'

const CARD_ID = 'E080_RockGarden'
const ROW = -1
const COL_BASE = 5080

const blankPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  resources: { grain: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, sheep: 0, boar: 0, cattle: 0 } as never,
  fields: [],
  minorPlayed: [CARD_ID],
  occupationPlayed: [],
  improvements: [],
  pastures: [],
  cardStates: {},
  ...(overrides as PlayerState),
})

describe('E80 Rock Garden', () => {
  it('onComputeSowableFields returns 3 slots when stacks=[] and stone=3', () => {
    const player = blankPlayer({ resources: { stone: 3 } as never })
    const out = E080_RockGarden_impl.effect!.onComputeSowableFields!(player)
    expect(out).toHaveLength(3)
    expect(out[0].tile).toEqual({ row: ROW, col: COL_BASE })
    expect(out[1].tile).toEqual({ row: ROW, col: COL_BASE + 1 })
    expect(out[2].tile).toEqual({ row: ROW, col: COL_BASE + 2 })
    expect(out[0].allowedCrops).toEqual(['stone'])
    expect(out[0].sourceCard).toBe(CARD_ID)
    expect(out[0].groupKey).toBe(CARD_ID)
    expect(out[1].groupKey).toBe(CARD_ID)
    expect(out[2].groupKey).toBe(CARD_ID)
  })

  it('onComputeSowableFields exposes all empty slots regardless of stone balance (validation happens at sow time)', () => {
    const player = blankPlayer({ resources: { stone: 1 } as never })
    const out = E080_RockGarden_impl.effect!.onComputeSowableFields!(player)
    expect(out).toHaveLength(3)
  })

  it('onComputeSowableFields still exposes empty slots even with stone=0 (filtering left to sow validation)', () => {
    const player = blankPlayer({ resources: { stone: 0 } as never })
    const out = E080_RockGarden_impl.effect!.onComputeSowableFields!(player)
    expect(out).toHaveLength(3)
  })

  it('onComputeSowableFields returns 0 slots when stacks=MAX', () => {
    const player = blankPlayer({
      resources: { stone: 5 } as never,
      cardStates: {
        [CARD_ID]: {
          extraData: {
            cardFieldStacks: [
              { crop: 'stone', remaining: 2 },
              { crop: 'stone', remaining: 2 },
              { crop: 'stone', remaining: 2 },
            ],
          },
        },
      } as never,
    })
    const out = E080_RockGarden_impl.effect!.onComputeSowableFields!(player)
    expect(out).toEqual([])
  })

  it('onSowExtraField pushes a stone stack and decrements resource', () => {
    const player = blankPlayer({ resources: { stone: 3 } as never })
    const ok = E080_RockGarden_impl.effect!.onSowExtraField!(player, { row: ROW, col: COL_BASE }, 'stone')
    expect(ok).toBe(true)
    expect(player.resources.stone).toBe(2)
    expect(player.cardStates?.[CARD_ID]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'stone', remaining: 2 },
      null,
      null,
    ])
  })

  it('onHarvestFieldPhase decrements every stack and adds stone per stack', () => {
    const player = blankPlayer({
      resources: { stone: 0 } as never,
      cardStates: {
        [CARD_ID]: {
          extraData: {
            cardFieldStacks: [
              { crop: 'stone', remaining: 2 },
              { crop: 'stone', remaining: 2 },
              { crop: 'stone', remaining: 2 },
            ],
          },
        },
      } as never,
    })
    const state = { players: [player] } as never
    E080_RockGarden_impl.effect!.onHarvestFieldPhase!(state, player)
    expect(player.resources.stone).toBe(3)
    expect(player.cardStates?.[CARD_ID]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'stone', remaining: 1 },
      { crop: 'stone', remaining: 1 },
      { crop: 'stone', remaining: 1 },
    ])
  })

  it('onHarvestFieldPhase removes empty stacks', () => {
    const player = blankPlayer({
      resources: { stone: 0 } as never,
      cardStates: {
        [CARD_ID]: {
          extraData: {
            cardFieldStacks: [
              { crop: 'stone', remaining: 1 },
              { crop: 'stone', remaining: 1 },
              { crop: 'stone', remaining: 1 },
            ],
          },
        },
      } as never,
    })
    const state = { players: [player] } as never
    E080_RockGarden_impl.effect!.onHarvestFieldPhase!(state, player)
    expect(player.resources.stone).toBe(3)
    expect(player.cardStates?.[CARD_ID]?.extraData?.cardFieldStacks).toEqual([null, null, null])
  })

  it('isDoable listener fires when normal fields full + stone >= 1', () => {
    const player = blankPlayer({
      resources: { stone: 1 } as never,
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }] as never,
    })
    const listener = E080_RockGarden_impl.listeners![0]
    const result = listener.handler({ player, action: 'sow', state: {} as never, eventName: 'isDoable' } as never)
    expect(result).toEqual({ doable: true })
  })
})
