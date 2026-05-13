import { describe, expect, it } from 'vitest'
import type { ActionFlow } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'
import { B48_ForestStone_impl } from '../B/B48_ForestStone'

const CARD_ID = 'B48_ForestStone'

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
})
