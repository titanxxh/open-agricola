import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E073_Scythe'
import '../../shared/cards/E/E112_GrainThief'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { ActionFlow, ActionSpace, Field } from '../../shared/contract/types'
import { getAdHocAction } from '../../shared/actions/helpers/ad-hoc-action-registry'
import { reap } from '../../shared/actions/effects/reap'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import '../../shared/cards/D/D075_WoodField'

const CARD_ID = 'E073_Scythe'

const makeField = (
  row: number,
  col: number,
  stacks: Array<{ kind: 'grain' | 'vegetable'; remaining: number }>,
): Field => ({ row, col, stacks })

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setupSession = () => {
  const session = createWorkSession({ seed: 42 })
  sessions.push(session)
  const state = session.getState().state
  state.round = 4
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  return { session, state }
}

describe('E073_Scythe session — token model + reap full stack', () => {
  it('full-reaps every occupied slot of one Card Field', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID, 'D075_WoodField')
    player.cardStates.D075_WoodField = {
      extraData: {
        cardFieldStacks: [
          { crop: 'wood', remaining: 2 },
          { crop: 'wood', remaining: 2 },
        ],
      },
    }
    session.loadState(state)

    const flow = getCardEffect(CARD_ID)!.onStartHarvestFieldPhase!(state, player)
    expect(flow).toMatchObject({
      type: 'xor',
      children: [{
        actionId: 'card_E073_Scythe_harvest-field',
        sourceCard: CARD_ID,
        params: { fieldId: 'card:D075_WoodField' },
      }],
    })
    const action = getAdHocAction('card_E073_Scythe_harvest-field')!
    expect(action.execute({
      state,
      player,
      params: { fieldId: 'card:D075_WoodField' },
      sourceCard: CARD_ID,
    } as Parameters<typeof action.execute>[0]).type).toBe('ok')

    const result = reap(state, player)

    expect(player.resources.wood).toBe(4)
    expect(player.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([null, null])
    expect(result.reapSummary.harvestedPositions).toEqual([{ row: -1, col: 4075 }])
    expect(result.reapSummary.harvestCountApplications).toEqual([
      expect.objectContaining({ row: -1, col: 4075, crop: 'wood', count: 2, scope: 'field' }),
      expect.objectContaining({ row: -1, col: 4076, crop: 'wood', count: 2, scope: 'field' }),
    ])
  })

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
    expect((xor.children[0] as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ fieldId: 'farmyard:0:1' })
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
    expect(firstChild.params).toEqual({ fieldId: 'farmyard:0:0' })

    const adHoc = getAdHocAction('card_E073_Scythe_harvest-field')!
    const result = adHoc.execute({
      state,
      player,
      params: { fieldId: 'farmyard:0:0' },
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
      params: { fieldId: 'farmyard:0:0' },
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
      params: { fieldId: 'farmyard:0:0' },
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
      params: { fieldId: 'farmyard:0:0' },
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

  it('E73 full reap overrides E112 on the same mixed field through the real harvest without a supply grain reward', () => {
    const session = createWorkSession({ seed: 73112, configure: state => {
      state.round = 4
      state.players.forEach(player => { player.resources.food = 30; markAllWorkersUsed(state, player) })
      const player = state.players[0]!
      player.minorPlayed = [CARD_ID]
      player.occupationPlayed = ['E112_GrainThief']
      player.resources.grain = 0
      player.resources.vegetable = 0
      player.fields = [makeField(0, 0, [{ kind: 'vegetable', remaining: 1 }, { kind: 'grain', remaining: 3 }])]
    } })
    sessions.push(session)
    let response = session.performRoundEnd()
    const selectedSources = new Set<string>()
    for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
      const interaction = response.interaction
      if (interaction.request.kind === 'select-trigger') {
        const option = ['E112_GrainThief', CARD_ID].map(card => interaction.request.options?.find(candidate => candidate.value === card && !candidate.disabled)).find(candidate => candidate !== undefined)
        expect(option, JSON.stringify(interaction)).toBeDefined()
        selectedSources.add(option!.value)
        response = session.resolveChoice(interaction.playerIndex, option!.value)
        expect(response.ok, response.error).toBe(true)
        continue
      }
      expect([CARD_ID, 'E112_GrainThief'], JSON.stringify(interaction)).toContain(interaction.sourceCard)
      if (interaction.sourceCard) selectedSources.add(interaction.sourceCard)
      if (interaction.request.selection?.kind === 'farm-position') {
        response = session.commitSelectionChoice(interaction.playerIndex, { positions: [{ row: 0, col: 0 }] })
      } else {
        const use = interaction.request.options?.find(option => option.value !== '__skip__')
        expect(use, JSON.stringify(interaction)).toBeDefined()
        response = session.resolveChoice(interaction.playerIndex, use!.value)
      }
      expect(response.ok, response.error).toBe(true)
    }
    expect(selectedSources).toEqual(new Set([CARD_ID, 'E112_GrainThief']))
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 3, vegetable: 1 })
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(response.state.players[0]!.cardStates.E112_GrainThief?.extraData?.selectedPositions).toBeUndefined()
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.fullReapPosition).toBeUndefined()
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'E112_GrainThief' && (event.resources.grain ?? 0) > 0)).toHaveLength(0)
    expect(response.scores).toHaveLength(2)
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
