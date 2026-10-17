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
import assert from 'node:assert/strict'
import { assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit41Harvest from './_helpers/audit/ae-negative-41-harvest'

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
  it('triggers when a field has at least 2 crops total (single-stack ≥2)', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [{ kind: 'grain', remaining: 3 }]),
    ]
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))!
    const flow = session.withCtx(() => effect.onStartHarvestFieldPhase!(state, player))
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

    const effect = session.withCtx(() => getCardEffect(CARD_ID))!
    const flow = session.withCtx(() => effect.onStartHarvestFieldPhase!(state, player))
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

    const effect = session.withCtx(() => getCardEffect(CARD_ID))!
    const flow = session.withCtx(() => effect.onStartHarvestFieldPhase!(state, player))

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

    const effect = session.withCtx(() => getCardEffect(CARD_ID))!
    const flow = session.withCtx(() => effect.onStartHarvestFieldPhase!(state, player))
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

    const effect = session.withCtx(() => getCardEffect(CARD_ID))!
    const flow = session.withCtx(() => effect.onStartHarvestFieldPhase!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    const xor = flow as Extract<ActionFlow, { type: 'xor' }>
    expect(xor.children.length).toBe(2)

    const firstChild = xor.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(firstChild.actionId).toBe('card_E073_Scythe_harvest-field')
    expect(firstChild.params).toEqual({ fieldId: 'farmyard:0:0' })

    const adHoc = getAdHocAction('card_E073_Scythe_harvest-field')!
    const result = session.withCtx(() => adHoc.execute({
      state,
      player,
      params: { fieldId: 'farmyard:0:0' },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0]))

    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(0)
    expect(player.resources.vegetable).toBe(0)
    expect(player.fields[0]!.stacks).toEqual([
      { kind: 'grain', remaining: 1 },
      { kind: 'vegetable', remaining: 1 },
    ])

    const reapResult = session.withCtx(() => reap(state, player))

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
    const result = session.withCtx(() => adHoc.execute({
      state,
      player,
      params: { fieldId: 'farmyard:0:0' },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0]))

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
    const result = session.withCtx(() => adHoc.execute({
      state,
      player,
      params: { fieldId: 'farmyard:0:0' },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0]))

    expect(result.type).toBe('ok')

    session.withCtx(() => reap(state, player))

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
    session.withCtx(() => adHoc.execute({
      state,
      player,
      params: { fieldId: 'farmyard:0:0' },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0]))

    session.withCtx(() => reap(state, player))

    expect(player.resources.grain).toBe(1)
    expect(player.resources.vegetable).toBe(1)
    expect(player.fields[0]!.stacks.length).toBe(0)

    session.withCtx(() => reap(state, player))
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

    const reapResult = session.withCtx(() => reap(state, player))

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

    session.withCtx(() => reap(state, player))

    expect(player.cardStates[CARD_ID]?.extraData?.fullReapPosition).toBe('0-0')

    const cleanup = session.withCtx(() => session.withCtx(() => getCardEffect(CARD_ID))!.onEndHarvest!(state, player)) as Extract<ActionFlow, { type: 'leaf' }>
    const result = session.withCtx(() => specialEffectAction.execute({
      state,
      player,
      params: cleanup.params,
      sourceCard: CARD_ID,
      space: { id: 'special-effect' } as ActionSpace,
    } as Parameters<typeof specialEffectAction.execute>[0]))

    expect(result.type).toBe('ok')
    expect(player.cardStates[CARD_ID]?.extraData?.fullReapPosition).toBeUndefined()
  })
})

describe('ae-negative-41-harvest', () => {
  const { sessions, ok, save, setup, finish, select, next, field, cardSow, slots, vegetable, end, source } = audit41Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E073 N1 selecting exactly one grain field reaps its full stack while another vegetable field reaps normally',()=>{
   const s=setup('E073_Scythe',st=>{field(st,4);vegetable(st,2,3)},true,4),p=source(s,end(s),'E073_Scythe'),q=select(s,p,o=>o.value!=='__skip__'),r=finish(s,q);assert.equal(r.state.players[0]!.resources.grain,4);assert.equal(r.state.players[0]!.resources.vegetable,1);assert.equal(r.state.players[0]!.fields[0]!.stacks.length,0);assert.equal(r.state.players[0]!.fields[1]!.stacks[0]!.remaining,2);assert.equal(r.state.players[0]!.cardStates.E073_Scythe?.extraData?.fullReapPosition,undefined);save('E073-N1',{p,q,r})
  })
  it('E073 N2 decline held card and a single crop give only normal reap without an extra source',()=>{
   for(const mode of ['decline','hand','single']){const s=setup('E073_Scythe',st=>field(st,mode==='single'?1:4),mode!=='hand',4),r=finish(s,end(s),false,mode==='decline'?undefined:'E073_Scythe');assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.fields[0]!.stacks[0]?.remaining??0,mode==='single'?0:3);save(`E073-N2-${mode}`,r)}
  })
  it('E073 N3 Scythe cannot fully harvest wood planted through real Wood Field Sow',()=>{
   const s=setup('E073_Scythe',st=>{st.players[0]!.minorPlayed.push('D075_WoodField');st.players[0]!.occupationPlayed=['A100_Curator'];st.players[0]!.resources.wood=2},true,4),planted=finish(s,cardSow(s,ok(s.takeAction(0,'grain-utilization')),'wood',2));next(s,planted);next(s,finish(s,ok(s.takeAction(1,'reed-bank'))));next(s,finish(s,ok(s.takeAction(0,'clay-pit'))));let p=ok(s.takeAction(1,'forest'));if(p.interaction.stateId==='wait'&&p.interaction.request.kind==='confirm-next-player')p=next(s,p);const r=finish(s,p,true);save('E073-N3',{planted,p,r});assertRuleOutcome({wood:r.state.players[0]!.resources.wood,slots:slots(r,'D075_WoodField')},{wood:2,slots:[{crop:'wood',remaining:2},{crop:'wood',remaining:2}]})
  })
})
