import { describe, it, expect } from 'vitest'
import { D075_WoodField_impl } from '../D/D075_WoodField'
import type { PlayerState } from '../../contract/types'

const CARD_ID = 'D075_WoodField'
const ROW = -1
const COL_BASE = 4075

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

describe('D75 Wood Field', () => {
  it('onComputeSowableFields returns 2 slots when stacks=[] and wood=2', () => {
    const player = blankPlayer({ resources: { wood: 2 } as never })
    const out = D075_WoodField_impl.effect!.onComputeSowableFields!(player)
    expect(out).toHaveLength(2)
    expect(out[0].tile).toEqual({ row: ROW, col: COL_BASE })
    expect(out[1].tile).toEqual({ row: ROW, col: COL_BASE + 1 })
    expect(out[0].allowedCrops).toEqual(['wood'])
    expect(out[0].sourceCard).toBe(CARD_ID)
    expect(out[0].groupKey).toBe(CARD_ID)
    expect(out[1].groupKey).toBe(CARD_ID)
  })

  it('onComputeSowableFields exposes all empty slots regardless of wood balance (validation happens at sow time)', () => {
    const player = blankPlayer({ resources: { wood: 1 } as never })
    const out = D075_WoodField_impl.effect!.onComputeSowableFields!(player)
    expect(out).toHaveLength(2)
    expect(out[0].tile).toEqual({ row: ROW, col: COL_BASE })
    expect(out[1].tile).toEqual({ row: ROW, col: COL_BASE + 1 })
  })

  it('onComputeSowableFields still exposes empty slots even with wood=0 (filtering left to sow validation)', () => {
    const player = blankPlayer({ resources: { wood: 0 } as never })
    const out = D075_WoodField_impl.effect!.onComputeSowableFields!(player)
    expect(out).toHaveLength(2)
  })

  it('onComputeSowableFields returns 0 slots when stacks=MAX', () => {
    const player = blankPlayer({
      resources: { wood: 5 } as never,
      cardStates: { [CARD_ID]: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 3 }] } } } as never,
    })
    const out = D075_WoodField_impl.effect!.onComputeSowableFields!(player)
    expect(out).toEqual([])
  })

  it('onSowExtraField pushes a wood stack and decrements resource', () => {
    const player = blankPlayer({ resources: { wood: 2 } as never })
    const ok = D075_WoodField_impl.effect!.onSowExtraField!(player, { row: ROW, col: COL_BASE }, 'wood')
    expect(ok).toBe(true)
    expect(player.resources.wood).toBe(1)
    expect(player.cardStates?.[CARD_ID]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 3 },
      null,
    ])
  })

  it('onHarvestFieldPhase decrements every stack and adds wood per stack', () => {
    const player = blankPlayer({
      resources: { wood: 0 } as never,
      cardStates: { [CARD_ID]: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 2 }] } } } as never,
    })
    const state = { players: [player] } as never
    D075_WoodField_impl.effect!.onHarvestFieldPhase!(state, player)
    expect(player.resources.wood).toBe(2)
    expect(player.cardStates?.[CARD_ID]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 2 },
      { crop: 'wood', remaining: 1 },
    ])
  })

  it('onHarvestFieldPhase removes empty stacks', () => {
    const player = blankPlayer({
      resources: { wood: 0 } as never,
      cardStates: { [CARD_ID]: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }, { crop: 'wood', remaining: 1 }] } } } as never,
    })
    const state = { players: [player] } as never
    D075_WoodField_impl.effect!.onHarvestFieldPhase!(state, player)
    expect(player.resources.wood).toBe(2)
    expect(player.cardStates?.[CARD_ID]?.extraData?.cardFieldStacks).toEqual([null, null])
  })

  it('isDoable listener fires when normal fields full + wood >= 1', () => {
    const player = blankPlayer({
      resources: { wood: 1 } as never,
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }] as never,
    })
    const listener = D075_WoodField_impl.listeners![0]
    const result = listener.handler({ player, action: 'sow', state: {} as never, eventName: 'isDoable' } as never)
    expect(result).toEqual({ doable: true })
  })
})
