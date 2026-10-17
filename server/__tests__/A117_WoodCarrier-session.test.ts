import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A117_WoodCarrier'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext } from './_helpers/negative-rule-audit'
import * as audit14Immediate from './_helpers/audit/ae-negative-14-immediate'

const CARD_ID = 'A117_WoodCarrier'

const setup = ({
  minors = [],
  majors = [],
  occupations = [],
}: {
  minors?: string[]
  majors?: string[]
  occupations?: string[]
} = {}) => {
  const session = new GameSession(117, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [CARD_ID]
  player.occupationPlayed = occupations
  player.minorPlayed = minors
  player.improvements = majors
  player.resources.food = 2
  player.resources.wood = 0
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

describe('A117 Wood Carrier parity', () => {
  it('A117 S1: playing Wood Carrier with no improvements grants no wood', () => {
    const response = playOccupation(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A117 S2: two minor improvements grant two wood when Wood Carrier is played', () => {
    const response = playOccupation(setup({ minors: ['A037_Bucksaw', 'A050_MilkJug'] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('A117 S3: one major and two minor improvements grant three wood', () => {
    const response = playOccupation(setup({
      minors: ['A037_Bucksaw', 'A050_MilkJug'],
      majors: ['Major_Fireplace1'],
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
  })

  it('A117 S4: an existing occupation does not increase Wood Carrier wood', () => {
    const response = playOccupation(setup({ occupations: ['A103_Portmonger'] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })
})

describe('ae-negative-14-immediate', () => {
  const { CARRIER, sessions, save, ok, setup, play } = audit14Immediate
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A117 N1 real Lessons purchase counts zero one and mixed own improvements exactly',()=>{for(const[minors,majors,expected]of [[[],[],0],[['A030_BakingSheet'],[],1],[['A030_BakingSheet','A016_RammedClay'],['Major_Fireplace1'],3]] as const){const s=setup(CARRIER,state=>{state.players[0]!.minorPlayed=[...minors];state.players[0]!.improvements=[...majors]});const r=play(s,CARRIER);assert.equal(r.state.players[0]!.resources.wood,expected);assert.equal(r.state.players[0]!.resources.food,40);save(`A117-N1-${expected}`,r)}})
  it('A117 N2 own hand opponent improvements and occupations do not count',()=>{const s=setup(CARRIER,state=>{state.players[0]!.minorHand=['A030_BakingSheet'];state.players[0]!.occupationPlayed=['A110_Roughcaster'];state.players[1]!.minorPlayed=['A016_RammedClay'];state.players[1]!.improvements=['Major_Fireplace1']});const r=play(s,CARRIER);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,39);assert.equal(r.state.players[1]!.resources.wood,0);save('A117-N2',r)})
  it('A117 N3 later improvement and stale occupation choice cannot repeat onBuy reward',()=>{const s=setup(CARRIER,state=>{state.players[0]!.minorPlayed=['A016_RammedClay'];state.players[0]!.minorHand=['A030_BakingSheet','A043_FarmyardManure'];state.players[0]!.houseAnimals = { '2-0': 'sheep' }});const first=play(s,CARRIER);assert.equal(first.state.players[0]!.resources.wood,1);assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARRIER));confirmNext(s,first);confirmNext(s,ok(s.takeAction(1,'grain-seeds')));let r=ok(s.takeAction(0,'meeting-place'));assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');const action=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));assert.ok(action);r=ok(s.resolveChoice(0,action.value));if(!r.state.players[0]!.minorPlayed.includes('A030_BakingSheet'))r=ok(s.resolveChoice(0,'A030_BakingSheet'));assert.equal(r.state.players[0]!.resources.wood,1);save('A117-N3',{first,r})})
  it('A117 N4 zero food cannot pay later Lessons and undo restores reward before one retry',()=>{const poor=setup(CARRIER,state=>{state.players[0]!.occupationPlayed=['A110_Roughcaster'];state.players[0]!.resources.food=0;state.players[0]!.minorPlayed=['A016_RammedClay']});assertRejectedUnchanged(poor,()=>poor.takeAction(0,'lessons'));const s=setup(CARRIER,state=>state.players[0]!.minorPlayed=['A016_RammedClay']);const first=play(s,CARRIER);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,0);assert(undone.state.players[0]!.occupationHand.includes(CARRIER));const retry=play(s,CARRIER);assert.equal(retry.state.players[0]!.resources.wood,1);save('A117-N4',{first,undone,retry})})
})
