import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E073_Scythe'
import { E112_GrainThief_impl } from '../../shared/cards/E/E112_GrainThief'
import type { ActionFlow, ActionSpace, Field } from '../../shared/contract/types'
import { getAdHocAction } from '../../shared/actions/helpers/ad-hoc-action-registry'
import { reap } from '../../shared/actions/effects/reap'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'

const CARD_ID = 'E073_Scythe'

const makeField = (
  row: number,
  col: number,
  stacks: Array<{ kind: 'grain' | 'vegetable'; remaining: number }>,
): Field => ({ row, col, stacks })

const setupSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  return { session, state }
}

describe('E073_Scythe session — token model + reap full stack', () => {
  it('triggers when a field has at least 2 crops total (single-stack ≥2)', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [{ kind: 'grain', remaining: 3 }]),
    ]
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    const xor = flow as Extract<ActionFlow, { type: 'xor' }>
    expect(xor.optional).toBe(true)
    expect(xor.children.length).toBe(1)
  })

  it('does NOT trigger when only 1 crop on a field', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [{ kind: 'grain', remaining: 1 }]),
    ]
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('does not let E112 lower the E73 eligibility threshold', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationPlayed.push('E112_GrainThief')
    player.fields = [
      makeField(0, 0, [{ kind: 'grain', remaining: 1 }]),
      makeField(0, 1, [{ kind: 'grain', remaining: 2 }]),
    ]
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onStartHarvestFieldPhase!(state, player)

    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    const xor = flow as Extract<ActionFlow, { type: 'xor' }>
    expect(xor.children).toHaveLength(1)
    expect((xor.children[0] as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ fieldIndex: 1 })
  })

  it('does NOT trigger when no fields planted', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = []
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('full-reaps the selected multi-stack field through normal reap', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [
        { kind: 'grain', remaining: 1 },
        { kind: 'vegetable', remaining: 1 },
      ]),
      makeField(0, 1, [{ kind: 'grain', remaining: 2 }]),
    ]
    player.resources.grain = 0
    player.resources.vegetable = 0
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    const xor = flow as Extract<ActionFlow, { type: 'xor' }>
    expect(xor.children.length).toBe(2)

    const firstChild = xor.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(firstChild.actionId).toBe('card_E073_Scythe_harvest-field')
    expect(firstChild.params).toEqual({ fieldIndex: 0 })

    const adHoc = getAdHocAction('card_E073_Scythe_harvest-field')!
    const result = adHoc.execute({
      state,
      player,
      params: { fieldIndex: 0 },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0])

    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(0)
    expect(player.resources.vegetable).toBe(0)
    expect(player.fields[0]!.stacks).toEqual([
      { kind: 'grain', remaining: 1 },
      { kind: 'vegetable', remaining: 1 },
    ])

    const reapResult = reap(state, player)

    expect(player.resources.grain).toBe(2)
    expect(player.resources.vegetable).toBe(1)
    expect(player.fields[0]!.stacks.length).toBe(0)
    expect(player.fields[1]!.stacks[0]!.remaining).toBe(1)
    expect(reapResult.reapSummary.harvestedCrops).toEqual([
      { row: 0, col: 0, crop: 'vegetable', amount: 1, sources: ['base', CARD_ID] },
      { row: 0, col: 0, crop: 'grain', amount: 1, sources: ['base', CARD_ID] },
      { row: 0, col: 1, crop: 'grain', amount: 1, sources: ['base'] },
    ])
  })

  it('records selected field position without harvesting immediately', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [
        { kind: 'grain', remaining: 1 },
        { kind: 'vegetable', remaining: 1 },
      ]),
    ]
    player.resources.grain = 0
    player.resources.vegetable = 0
    session.loadState(state)

    const adHoc = getAdHocAction('card_E073_Scythe_harvest-field')!
    const result = adHoc.execute({
      state,
      player,
      params: { fieldIndex: 0 },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0])

    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(0)
    expect(player.resources.vegetable).toBe(0)
    expect(player.fields[0]!.stacks).toEqual([
      { kind: 'grain', remaining: 1 },
      { kind: 'vegetable', remaining: 1 },
    ])
    expect(player.cardStates[CARD_ID]?.extraData?.fullReapPosition).toEqual('0-0')
  })

  it('full-reaps a deep multi-stack field with normal reap', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [
        { kind: 'grain', remaining: 2 },
        { kind: 'vegetable', remaining: 1 },
      ]),
    ]
    player.resources.grain = 0
    player.resources.vegetable = 0
    session.loadState(state)

    const adHoc = getAdHocAction('card_E073_Scythe_harvest-field')!
    const result = adHoc.execute({
      state,
      player,
      params: { fieldIndex: 0 },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0])

    expect(result.type).toBe('ok')

    reap(state, player)

    expect(player.resources.grain).toBe(2)
    expect(player.resources.vegetable).toBe(1)
    expect(player.fields[0]!.stacks.length).toBe(0)
  })

  it('main reap does not double-harvest the field after Scythe full reap', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [
        { kind: 'grain', remaining: 1 },
        { kind: 'vegetable', remaining: 1 },
      ]),
    ]
    player.resources.grain = 0
    player.resources.vegetable = 0
    session.loadState(state)

    const adHoc = getAdHocAction('card_E073_Scythe_harvest-field')!
    adHoc.execute({
      state,
      player,
      params: { fieldIndex: 0 },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0])

    reap(state, player)

    expect(player.resources.grain).toBe(1)
    expect(player.resources.vegetable).toBe(1)
    expect(player.fields[0]!.stacks.length).toBe(0)

    reap(state, player)
    expect(player.resources.grain).toBe(1)
    expect(player.resources.vegetable).toBe(1)
  })

  it('E73 full reap overrides E112 on the same field and E112 does not gain supply grain', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationPlayed.push('E112_GrainThief')
    player.fields = [
      makeField(0, 0, [{ kind: 'grain', remaining: 3 }]),
    ]
    player.resources.grain = 0
    player.cardStates = {
      [CARD_ID]: { extraData: { fullReapPosition: '0-0' } },
      E112_GrainThief: { extraData: { selectedPositions: ['0-0'] } },
    }
    session.loadState(state)

    const reapResult = reap(state, player)

    expect(player.resources.grain).toBe(3)
    expect(player.fields[0]!.stacks).toEqual([])
    expect(reapResult.reapSummary.harvestedCrops).toEqual([
      { row: 0, col: 0, crop: 'grain', amount: 3, sources: ['base', CARD_ID] },
    ])

    const endFlow = E112_GrainThief_impl.effect.onEndHarvestFieldPhase!(state, player)

    expect(endFlow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: 'E112_GrainThief',
          params: { kind: 'set-extra-data', key: 'selectedPositions', value: undefined },
        },
      ],
    })
  })

  it('records full-reap harvestedCrops per crop type and merges repeated crop entries', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [
        { kind: 'grain', remaining: 1 },
        { kind: 'vegetable', remaining: 1 },
        { kind: 'grain', remaining: 2 },
      ]),
    ]
    player.resources.grain = 0
    player.resources.vegetable = 0
    player.cardStates = {
      [CARD_ID]: { extraData: { fullReapPosition: '0-0' } },
    }
    session.loadState(state)

    const reapResult = reap(state, player)

    expect(player.resources.grain).toBe(3)
    expect(player.resources.vegetable).toBe(1)
    expect(player.fields[0]!.stacks).toEqual([])
    expect(reapResult.reapSummary.harvestedCrops).toEqual([
      { row: 0, col: 0, crop: 'grain', amount: 3, sources: ['base', CARD_ID] },
      { row: 0, col: 0, crop: 'vegetable', amount: 1, sources: ['base', CARD_ID] },
    ])
  })

  it('keeps fullReapPosition after field phase reap and clears it with EndHarvest cleanup', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [{ kind: 'grain', remaining: 2 }]),
    ]
    player.cardStates = {
      [CARD_ID]: { extraData: { fullReapPosition: '0-0' } },
    }
    session.loadState(state)

    reap(state, player)

    expect(player.cardStates[CARD_ID]?.extraData?.fullReapPosition).toBe('0-0')

    const cleanup = getCardEffect(CARD_ID)!.onEndHarvest!(state, player) as Extract<ActionFlow, { type: 'leaf' }>
    const result = specialEffectAction.execute({
      state,
      player,
      params: cleanup.params,
      sourceCard: CARD_ID,
      space: { id: 'special-effect' } as ActionSpace,
    } as Parameters<typeof specialEffectAction.execute>[0])

    expect(result.type).toBe('ok')
    expect(player.cardStates[CARD_ID]?.extraData?.fullReapPosition).toBeUndefined()
  })
})
