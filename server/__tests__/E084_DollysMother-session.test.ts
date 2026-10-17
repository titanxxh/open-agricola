import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/E/E084_DollysMother'
import '../../shared/cards/A/A084_Silage'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit43Harvest from './_helpers/audit/ae-negative-43-harvest'

const CARD_ID = 'E084_DollysMother'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, sheep = 1, boar = 0, cattle = 0, pasture = false, round = 5,
}: {
  played?: boolean
  sheep?: number
  boar?: number
  cattle?: number
  pasture?: boolean
  round?: number
} = {}) => {
  const session = new GameSession(7084, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: index === 0 ? sheep : 0,
      boar: index === 0 ? boar : 0,
      cattle: index === 0 ? cattle : 0,
      begging: 0,
    }
    player.pastures = []
    player.stableTiles = []
    player.stableAnimals = {}
    player.houseAnimals = {};
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
  player.minorPlayed = played ? [CARD_ID] : []
  if (pasture) {
    const animalType = sheep > 0 ? 'sheep' : boar > 0 ? 'boar' : cattle > 0 ? 'cattle' : null
    const animalCount = sheep + boar + cattle
    player.pastures = [{
      id: 'dolly-pasture',
      size: 1,
      tiles: [{ row: 0, col: 1 }],
      stables: 1,
      animalType,
      animalCount,
    }]
  } else if (sheep + boar + cattle === 1) {
    const animalType = sheep > 0 ? 'sheep' : boar > 0 ? 'boar' : 'cattle'
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, animalType]));
  }
  const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
  if (sheepMarket) sheepMarket.resources.sheep = 1
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const finishRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return autoAdvanceRoundEnd(session)
}

describe("E084 Dolly's Mother parity", () => {
  it("E084 S1: one sheep allows Dolly's Mother to be played for no resources", () => {
    const session = setup()
    const food = session.state.players[0]!.resources.food

    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(food)
  })

  it("E084 S2: without a sheep Dolly's Mother is unavailable", () => {
    const response = enterMinor(setup({ sheep: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it("E084 S3: Dolly's Mother holds one sheep beside an occupied house", () => {
    const session = setup({ played: true, sheep: 0, boar: 1, round: 14 })

    const pending = session.takeAction(0, 'sheep-market')

    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'animal-reorg') return
    const cardZone = pending.interaction.request.zones.find((zone) => zone.id === `card:${CARD_ID}`)
    expect(cardZone).toMatchObject({ capacity: 1, allowedAnimalType: 'sheep' })
    const house = pending.interaction.request.zones.find((zone) => zone.zoneType === 'house')
    expect(house).toBeDefined()
    const response = session.resolveChoice(0, 'confirm', {
      zones: [
        { ...house!, animalType: 'boar', animalCount: 1 },
        { ...cardZone!, animalType: 'sheep', animalCount: 1 },
      ],
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts).toEqual({ sheep: 1 })
  })

  it("E084 S4: one sheep breeds one newborn during a harvest", () => {
    const response = finishRound(setup({ played: true, pasture: true, round: 4 }))

    expect(response.state.players[0]!.resources.sheep).toBe(2)
  })

  it("E084 S5: without Dolly's Mother one sheep does not breed during a harvest", () => {
    const session = setup({ played: true, pasture: true, round: 4 })
    session.state.players[0]!.minorPlayed = []
    session.loadState(session.state)

    const response = finishRound(session)

    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })

  it("E084 S6: Dolly's Mother does not lower the breeding threshold for boar or cattle", () => {
    for (const type of ['boar', 'cattle'] as const) {
      const response = finishRound(setup({
        played: true, sheep: 0, [type]: 1, pasture: true, round: 4,
      }))

      expect(response.state.players[0]!.resources[type], type).toBe(1)
    }
  })

  it("E084 S7: OA does not let non-harvest Silage breed from one sheep", () => {
    const session = setup({ played: true, pasture: true, round: 5 })
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('A084_Silage')
    player.resources.grain = 1
    player.fields = [
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
    ]
    state.players.forEach((entry) => markAllWorkersUsed(state, entry))
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.interaction.stateId === 'wait'
      ? JSON.stringify(response.interaction.request).includes('A084_Silage')
      : false).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, grain: 1 })
  })

  it("E084 S8: Dolly's Mother contributes its printed one point at scoring", () => {
    const response = setup({ played: true }).getState()

    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })
})

describe('ae-negative-43-harvest', () => {
  const { RYE, DOLLY, sessions, save, ok, make, menu, purchase, yard, nextRound } = audit43Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E084 N1 sheep prerequisite permits real one point purchase and no sheep refuses before legal alternative',()=>{const s=make(DOLLY,false,state=>yard(state)),a=purchase(s,DOLLY);assert.equal(a.r.state.players[0]!.resources.sheep,1);assert.equal(a.r.scores![0]!.categories.find(c=>c.key==='cards')?.entries.find(e=>'cardId'in e&&e.cardId===DOLLY)?.score,1);const t=make(DOLLY,false),pending=menu(t),bad=assertRejectedUnchanged(t,()=>t.resolveChoice(0,DOLLY)),legal=ok(t.resolveChoice(0,'B004_WoodPile'));assert.ok(legal.state.players[0]!.minorHand.includes(DOLLY));save('E084-N1',{a,pending,bad,legal})})
  it('E084 N2 actual animal reorganization rejects two sheep or boar on one sheep card before legal card and room housing',()=>{for(const type of['sheep','boar'] as const){const s=make(DOLLY,true,state=>{yard(state,1);state.actionSpaces.find(a=>a.id===(type==='sheep'?'sheep-market':'pig-market'))!.resources[type]=1}),pending=ok(s.takeAction(0,type==='sheep'?'sheep-market':'pig-market'));assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='animal-reorg');const card=pending.interaction.request.zones.find(z=>z.cardId===DOLLY),house=pending.interaction.request.zones.find(z=>z.zoneType==='house');assert.ok(card&&house);const bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'confirm',{zones:[{...card,animalType:type,animalCount:type==='sheep'?2:1}]})),r=ok(s.resolveChoice(0,'confirm',{zones:[{...card,animalType:'sheep',animalCount:1},{...house,animalType:type,animalCount:1}]}));assert.equal(r.state.players[0]!.resources.sheep,type==='sheep'?2:1);assert.equal(r.state.players[0]!.resources.boar,type==='boar'?1:0);save(`E084-N2-${type}`,{pending,bad,r})}})
  it('E084 N3 natural harvest breeds from one sheep only while no sheep remains zero and owner does not affect opponent',()=>{for(const sheep of[0,1]){const s=make(DOLLY,true,state=>yard(state,sheep)),r=nextRound(s,8,false);assert.equal(r.state.players[0]!.resources.sheep,sheep?2:0);assert.equal(r.state.players[1]!.resources.sheep,0);save(`E084-N3-${sheep}`,r)}})
  it('E084 N4 one sheep cannot breed from Perennial Rye outside the harvest breeding phase',()=>{const s=make(DOLLY,true,state=>{state.round=2;yard(state);state.players[0]!.minorPlayed.push(RYE);state.players[0]!.resources.grain=1}),bad=assertRejectedUnchanged(s,()=>s.takeAnytimeAction(0,'C84-perennial-rye-anytime')),legal=ok(s.takeAction(0,'reed-bank'));assert.equal(legal.state.players[0]!.resources.sheep,1);assert.equal(legal.state.players[0]!.resources.grain,1);save('E084-N4',{bad,legal})})
})
