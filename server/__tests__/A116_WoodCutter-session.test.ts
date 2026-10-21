import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { ActionDetailParts } from '../../shared/contract/protocol/game'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A116_WoodCutter'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit14Spaces from './_helpers/audit/ae-negative-14-spaces'
import { createWorkSession } from './_helpers/session-fixtures'
import { expectCardEffectBeforeHostCollect } from './_helpers/space-use-order'
import type { SessionResponse } from '../game/authoritative-session'

describe('A116_WoodCutter session', () => {
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A116_WoodCutter')
    setWorkersAtHome(state, player, 2)
    player.resources.wood = 0

    state.players[1]!.workersAvailable = 2
    state.players.slice(2).forEach((extraPlayer) => setWorkersAtHome(state, extraPlayer, 0))

    // Ensure wood spaces have accumulated resources
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 3
    const copse = state.actionSpaces.find((s) => s.id === 'copse')
    if (copse) copse.resources.wood = 2

    session.loadState(state)
    session.devPlayCard(0, 'A116_WoodCutter')
    return session
  }

  it('gains 1 extra wood when using forest', () => {
    const session = setup()

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 3 accumulated wood + 1 bonus from WoodCutter = 4
    expect(after.players[0]!.resources.wood).toBe(3 + 1)
    const actionDetail = after.log.find((entry) => entry.key === 'log.actionDetail')!
    const detailParts = actionDetail.params?.detailParts as ActionDetailParts | undefined
    expect(detailParts?.gains?.wood).toBe(3)
  })

  it('gains 1 extra wood when using copse', () => {
    const session = setup()

    const resp = session.takeAction(0, 'copse')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 2 accumulated wood + 1 bonus from WoodCutter = 3
    expect(after.players[0]!.resources.wood).toBe(2 + 1)
  })

  it.each(['copse-56', 'grove-56'])('gains 1 extra wood when using %s', (spaceId) => {
    const session = new GameSession(undefined, undefined, { playerCount: 5 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A116_WoodCutter')
    setWorkersAtHome(state, player, 2)
    player.resources.wood = 0

    const space = state.actionSpaces.find((s) => s.id === spaceId)
    expect(space).toBeDefined()
    space!.resources.wood = 2

    session.loadState(state)
    session.devPlayCard(0, 'A116_WoodCutter')

    const resp = session.takeAction(0, spaceId)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(3)
  })

  it('does not trigger on non-wood spaces', () => {
    const session = setup()

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.wood).toBe(0)
  })

  it('does not trigger for opponent using wood space', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)

    const resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner should not get bonus wood — scope is 'player' only
    expect(after.players[0]!.resources.wood).toBe(0)
    // Opponent gets 3 accumulated wood but no bonus
    expect(after.players[1]!.resources.wood).toBe(3)
  })
})

describe('ae-negative-14-spaces', () => {
  const { CUTTER, sessions, save, ok, setup, turn } = audit14Spaces
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A116 N1 empty Forest rejects while three and six wood piles add exactly one owner wood',()=>{for(const amount of[0,3,6]){const s=setup(CUTTER,state=>state.actionSpaces.find(a=>a.id==='forest')!.resources.wood=amount);const r=amount===0?assertEmptyAccumulationRejected(s,0,'forest'):turn(s,0,'forest');assert.equal(r.state.players[0]!.resources.wood,amount===0?0:amount+1);assert.equal(r.state.actionSpaces.find(a=>a.id==='forest')!.resources.wood,0);save(`A116-N1-${amount}`,r)}})
  it('A116 N2 nonwood accumulation DayLaborer hand and opponent give no additional wood',()=>{for(const[space,played]of[['clay-pit',true],['day-laborer',true],['forest',false]] as const){const s=setup(CUTTER,undefined,played);const r=turn(s,0,space);assert.equal(r.state.players[0]!.resources.wood,space==='forest'?3:0);save(`A116-N2-${space}`,r)}const s=setup(CUTTER);turn(s,0,'grain-seeds');const r=turn(s,1,'forest');assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[1]!.resources.wood,3);save('A116-N2-opponent',r)})
  it('A116 N3 occupied source and invalid actor cannot gain and undo restores source once',()=>{const s=setup(CUTTER);const first=turn(s,0,'forest');assertRejectedUnchanged(s,()=>s.takeAction(0,'forest'));const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,0);assert.equal(undone.state.actionSpaces.find(a=>a.id==='forest')!.resources.wood,3);assertRejectedUnchanged(s,()=>s.takeAction(1,'forest'));const retry=turn(s,0,'forest');assert.equal(retry.state.players[0]!.resources.wood,4);save('A116-N3',{first,undone,retry})})
})

describe('A116 before timing (#1321)', () => {
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  const BASKET = 'A056_Basket'
  const options = (r: SessionResponse) => r.interaction.stateId === 'wait' ? r.interaction.request.options ?? [] : []
  const forestWithBasket = (cutter: boolean) => {
    const session = createWorkSession({ seed: 1321, configure: state => {
      for (const player of state.players) {
        player.minorPlayed = []
        player.occupationPlayed = []
        for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
        setWorkersAtHome(state, player, 2)
      }
      for (const space of state.actionSpaces) space.takenBy = []
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 1
      const owner = state.players[0]!
      owner.occupationPlayed = cutter ? ['A116_WoodCutter'] : []
      owner.minorPlayed = [BASKET]
    } })
    sessions.push(session)
    return session
  }

  it('adds its wood before the Forest collects, so the immediate Basket exchange can use both woods', () => {
    const session = forestWithBasket(true)
    let r = session.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 2, food: 0 })
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard, JSON.stringify(r.interaction)).toBe(BASKET)
    const exchange = options(r).find(o => o.value !== '__skip__' && !o.disabled)
    expect(exchange).toBeDefined()
    r = session.resolveChoice(0, exchange!.value)
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 0, food: 3 })
    expect(r.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(2)
    expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('confirm-next-player')
    expectCardEffectBeforeHostCollect(r, { cardId: 'A116_WoodCutter', spaceId: 'forest', type: 'resource.moved' })
    const host = r.state.events.findIndex(e => e.type === 'resource.moved' && e.reason === 'collect' && e.from.kind === 'actionSpace')
    expect(host).toBeLessThan(r.state.events.findIndex(e => e.type === 'resource.moved' && e.sourceCardId === BASKET))
    expect(r.state.log.filter(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === 'A116_WoodCutter')).toHaveLength(1)
  })

  it('without Wood Cutter the single collected wood cannot pay the Basket exchange', () => {
    const session = forestWithBasket(false)
    const r = session.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(options(r).some(o => o.sourceCard === BASKET && o.value !== '__skip__' && !o.disabled)).toBe(false)
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(r.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(0)
  })
})
