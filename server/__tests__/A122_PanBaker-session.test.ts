import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A122_PanBaker'
import '../../shared/cards/B/B130_FullPeasant'
import '../../shared/cards/D/D066_PotterCeramics'
import '../../shared/cards/D/D075_WoodField'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit14Sow from './_helpers/audit/ae-negative-14-sow'

const CARD_ID = 'A122_PanBaker'

const setup = (options: {
  minorPlayed?: string[]
  improvements?: string[]
} = {}) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    grain: 0,
    food: 0,
  }
  player.occupationPlayed.push(CARD_ID)
  player.minorPlayed.push(...(options.minorPlayed ?? ['D066_PotterCeramics']))
  player.improvements = options.improvements ?? ['Major_Fireplace1']
  player.fields = []

  session.loadState(state)
  return session
}

describe('A122 Pan Baker session', () => {
  it('makes Grain Utilization available and supplies D66 before Bake Bread', () => {
    const session = setup()

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(true)

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 2, grain: 0 })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe('D066_PotterCeramics')

    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      resp = session.resolveChoice(0, 'Major_Fireplace1')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, grain: 0, food: 2 })
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toHaveLength(1)
  })

  it('makes Grain Utilization available and supplies wood before sowing D75', () => {
    const session = setup({ minorPlayed: ['D075_WoodField'], improvements: [] })

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(true)

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 2, grain: 0 })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.farm.farmType !== 'sow') {
      throw new Error('expected sow interaction')
    }

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: -1, col: 4075, crop: 'wood' }],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 2, grain: 0 })
    expect(readCardExtraData(resp.state.players[0]!, 'D075_WoodField', 'cardFieldStacks')).toEqual([
      { crop: 'wood', remaining: 3 },
      null,
    ])
  })

  it('gains resources once when B130 jumps to Grain Utilization', () => {
    const session = setup({ minorPlayed: ['D075_WoodField'], improvements: [] })
    const state = session.getState().state
    const player = state.players[0]!
    state.round = 5
    state.roundActionOrder[1] = 'fencing'
    player.occupationPlayed.push('B130_FullPeasant')
    player.resources.wood = 4
    player.resources.food = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe('B130_FullPeasant')

    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 2, food: 0 })
  })
})

describe('A122 Pan Baker parity', () => {
  const CARD_ID = 'A122_PanBaker'

  const WOOD_FIELD = 'D075_WoodField'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, actor = 0, woodField = false, ownerWood = 0, ownerClay = 0,
  } = {}) => {
    const session = new GameSession(6122, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = actor
    state.round = 14
    state.roundPhase = 'work'
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[9] = 'grain-utilization'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.fields = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.minorPlayed = woodField ? [WOOD_FIELD] : []
    owner.resources.wood = ownerWood
    owner.resources.clay = ownerClay
    if (actor === 1) {
      const opponent = state.players[1]!
      opponent.resources.grain = 1
      opponent.fields = [{ row: 0, col: 1, stacks: [] }]
    }
    session.loadState(state)
    return session
  }

  it('A122 S3: a non-Grain-Utilization action grants no wood or clay', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })

  it('A122 S4: an opponent using Grain Utilization grants the owner no resources', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'grain-utilization')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })
})

describe('ae-negative-14-sow', () => {
  const { PAN, FIELD, sessions, save, ok, setup, turn, sow } = audit14Sow
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A122 N1 real Grain Utilization adds two clay one wood before ordinary sow once',()=>{const s=setup(PAN);const pending=sow(s,turn(s,0,'grain-utilization'));assert.equal(pending.state.players[0]!.resources.clay,2);assert.equal(pending.state.players[0]!.resources.wood,1);const r=ok(s.commitSelectionChoice(0,{crops:[{row:0,col:1,crop:'grain'}]}));assert.equal(r.state.players[0]!.resources.clay,2);assert.equal(r.state.players[0]!.resources.wood,1);assert.equal(r.state.players[0]!.resources.grain,1);save('A122-N1',{pending,r})})
  it('A122 N2 incoming wood unlocks card field sow from empty reserve',()=>{const s=setup(PAN,state=>{const p=state.players[0]!;p.fields=[];p.resources.grain=0;p.minorPlayed=[FIELD]});assert.equal(s.getActionAvailability(0)['grain-utilization'],true);const pending=sow(s,turn(s,0,'grain-utilization'));assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{crops:[{row:-1,col:4075,crop:'grain'}]}));const r=ok(s.commitSelectionChoice(0,{crops:[{row:-1,col:4075,crop:'wood'}]}));assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.clay,2);assert.deepEqual(readCardExtraData(r.state.players[0]!,FIELD,'cardFieldStacks'),[{crop:'wood',remaining:3},null]);save('A122-N2',{pending,r})})
  it('A122 N3 hand nonmatching Cultivation and opponent use cannot reward owner',()=>{const basic=turn(setup(PAN),0,'day-laborer');assert.equal(basic.state.players[0]!.resources.clay,0);assert.equal(basic.state.players[0]!.resources.wood,0);const handS=setup(PAN,undefined,false);sow(handS,turn(handS,0,'grain-utilization'));const hand=ok(handS.commitSelectionChoice(0,{crops:[{row:0,col:1,crop:'grain'}]}));assert.equal(hand.state.players[0]!.resources.clay,0);assert.equal(hand.state.players[0]!.resources.wood,0);const s=setup(PAN,state=>{state.players[1]!.fields=[{row:0,col:1,stacks:[]}];state.players[1]!.resources.grain=1});turn(s,0,'day-laborer');const pending=turn(s,1,'grain-utilization');assert.equal(pending.state.players[0]!.resources.clay,0);assert.equal(pending.state.players[0]!.resources.wood,0);save('A122-N3',{basic,hand,pending})})
  it('A122 N4 incoming bonus attempt blocks with retained resources and explicit undo removes them',()=>{const s=setup(PAN,state=>{state.players[0]!.fields=[];state.players[0]!.resources.grain=0});assert.equal(s.getActionAvailability(0)['grain-utilization'],true);const attempted=turn(s,0,'grain-utilization');assert.ok(attempted.interaction.stateId==='wait'&&attempted.interaction.request.kind==='engine-blocked');assert.equal(attempted.state.players[0]!.resources.clay,2);assert.equal(attempted.state.players[0]!.resources.wood,1);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,0);assert.equal(undone.state.players[0]!.resources.wood,0);save('A122-N4',{attempted,undone,acceptedDifference:'ADR0015 permits a startable before chain, then blocks the mandatory unavailable body and retains effects until explicit undo'})})
  it('A122 N5 whole action undo removes bonus and crop stack before exactly one retry',()=>{const s=setup(PAN);sow(s,turn(s,0,'grain-utilization'));const first=ok(s.commitSelectionChoice(0,{crops:[{row:0,col:1,crop:'grain'}]}));const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,0);assert.equal(undone.state.players[0]!.resources.clay,0);assert.equal(undone.state.players[0]!.resources.grain,2);sow(s,turn(s,0,'grain-utilization'));const retry=ok(s.commitSelectionChoice(0,{crops:[{row:0,col:2,crop:'grain'}]}));assert.equal(retry.state.players[0]!.resources.wood,1);assert.equal(retry.state.players[0]!.resources.clay,2);save('A122-N5',{first,undone,retry})})
})
