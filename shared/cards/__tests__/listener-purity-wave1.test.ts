import { describe, expect, it } from 'vitest'
import type { ActionFlow } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'
import type { CardListenerContext } from '../card-listeners'
import { guardedListener } from './listener-purity-guard'
import { A144_Sequestrator_impl } from '../A/A144_Sequestrator'
import { B048_ForestStone_impl } from '../B/B048_ForestStone'
import { C148_MudWallower_impl } from '../C/C148_MudWallower'
import { D027_Retraining_impl } from '../D/D027_Retraining'
import { E103_Wolf_impl } from '../E/E103_Wolf'

const SEQUESTRATOR_CARD_ID = 'A144_Sequestrator'
const CARD_ID = 'B048_ForestStone'
const MUD_WALLOWER_CARD_ID = 'C148_MudWallower'
const RETRAINING_CARD_ID = 'D027_Retraining'
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

const makeA144Context = (): CardListenerContext => {
  const owner = {
    id: 'p1',
    name: 'Owner',
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    cardStates: { [SEQUESTRATOR_CARD_ID]: { counters: { reed: 3, clay: 4 } } },
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [SEQUESTRATOR_CARD_ID],
  } as never
  const triggerPlayer = {
    id: 'p2',
    name: 'Trigger',
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    pastures: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    cardStates: {},
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
  } as never
  return {
    state: { players: [owner, triggerPlayer], actionSpaces: [] } as never,
    player: triggerPlayer,
    triggerPlayer,
    ownerPlayer: owner,
    effectPlayer: owner,
    space: { id: 'fence' } as never,
    actionId: 'fence',
    phase: 'after',
    result: { type: 'ok' },
  }
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
  const actionEvents: DraftGameEvent<'resource.moved'>[] = Object.entries(resourcesGained)
    .map(([resource, amount]) => ({
      type: 'resource.moved',
      resources: { [resource]: amount },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: player.id },
      reason: 'gain',
    }) as DraftGameEvent<'resource.moved'>)
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
    transactionEvents: actionEvents,
    actionEvents,
  }
}

const makeD27Context = (
  flagged: boolean,
  improvements: string[] = ['Major_Joinery'],
  availableMajorImprovements: string[] = ['Major_Pottery'],
): CardListenerContext => {
  const player = {
    id: 'p1',
    name: 'P1',
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    cardStates: flagged ? { [RETRAINING_CARD_ID]: { flagged: true } } : {},
    improvements: [...improvements],
    minorPlayed: [RETRAINING_CARD_ID],
    occupationPlayed: [],
  } as never
  return {
    state: { players: [player], actionSpaces: [], availableMajorImprovements: [...availableMajorImprovements] } as never,
    player,
    triggerPlayer: player,
    ownerPlayer: player,
    effectPlayer: player,
    space: { id: 'forest' } as never,
    actionId: 'place-farmer',
    phase: 'after',
    result: { type: 'ok' },
  }
}

describe('listener purity wave 1', () => {
  it('A144 handler returns storage-clear and trigger-player gain flow without mutating immediately', () => {
    const listener = guardedListener(A144_Sequestrator_impl.listeners![0]!)
    const ctx = makeA144Context()
    const owner = ctx.state.players[0]!
    const triggerPlayer = ctx.state.players[1]!
    const beforeOwnerCardStates = JSON.stringify(owner.cardStates)

    const result = listener.handler(ctx)

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: SEQUESTRATOR_CARD_ID,
          params: { kind: 'set-counter', key: 'reed', value: 0 },
        },
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: SEQUESTRATOR_CARD_ID,
          params: { reed: 3, recipientPlayerId: 'p2' },
        },
      ],
    })
    expect(JSON.stringify(owner.cardStates)).toBe(beforeOwnerCardStates)
    expect(triggerPlayer.resources.reed).toBe(0)
  })

  it('B48 wood handler returns flow without decrementing stored food immediately', () => {
    const listener = guardedListener(B048_ForestStone_impl.listeners![0]!)
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
    const listener = guardedListener(B048_ForestStone_impl.listeners![0]!)
    const ctx = makeB48Context(0, { wood: 3 })
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result).toBeUndefined()
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('B48 stone handler returns flow without incrementing stored food immediately', () => {
    const listener = guardedListener(B048_ForestStone_impl.listeners![1]!)
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
    const listener = guardedListener(E103_Wolf_impl.listeners![0]!)
    const ctx = makeE103Context()
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result?.flow).toMatchObject({ type: 'xor', optional: true })
    expect(result?.sourceCard).toBe(WOLF_CARD_ID)
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('E103 handler returns no flow for non-matching gained resource', () => {
    const listener = guardedListener(E103_Wolf_impl.listeners![0]!)
    const ctx = makeE103Context(['clay', 'wood', 'grain'], { wood: 1 })
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result).toBeUndefined()
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('E103 handler returns no flow for an empty stack', () => {
    const listener = guardedListener(E103_Wolf_impl.listeners![0]!)
    const ctx = makeE103Context([], { grain: 1 })
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result).toBeUndefined()
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('C148 handler returns boar flow without resetting counters immediately', () => {
    const listener = guardedListener(mudWallowerAfterPlaceFarmerListener())
    const ctx = makeC148Context(3, 0)
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result?.flow).toBeDefined()
    expect(ctx.player.cardStates?.[MUD_WALLOWER_CARD_ID]?.counters).toEqual({ counter: 3, held: 0 })
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('C148 handler returns no flow and no mutation for non-accumulation spaces', () => {
    const listener = guardedListener(mudWallowerAfterPlaceFarmerListener())
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
    const listener = guardedListener(mudWallowerAfterPlaceFarmerListener())
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
    const listener = guardedListener(mudWallowerAfterPlaceFarmerListener())
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

  it('D27 renovation handler returns set-flag flow without mutating immediately', () => {
    const listener = guardedListener(D027_Retraining_impl.listeners![0]!)
    const ctx = makeD27Context(false)
    ctx.actionId = 'renovate-house'
    ctx.space = { id: 'renovate-house' } as never
    const before = JSON.stringify(ctx.player.cardStates)

    const result = listener.handler(ctx)

    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: RETRAINING_CARD_ID,
      params: { kind: 'set-flag', flag: true },
    })
    expect(JSON.stringify(ctx.player.cardStates)).toBe(before)
  })

  it('D27 place-farmer handler returns clear-flag plus optional swap without reserving the board', () => {
    const listener = guardedListener(D027_Retraining_impl.listeners![1]!)
    const ctx = makeD27Context(true, ['Major_Joinery'], ['Major_Pottery'])
    const beforePlayer = JSON.stringify(ctx.player)
    const beforeMajors = JSON.stringify(ctx.state.availableMajorImprovements)

    const result = listener.handler(ctx)

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: RETRAINING_CARD_ID,
          params: { kind: 'set-flag', flag: false },
        },
        {
          type: 'seq',
          optional: true,
          children: [
            {
              type: 'leaf',
              actionId: 'special-effect',
              sourceCard: RETRAINING_CARD_ID,
              params: {
                kind: 'swap-improvement-with-board',
                from: 'Major_Joinery',
                to: 'Major_Pottery',
              },
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(ctx.player)).toBe(beforePlayer)
    expect(JSON.stringify(ctx.state.availableMajorImprovements)).toBe(beforeMajors)
  })

  it('D27 place-farmer handler returns only clear-flag when no swap is available', () => {
    const listener = guardedListener(D027_Retraining_impl.listeners![1]!)
    const ctx = makeD27Context(true, ['Major_Joinery'], [])
    const beforePlayer = JSON.stringify(ctx.player)
    const beforeMajors = JSON.stringify(ctx.state.availableMajorImprovements)

    const result = listener.handler(ctx)

    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: RETRAINING_CARD_ID,
      params: { kind: 'set-flag', flag: false },
    })
    expect(JSON.stringify(ctx.player)).toBe(beforePlayer)
    expect(JSON.stringify(ctx.state.availableMajorImprovements)).toBe(beforeMajors)
  })

  it('D27 place-farmer handler returns no flow when not flagged', () => {
    const listener = guardedListener(D027_Retraining_impl.listeners![1]!)
    const ctx = makeD27Context(false, ['Major_Joinery'], ['Major_Pottery'])
    const beforePlayer = JSON.stringify(ctx.player)
    const beforeMajors = JSON.stringify(ctx.state.availableMajorImprovements)

    const result = listener.handler(ctx)

    expect(result).toBeUndefined()
    expect(JSON.stringify(ctx.player)).toBe(beforePlayer)
    expect(JSON.stringify(ctx.state.availableMajorImprovements)).toBe(beforeMajors)
  })
})
