import { describe, it, expect } from 'vitest'
import { E80_RockGarden_impl } from '../E/E80_RockGarden'
import type { PlayerState } from '../../contract/types'

const CARD_ID = 'E80_RockGarden'
const ROW = -80

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
  it('does not initialize stacks on onBuy (lazy)', () => {
    const player = blankPlayer({ resources: { stone: 0 } as never })
    E80_RockGarden_impl.effect?.onBuy?.({} as never, player)
    expect(player.cardStates?.[CARD_ID]?.extraData?.stacks ?? []).toEqual([])
  })

  it('onComputeSowableFields returns 3 slots when stacks=[] and stone=3', () => {
    const player = blankPlayer({ resources: { stone: 3 } as never })
    const out = E80_RockGarden_impl.effect!.onComputeSowableFields!(player)
    expect(out).toHaveLength(3)
    expect(out[0].tile).toEqual({ row: ROW, col: 0 })
    expect(out[1].tile).toEqual({ row: ROW, col: 1 })
    expect(out[2].tile).toEqual({ row: ROW, col: 2 })
    expect(out[0].allowedCrops).toEqual(['stone'])
    expect(out[0].sourceCard).toBe(CARD_ID)
    expect(out[0].groupKey).toBe(CARD_ID)
    expect(out[1].groupKey).toBe(CARD_ID)
    expect(out[2].groupKey).toBe(CARD_ID)
  })

  it('onComputeSowableFields returns 1 slot when stacks=[] and stone=1', () => {
    const player = blankPlayer({ resources: { stone: 1 } as never })
    const out = E80_RockGarden_impl.effect!.onComputeSowableFields!(player)
    expect(out).toHaveLength(1)
    expect(out[0].tile).toEqual({ row: ROW, col: 0 })
  })

  it('onComputeSowableFields returns 0 slots when stone=0', () => {
    const player = blankPlayer({ resources: { stone: 0 } as never })
    const out = E80_RockGarden_impl.effect!.onComputeSowableFields!(player)
    expect(out).toEqual([])
  })

  it('onComputeSowableFields returns 0 slots when stacks=MAX', () => {
    const player = blankPlayer({
      resources: { stone: 5 } as never,
      cardStates: {
        [CARD_ID]: {
          extraData: {
            stacks: [
              { kind: 'stone', remaining: 2 },
              { kind: 'stone', remaining: 2 },
              { kind: 'stone', remaining: 2 },
            ],
          },
        },
      } as never,
    })
    const out = E80_RockGarden_impl.effect!.onComputeSowableFields!(player)
    expect(out).toEqual([])
  })

  it('onSowExtraField pushes a stone stack and decrements resource', () => {
    const player = blankPlayer({ resources: { stone: 3 } as never })
    const ok = E80_RockGarden_impl.effect!.onSowExtraField!(player, { row: ROW, col: 0 }, 'stone')
    expect(ok).toBe(true)
    expect(player.resources.stone).toBe(2)
    expect(player.cardStates?.[CARD_ID]?.extraData?.stacks).toEqual([{ kind: 'stone', remaining: 2 }])
  })

  it('onHarvestFieldPhase decrements every stack and adds stone per stack', () => {
    const player = blankPlayer({
      resources: { stone: 0 } as never,
      cardStates: {
        [CARD_ID]: {
          extraData: {
            stacks: [
              { kind: 'stone', remaining: 2 },
              { kind: 'stone', remaining: 2 },
              { kind: 'stone', remaining: 2 },
            ],
          },
        },
      } as never,
    })
    const state = { players: [player] } as never
    E80_RockGarden_impl.effect!.onHarvestFieldPhase!(state, player)
    expect(player.resources.stone).toBe(3)
    expect(player.cardStates?.[CARD_ID]?.extraData?.stacks).toEqual([
      { kind: 'stone', remaining: 1 },
      { kind: 'stone', remaining: 1 },
      { kind: 'stone', remaining: 1 },
    ])
  })

  it('onHarvestFieldPhase removes empty stacks', () => {
    const player = blankPlayer({
      resources: { stone: 0 } as never,
      cardStates: {
        [CARD_ID]: {
          extraData: {
            stacks: [
              { kind: 'stone', remaining: 1 },
              { kind: 'stone', remaining: 1 },
              { kind: 'stone', remaining: 1 },
            ],
          },
        },
      } as never,
    })
    const state = { players: [player] } as never
    E80_RockGarden_impl.effect!.onHarvestFieldPhase!(state, player)
    expect(player.resources.stone).toBe(3)
    expect(player.cardStates?.[CARD_ID]?.extraData?.stacks).toEqual([])
  })

  it('isDoable listener fires when normal fields full + stone >= 1', () => {
    const player = blankPlayer({
      resources: { stone: 1 } as never,
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }] as never,
    })
    const listener = E80_RockGarden_impl.listeners![0]
    const result = listener.handler({ player, action: 'sow', state: {} as never, eventName: 'isDoable' } as never)
    expect(result).toEqual({ doable: true })
  })
})
