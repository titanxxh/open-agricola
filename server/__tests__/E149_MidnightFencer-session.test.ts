import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import '../../shared/cards/register-all'
import type { ActionFlow, GameState, PlayerState, Resource } from '../../shared/game/types'

const CARD_ID = 'E149_MidnightFencer'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const makePlayer = (id = 'p1'): PlayerState => ({
  id,
  name: id,
  color: 'red',
  resources: emptyResources(),
  workers: [],
  fields: [],
  pastures: [],
  rooms: [],
  stables: [],
  occupationHand: [],
  minorHand: [],
  occupationPlayed: [CARD_ID],
  minorPlayed: [],
  improvements: [],
  cardStates: {},
  hasBegged: false,
} as unknown as PlayerState)

const makeState = (round: number, numPlayers = 4): GameState => ({
  round,
  players: Array.from({ length: numPlayers }, (_, i) => makePlayer(`p${i + 1}`)),
} as unknown as GameState)

describe('E149 MidnightFencer', () => {
  it('round 13: no offer (only triggers at round 14)', () => {
    const state = makeState(13)
    const flow = getCardEffect(CARD_ID)?.onStartHarvest?.(state, state.players[0]!)
    expect(flow).toBeUndefined()
  })

  // Helpers to navigate the SEQ-wrapped flow returned by onStartHarvest.
  const findEmitChoice = (flow: ActionFlow | void | undefined) => {
    if (!flow || flow.type !== 'seq') return undefined
    return flow.children.find(
      (c): c is ActionFlow & { actionId: string; params: { options: unknown[] } } =>
        c.type === 'leaf' && c.actionId === 'emit-choice',
    )
  }

  it('round 14 4-player: offers choice 0..6 (7 options total)', () => {
    const state = makeState(14, 4)
    const flow = getCardEffect(CARD_ID)?.onStartHarvest?.(state, state.players[0]!)
    expect(flow).toBeDefined()
    const emitChoice = findEmitChoice(flow)
    expect(emitChoice).toBeDefined()
    expect(emitChoice!.actionId).toBe('emit-choice')
    expect((emitChoice!.params as { options: unknown[] }).options.length).toBe(7)
  })

  it('round 14 5-player: offers choice 0..8 (9 options total)', () => {
    const state = makeState(14, 5)
    const flow = getCardEffect(CARD_ID)?.onStartHarvest?.(state, state.players[0]!)
    expect(flow).toBeDefined()
    const emitChoice = findEmitChoice(flow)
    expect((emitChoice!.params as { options: unknown[] }).options.length).toBe(9)
  })

  it('round 14 second invocation flagged via cardStates: no re-offer', () => {
    const state = makeState(14, 4)
    const player = state.players[0]!
    const first = getCardEffect(CARD_ID)?.onStartHarvest?.(state, player)
    expect(first).toBeDefined()
    // Engine would persist `offered=true` via the special-effect leaf inside
    // the returned SEQ. Simulate that by setting the flag manually for the
    // second invocation.
    player.cardStates = { ...(player.cardStates ?? {}) }
    player.cardStates[CARD_ID] = { extraData: { offered: true } }
    const second = getCardEffect(CARD_ID)?.onStartHarvest?.(state, player)
    expect(second).toBeUndefined()
  })

  it('resolveChoice "3" returns special-effect leaf incrementing owedFences by 3', () => {
    const player = makePlayer()
    const flow = getCardEffect(CARD_ID)?.resolveChoice?.(
      {} as GameState,
      player,
      '3',
      { sourceCard: CARD_ID },
    )
    expect(flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'increment-extra-data', key: 'owedFences', amount: 3 },
    })
  })

  it('resolveChoice "0" returns no flow (no mutation needed)', () => {
    const player = makePlayer()
    const flow = getCardEffect(CARD_ID)?.resolveChoice?.(
      {} as GameState,
      player,
      '0',
      { sourceCard: CARD_ID },
    )
    expect(flow).toBeUndefined()
  })

  it('computeBonusScore returns owedFences value', () => {
    const player = makePlayer()
    player.cardStates![CARD_ID] = { extraData: { owedFences: 5, offered: true } }
    const vp = getCardEffect(CARD_ID)?.computeBonusScore?.(
      {} as GameState,
      player,
      { reserved: {} },
    )
    expect(vp).toBe(5)
  })
})
