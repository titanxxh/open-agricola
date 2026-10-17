import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/B/B067_HandTruck'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit21Handtruck from './_helpers/audit/ae-negative-21-handtruck'

const CARD_ID = 'B067_HandTruck'

const setupHandTruckBakeSession = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.resources.grain = 1
  player.improvements.push('Major_Fireplace1')
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.takenBy = [{ playerId: player.id, workerId: '1' }]
  session.loadState(state)
  return { session, player }
}

describe('B067_HandTruck session', () => {
  it('forces the grain gain when it is required to make baking doable', () => {
    const { session } = setupHandTruckBakeSession()
    session.state.players[0]!.resources.grain = 0
    session.state.players[0]!.resources.food = 0
    session.loadState(session.state)

    const resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).not.toBe(CARD_ID)
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
  })

  it('accepting optional grain continues to the mandatory bake prompt', () => {
    const { session } = setupHandTruckBakeSession()

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toMatch(/^ui\.interactionBakeBread/)
    expect(resp.interaction.sourceCard).not.toBe(CARD_ID)
  })

  it('skipping optional grain still continues to the mandatory bake prompt', () => {
    const { session } = setupHandTruckBakeSession()
    session.getState().state.players[0]!.resources.grain = 2

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toMatch(/^ui\.interactionBakeBread/)
    expect(resp.interaction.sourceCard).not.toBe(CARD_ID)
  })

  it('does not offer grain before bake-bread without a bake provider', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 0
    player.improvements = []
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    forest.takenBy = [{ playerId: player.id, workerId: '1' }]
    session.loadState(state)

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
    const resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('ae-negative-21-handtruck', () => {
  const { CARD, sessions, save, ok, setup, finish, menu, buy, loaded, placements, bake } = audit21Handtruck
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B067 N1 actual one wood purchase gives no immediate grain and cost shortfall or undo cannot duplicate card',()=>{const s=setup(CARD,8,state=>state.players[0]!.resources.wood=1),{pending,r}=buy(s,CARD);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.grain,0);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,1);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));const poor=setup(CARD),denied=menu(poor);assertRejectedUnchanged(poor,()=>poor.resolveChoice(0,CARD));const legal=finish(poor,ok(poor.resolveChoice(0,'B004_WoodPile')));assert.equal(legal.state.players[0]!.resources.grain,0);save('B067-N1',{pending,r,undone,denied,legal})})
  it('B067 N2 genuine one or two owner accumulation placements add exactly that many grain before actual baking',()=>{for(const n of[1,2]){const s=loaded(),before=placements(s,n),{pending,r}=bake(s);assert.equal(r.state.players[0]!.resources.grain,n);assert.equal(r.state.players[0]!.resources.food,before.state.players[0]!.resources.food+2);assert.equal(r.state.players[1]!.resources.grain,0);save(`B067-N2-${n}`,{before,pending,r})}})
  it('B067 N3 zero initial grain becomes a mandatory real bake while decline with seed and hand card gain no extra grain',()=>{const s=loaded(0),before=placements(s,1),forced=bake(s);assert.equal(forced.r.state.players[0]!.resources.grain,0);assert.equal(forced.r.state.players[0]!.resources.food,before.state.players[0]!.resources.food+2);for(const mode of['decline','hand']){const t=loaded(1,mode!=='hand'),b=placements(t,1),result=bake(t,mode!=='decline');assert.equal(result.r.state.players[0]!.resources.grain,0);assert.equal(result.r.state.players[0]!.resources.food,b.state.players[0]!.resources.food+2);save(`B067-N3-${mode}`,{b,...result})}save('B067-N3',{before,...forced})})
  it('B067 N4 no oven rejects and whole bake undo restores seed food and true accumulation occupants',()=>{const poor=loaded(0,true,false),beforePoor=placements(poor,1);assertRejectedUnchanged(poor,()=>poor.takeAction(0,'grain-utilization'));assert.equal(poor.getState().state.players[0]!.resources.grain,0);const s=loaded(),before=placements(s,2),{pending,r}=bake(s),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.grain,1);assert.equal(undone.state.players[0]!.resources.food,before.state.players[0]!.resources.food);assert.deepEqual(undone.state.actionSpaces.find(a=>a.id==='forest')!.takenBy,before.state.actionSpaces.find(a=>a.id==='forest')!.takenBy);const retry=bake(s).r;assert.equal(retry.state.players[0]!.resources.grain,2);save('B067-N4',{beforePoor,before,pending,r,undone,retry})})
})
