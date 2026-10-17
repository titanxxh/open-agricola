import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import assert from 'node:assert/strict'
import * as audit19Immediate from './_helpers/audit/ae-negative-19-immediate'

const CARD_ID = 'B037_Grange'

describe('B037 Grange prerequisites', () => {
  it.each([
    { fields: 6, missing: '', cardField: false, reserveOnly: false, allowed: true },
    { fields: 5, missing: '', cardField: true, reserveOnly: false, allowed: false },
    { fields: 6, missing: 'sheep', cardField: false, reserveOnly: false, allowed: false },
    { fields: 6, missing: 'boar', cardField: false, reserveOnly: false, allowed: false },
    { fields: 6, missing: 'cattle', cardField: false, reserveOnly: false, allowed: false },
    { fields: 6, missing: 'cattle', cardField: false, reserveOnly: true, allowed: false },
  ])('requires six farmyard fields and placed animals: $fields/$missing/$reserveOnly', (scenario) => {
    const session = new GameSession(8037, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.round = 5
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
    }
    const owner = state.players[0]!
    owner.minorHand = [CARD_ID]
    owner.minorPlayed = scenario.cardField ? ['B068_Beanfield'] : []
    owner.resources.food = 0
    owner.fields = Array.from({ length: scenario.fields }, (_, index) => ({
      row: Math.floor(index / 3), col: index % 3 + 2, stacks: [],
    }))
    owner.pastures = (['sheep', 'boar', 'cattle'] as const).map((animal, index) => ({
      id: `grange-${animal}`, size: 1, tiles: [{ row: index, col: 1 }], stables: 0,
      animalType: animal === scenario.missing ? null : animal,
      animalCount: animal === scenario.missing ? 0 : 1,
    }))
    for (const animal of ['sheep', 'boar', 'cattle'] as const) {
      owner.resources[animal] = animal !== scenario.missing || scenario.reserveOnly ? 1 : 0
    }
    session.loadState(state)

    let response = session.takeAction(0, 'major-improvement')
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait'; step++) {
      const option = response.interaction.request.options?.find((candidate) =>
        candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-'))
      if (!option) break
      response = session.resolveChoice(0, option.value)
    }

    expect(response.state.players[0]!.minorPlayed.includes(CARD_ID)).toBe(scenario.allowed)
    expect(response.state.players[0]!.resources.food).toBe(scenario.allowed ? 1 : 0)
    if (scenario.allowed) {
      expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
        .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 3 }))
    } else {
      const before = JSON.stringify(response.state)
      const rejected = session.resolveChoice(0, CARD_ID)
      expect(rejected.ok).toBe(false)
      expect(JSON.stringify(rejected.state)).toBe(before)
    }
  })
})

describe('ae-negative-19-immediate', () => {
  const { GRANGE, sessions, save, ok, setup, buy, score, denied, farm } = audit19Immediate
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B037 N1 six own empty physical fields and all housed species grant one food and three printed points',()=>{const s=setup(GRANGE,state=>farm(state)),{pending,r}=buy(s,GRANGE);assert.equal(r.state.players[0]!.resources.food,21);assert.equal(r.state.players[0]!.fields.length,6);assert.equal(score(r,GRANGE),3);assert.equal(r.state.players[1]!.resources.food,20);save('B037-N1',{pending,r})})
  it('B037 N2 five physical fields or each missing housed species refuse without food or points',()=>{for(const[fields,missing]of[[5,''],[6,'sheep'],[6,'boar'],[6,'cattle']]as const){const s=setup(GRANGE,state=>farm(state,fields,missing)),{pending,r}=denied(s,GRANGE);assert.equal(r.state.players[0]!.resources.food,20);assert.equal(score(r,GRANGE),0);save(`B037-N2-${fields}-${missing}`,{pending,r})}})
  it('B037 N3 actual purchase undo restores food and three points before one legal retry',()=>{const s=setup(GRANGE,state=>farm(state)),r=buy(s,GRANGE).r,undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,20);assert.equal(score(undone,GRANGE),0);assert.ok(undone.state.players[0]!.minorHand.includes(GRANGE));const retry=buy(s,GRANGE).r;assert.equal(retry.state.players[0]!.resources.food,21);assert.equal(score(retry,GRANGE),3);save('B037-N3',{r,undone,retry})})
})
