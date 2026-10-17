import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A042_ForestLakeHut'
import '../../shared/cards/A/A043_FarmyardManure'
import '../../shared/cards/A/A046_ClawKnife'
import '../../shared/cards/A/A089_StablePlanner'
import '../../shared/cards/A/A006_StorageBarn'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit07Triggers from './_helpers/audit/ae-negative-07-triggers'

const CARD_ID = 'A042_ForestLakeHut'
const FILLER = '__test_placeholder__'

describe('A042_ForestLakeHut session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const owner = state.players[0]!
    owner.minorPlayed.push(CARD_ID)

    // Stock the relevant spaces with some resources.
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishing) throw new Error('fishing space missing')
    fishing.resources.food = 2

    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (!forest) throw new Error('forest space missing')
    forest.resources.wood = 3

    session.loadState(state)
    return session
  }

  const setupPurchase = () => {
    const session = new GameSession(5042, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = [FILLER]
    player.resources.clay = 2
    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.minorHand = [FILLER]
    opponent.occupationHand = [FILLER]
    session.loadState(state)
    return session
  }

  it('A042 S1: paying two clay plays Forest Lake Hut', () => {
    const session = setupPurchase()
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId === 'wait') {
      const enter = response.interaction.request.options?.find((option) =>
        option.value.startsWith('action-improvement-'))
      if (enter) response = session.resolveChoice(0, enter.value)
    }
    if (!response.state.players[0]!.minorPlayed.includes(CARD_ID) && response.interaction.stateId === 'wait') {
      const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(card).toBeDefined()
      response = session.resolveChoice(0, card!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('A042 S2: using Fishing grants its food and one additional wood', () => {
    const session = setup()
    const state = session.getState().state
    const woodBefore = state.players[0]!.resources.wood ?? 0
    const foodBefore = state.players[0]!.resources.food ?? 0

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Fishing normal gain is 2 food; card adds +1 wood.
    expect(p.resources.wood).toBe(woodBefore + 1)
    expect(p.resources.food).toBe(foodBefore + 2)
  })

  it('A042 S3: using Forest grants its wood and one additional food', () => {
    const session = setup()
    const state = session.getState().state
    const foodBefore = state.players[0]!.resources.food ?? 0
    const woodBefore = state.players[0]!.resources.wood ?? 0

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Forest normal gain is 3 wood; card adds +1 food.
    expect(p.resources.wood).toBe(woodBefore + 3)
    expect(p.resources.food).toBe(foodBefore + 1)
  })

  it('A042 S4: using another action grants no Forest Lake Hut bonus', () => {
    const session = setup()
    const state = session.getState().state
    const woodBefore = state.players[0]!.resources.wood ?? 0

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // day-laborer gives food but the Forest Lake Hut must NOT add wood.
    expect(p.resources.wood).toBe(woodBefore)
  })

  it('does not trigger when card is not in play', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    // Card NOT played.
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishing) throw new Error('fishing space missing')
    fishing.resources.food = 2

    session.loadState(state)
    const woodBefore = state.players[0]!.resources.wood ?? 0

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.wood).toBe(woodBefore)
  })
})

describe('ae-negative-07-triggers', () => {
  const { HUT, sessions, setup, stock, ok, ready, turn, enter, offered, buy, printedPoint, hutReward } = audit07Triggers
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A042 N1 actual purchase pays two clay and earns one printed point', () => {
    const s=setup(HUT,{played:false,resources:{clay:2}});const r=buy(s,enter(s),HUT);assert.equal(r.state.players[0]!.resources.clay,0);printedPoint(r,HUT)
  })
  it('A042 N2 one clay cannot forge purchase before a legal free card retry', () => {
    const s=setup(HUT,{played:false,resources:{clay:1}});const r=enter(s);assert.equal(offered(r,HUT),false);assertRejectedUnchanged(s,()=>s.resolveChoice(0,HUT));const done=buy(s,r,'A054_Credit');assert.equal(done.state.players[0]!.resources.clay,1);assert.equal(done.state.players[0]!.minorHand.includes(HUT),true)
  })
  it('A042 N3 using stocked Forest gains exactly one additional food', () => {
    const s=setup(HUT,{resources:{food:0},configure(state){stock(state,'forest','wood',3)}});const r=turn(s,0,'forest');assert.deepEqual([r.state.players[0]!.resources.wood,r.state.players[0]!.resources.food],[3,1]);hutReward(r,{food:1})
  })
  it('A042 N4 using stocked Fishing gains exactly one additional wood', () => {
    const s=setup(HUT,{resources:{food:0},configure(state){stock(state,'fishing','food',2)}});const r=turn(s,0,'fishing');assert.deepEqual([r.state.players[0]!.resources.wood,r.state.players[0]!.resources.food],[1,2]);hutReward(r,{wood:1})
  })
  it('A042 N5 ordinary food or wood gains outside Fishing and Forest grant no bonus', () => {
    const a=setup(HUT,{resources:{food:0}});const day=turn(a,0,'day-laborer');assert.deepEqual([day.state.players[0]!.resources.wood,day.state.players[0]!.resources.food],[0,2]);const b=setup(HUT,{resources:{food:0},configure(state){state.players[0]!.minorHand.push('A006_StorageBarn');state.players[0]!.improvements.push('Major_Joinery');state.availableMajorImprovements=state.availableMajorImprovements.filter(id=>id!=='Major_Joinery')}});const offer=enter(b);assert.equal(offered(offer,'A006_StorageBarn'),true);const barn=ok(b.resolveChoice(0,'A006_StorageBarn'));assert.deepEqual([barn.state.players[0]!.resources.wood,barn.state.players[0]!.resources.food],[1,0]);assert.equal(barn.state.players[1]!.minorHand.includes('A006_StorageBarn'),true)
  })
  it('A042 N6 an opponent action and an owner card still in hand grant no owner bonus', () => {
    const a=setup(HUT,{resources:{food:0},configure(state){stock(state,'fishing','food',2)}});turn(a,0,'grain-seeds');const other=turn(a,1,'fishing');assert.equal(other.state.players[0]!.resources.wood,0);assert.equal(other.state.players[1]!.resources.wood,0);assert.equal(other.state.players[1]!.resources.food,22);const b=setup(HUT,{played:false,resources:{food:0},configure(state){stock(state,'fishing','food',2)}});const hand=turn(b,0,'fishing');assert.deepEqual([hand.state.players[0]!.resources.wood,hand.state.players[0]!.resources.food],[0,2])
  })
  it('A042 N7 empty Forest and Fishing reject atomically without a Fishing Hut bonus', () => {
    for (const space of ['forest', 'fishing']) {
      const s = setup(HUT, { resources: { food: 0 }, configure(state) { stock(state, space, space === 'forest' ? 'wood' : 'food', 0) } })
      const r = assertEmptyAccumulationRejected(s, 0, space)
      assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food], [0, 0])
      assert.equal(r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === HUT).length, 0)
    }
  })
  it('A042 N8 occupied Forest rejects a second use before a legal action retry', () => {
    const s=setup(HUT,{resources:{food:0},configure(state){stock(state,'forest','wood',3)}});turn(s,0,'forest');turn(s,1,'grain-seeds');ready(s,0);assertRejectedUnchanged(s,()=>s.takeAction(0,'forest'));const r=turn(s,0,'clay-pit');assert.deepEqual([r.state.players[0]!.resources.wood,r.state.players[0]!.resources.food],[3,1])
  })
})
