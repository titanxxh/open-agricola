import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import assert from 'node:assert/strict'
import * as audit17AnimalPhases from './_helpers/audit/ae-negative-17-animal-phases'

const CARD_ID = 'A165_PigBreeder'
const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = (round: number, boar: number, capacity = true) => {
  const session = createWorkSession({ seed: 2165, configure: state => {
    state.round = round
    state.players.forEach(player => { player.resources.food = 60; markAllWorkersUsed(state, player) })
    const owner = state.players[0]!
    owner.occupationPlayed = [CARD_ID]
    owner.resources.boar = boar
    owner.pastures = capacity ? [{ id: 'boar-pasture', tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }], stables: 0, animalType: boar ? 'boar' : null, animalCount: Math.min(boar, 4) }] : []
    if (boar > 4) { owner.houseAnimals = Object.fromEntries(owner.roomTiles.slice(0, boar - 4).map(tile => [`${tile.row}-${tile.col}`, 'boar'])); }
    if (!capacity && boar) { owner.houseAnimals = Object.fromEntries(owner.roomTiles.slice(0, boar).map(tile => [`${tile.row}-${tile.col}`, 'boar'])); }
  } })
  expect(session.state.players).toHaveLength(2)
  sessions.push(session)
  return session
}

describe('Pig Breeder due breeding', () => {
  it('round twelve breeds only boar and keeps the card as source', () => {
    const response = setup(12, 2).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(3)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Missing animal arrangement')
    expect(response.interaction.playerIndex).toBe(0)
    expect(response.state.events.some(event => event.type === 'farm.animalBred' && event.sourceCardId === CARD_ID)).toBe(true)
    expect(response.scores).toBeDefined()
  })
  it.each([0, 1])('round twelve does not breed %i boar', count => {
    const response = setup(12, count).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(count)
    expect(response.state.events.some(event => event.type === 'farm.animalBred' && event.sourceCardId === CARD_ID)).toBe(false)
  })
  it('a full pasture does not receive an extra animal', () => {
    const response = setup(12, 5).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(5)
  })
  it('round ten has no extra breeding', () => {
    const response = setup(10, 2).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })
})

describe('ae-negative-17-animal-phases', () => {
  const { PIG, sessions, save, ok, setup, turn, finish, material, pastures, phaseSetup, end } = audit17AnimalPhases
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A165 N1 playing through actual Lessons immediately gains one pig and housing',()=>{const s=setup(PIG,{food:2},false);let pending=turn(s,0,'lessons');if(!pending.state.players[0]!.occupationPlayed.includes(PIG))pending=ok(s.resolveChoice(0,PIG));const r=finish(s,pending);assert.ok(r.state.players[0]!.occupationPlayed.includes(PIG));assert.equal(material(r).boar,1);assert.equal(material(r).sheep,0);save('A165-N1',{pending,r})})
  it('A165 N2 natural end of round twelve with capacity breeds exactly one extra pig',()=>{const s=phaseSetup(PIG,12,1,2,true,60,true);const {pending,r}=end(s);assert.equal(r.state.round,13);assert.equal(material(r).boar,3);assert.ok(r.state.events.some(e=>e.type==='farm.animalBred'&&e.sourceCardId===PIG));save('A165-N2',{pending,r})})
  it('A165 N3 wrong round single pig and unplayed hand cannot breed an extra pig',()=>{for(const[round,pigs,played]of[[10,2,true],[12,1,true],[12,2,false]]as const){const s=phaseSetup(PIG,round,1,pigs,played,60,true);const {r}=end(s);assert.equal(material(r).boar,pigs);save(`A165-N3-${round}-${pigs}-${played}`,r)}})
  it('A165 N4 full two pig pasture and other species house leave no extra pig capacity',()=>{const s=setup(PIG,{food:60},true,state=>{state.round=12;pastures(state,1,2,false);const p=state.players[0]!;p.resources.sheep=1;p.houseAnimals = { '2-0': 'sheep' }});const {r}=end(s);assert.equal(material(r).boar,2);assert.equal(material(r).sheep,1);save('A165-N4',r)})
})
