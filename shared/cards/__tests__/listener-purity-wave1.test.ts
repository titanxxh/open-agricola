import { describe, expect, it } from 'vitest'
import type { ActionFlow } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'
import { B48_ForestStone_impl } from '../B/B48_ForestStone'
import { C148_MudWallower_impl } from '../C/C148_MudWallower'
import { E103_Wolf_impl } from '../E/E103_Wolf'

const CARD_ID = 'B48_ForestStone'
const MUD_WALLOWER_CARD_ID = 'C148_MudWallower'
const WOLF_CARD_ID = 'E103_Wolf'

const makeB48Context = (
  foodCount = 2,
  gainPerRound: Partial<Record<'wood' | 'stone', number>> = { wood: 3 },
): CardListenerContext => {
  const player = {
    id: 'p1',
    name: 'P1',
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    cardStates: { [CARD_ID]: { extraData: { foodCount }, infobox: `${foodCount} Food` } },
    improvements: [CARD_ID],
    minorPlayed: [CARD_ID],
    occupationPlayed: [],
  } as never
  return {
    state: { players: [player], actionSpaces: [] } as never,
    player,
    triggerPlayer: player,
    ownerPlayer: player,
    effectPlayer: player,
    space: { id: 'forest', gainPerRound } as never,
    actionId: 'collect',
    phase: 'after',
    result: { type: 'ok', resourcesGained: { wood: 3 } },
  }
}

const collectLeaves = (flow: ActionFlow): ActionFlow[] => {
  if (flow.type === 'leaf') return [flow]
  if ('children' in flow) return flow.children.flatMap(collectLeaves)
  return []
}

const makeC148Context = (
  counter: number,
  held: number,
  gainPerRound: Partial<Record<'wood' | 'clay' | 'boar', number>> = { wood: 3 },
): CardListenerContext => {
  const player = {
    id: 'p1',
    name: 'P1',
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    cardStates: { [MUD_WALLOWER_CARD_ID]: { counters: { counter, held }, infobox: `${counter} / 4` } },
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [MUD_WALLOWER_CARD_ID],
  } as never
  return {
    state: { players: [player], actionSpaces: [] } as never,
    player,
    triggerPlayer: player,
    ownerPlayer: player,
    effectPlayer: player,
    space: { id: 'forest', gainPerRound } as never,
    actionId: 'place-farmer',
    phase: 'after',
    result: { type: 'ok' },
  }
}

const mudWallowerAfterPlaceFarmerListener = () =>
  C148_MudWallower_impl.listeners!.find(
    (entry) => entry.id === 'C148-mud-wallower-after-place-farmer',
  )!

const makeE103Context = (
  stack: string[] = ['clay', 'wood', 'grain'],
  resourcesGained: Record<string, number> = { grain: 1 },
): CardListenerContext => {
  const player = {
    id: 'p1',
    name: 'P1',
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 1, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    cardStates: { [WOLF_CARD_ID]: { stack: [...stack] } },
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [WOLF_CARD_ID],
  } as never
  return {
    state: { players: [player], actionSpaces: [] } as never,
    player,
    triggerPlayer: player,
    ownerPlayer: player,
    effectPlayer: player,
    space: { id: 'grain-seeds' } as never,
    actionId: 'gain',
    phase: 'after',
    result: { type: 'ok', resourcesGained },
  }
}

describe('listener purity wave 1', () => {
  it('B48 wood handler returns flow without decrementing stored food immediately', () => {
    const listener = B48_ForestStone_impl.listeners![0]!
    const ctx = makeB48Context(2, { wood: 3 })
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result?.flow).toBeDefined()
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
    expect(collectLeaves(result!.flow!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'special-effect',
          params: { kind: 'set-extra-data', key: 'foodCount', value: 1 },
        }),
        expect.objectContaining({
          actionId: 'special-effect',
          params: { kind: 'set-counter', key: 'foodCount', value: 1 },
        }),
        expect.objectContaining({
          actionId: 'special-effect',
          params: { kind: 'set-infobox', text: '1 Food' },
        }),
        expect.objectContaining({ actionId: 'gain' }),
      ]),
    )
  })

  it('B48 wood handler returns no flow when stored food is empty', () => {
    const listener = B48_ForestStone_impl.listeners![0]!
    const ctx = makeB48Context(0, { wood: 3 })
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result).toBeUndefined()
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('B48 stone handler returns flow without incrementing stored food immediately', () => {
    const listener = B48_ForestStone_impl.listeners![1]!
    const ctx = makeB48Context(2, { stone: 1 })
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result?.flow).toBeDefined()
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
    expect(collectLeaves(result!.flow!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'special-effect',
          params: { kind: 'set-extra-data', key: 'foodCount', value: 4 },
        }),
        expect.objectContaining({
          actionId: 'special-effect',
          params: { kind: 'set-counter', key: 'foodCount', value: 4 },
        }),
        expect.objectContaining({
          actionId: 'special-effect',
          params: { kind: 'set-infobox', text: '4 Food' },
        }),
      ]),
    )
  })

  it('E103 handler returns stack-pop and boar-gain flow without popping stack immediately', () => {
    const listener = E103_Wolf_impl.listeners![0]!
    const ctx = makeE103Context()
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: WOLF_CARD_ID,
          params: { kind: 'pop-card-stack-top' },
        },
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: WOLF_CARD_ID,
          params: { boar: 1 },
          choiceLabelKey: undefined,
          choiceLabelParams: undefined,
        },
      ],
    })
    expect(result?.sourceCard).toBe(WOLF_CARD_ID)
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('E103 handler returns no flow for non-matching gained resource', () => {
    const listener = E103_Wolf_impl.listeners![0]!
    const ctx = makeE103Context(['clay', 'wood', 'grain'], { wood: 1 })
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result).toBeUndefined()
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('E103 handler returns no flow for an empty stack', () => {
    const listener = E103_Wolf_impl.listeners![0]!
    const ctx = makeE103Context([], { grain: 1 })
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result).toBeUndefined()
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('C148 handler returns boar flow without resetting counters immediately', () => {
    const listener = mudWallowerAfterPlaceFarmerListener()
    const ctx = makeC148Context(3, 0)
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result?.flow).toBeDefined()
    expect(ctx.player.cardStates?.[MUD_WALLOWER_CARD_ID]?.counters).toEqual({ counter: 3, held: 0 })
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('C148 handler returns no flow and no mutation for non-accumulation spaces', () => {
    const listener = mudWallowerAfterPlaceFarmerListener()
    const ctx = makeC148Context(0, 0, {})
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result).toBeUndefined()
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it.each([
    [0, 1],
    [1, 2],
    [2, 3],
  ])('C148 handler returns counter %i -> %i flow without mutating immediately', (counter, nextCounter) => {
    const listener = mudWallowerAfterPlaceFarmerListener()
    const ctx = makeC148Context(counter, 2)
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: MUD_WALLOWER_CARD_ID,
          params: { kind: 'set-counter', key: 'counter', value: nextCounter },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: MUD_WALLOWER_CARD_ID,
          params: { kind: 'set-infobox', text: `${nextCounter} / 4` },
        },
      ],
    })
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('C148 handler returns reset, held, infobox, and boar flow on every fourth accumulation space', () => {
    const listener = mudWallowerAfterPlaceFarmerListener()
    const ctx = makeC148Context(3, 2)
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: MUD_WALLOWER_CARD_ID,
          params: { kind: 'set-counter', key: 'counter', value: 0 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: MUD_WALLOWER_CARD_ID,
          params: { kind: 'set-counter', key: 'held', value: 3 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: MUD_WALLOWER_CARD_ID,
          params: { kind: 'set-infobox', text: '0 / 4' },
        },
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: MUD_WALLOWER_CARD_ID,
          params: { boar: 1 },
          choiceLabelKey: undefined,
          choiceLabelParams: undefined,
        },
      ],
    })
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })
})
