import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E136_AnimalHusbandryWorker'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit52Competition from './_helpers/audit/ae-negative-52-competition'

const CARD_ID = 'E136_AnimalHusbandryWorker'
const FILLER = '__test_placeholder__'
const ONE_TILE_PASTURE = ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2']

const setup = ({
  played = false, round = 5, wood = 0, pastureCounts = [0, 0, 0],
} = {}) => {
  const session = new GameSession(7136, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, playerIndex) => {
    player.minorHand = [FILLER]
    player.occupationHand = playerIndex === 0 && !played ? [CARD_ID] : [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = playerIndex === 0 && played ? [CARD_ID] : []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: playerIndex === 0 ? wood : 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, 2)
    player.pastures = Array.from({ length: pastureCounts[playerIndex] ?? 0 }, (_, index) => ({
      id: `husbandry-${playerIndex}-${index}`,
      size: 1,
      tiles: [{ row: 2 - index, col: 1 + playerIndex }],
      stables: 0,
      animalType: null,
      animalCount: 0,
    }))
  })
  session.loadState(state)
  return session
}

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playAnimalHusbandryWorker = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = optionsOf(response).find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const declineFencing = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const skip = optionsOf(response).find((candidate) => candidate.value === '__skip__')
  expect(skip, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, skip!.value)
}

const declineFencingIfOffered = (session: GameSession, response: SessionResponse) =>
  optionsOf(response).some((candidate) => candidate.value === '__skip__')
    ? declineFencing(session, response)
    : response

const acceptFencing = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = optionsOf(response).find((candidate) => candidate.value !== '__skip__')
  expect(accept, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

const cardBonusScore = (response: SessionResponse, playerIndex: number) =>
  response.scores[playerIndex]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0

describe('E136 Animal Husbandry Worker parity', () => {
  it('E136 S1: playing as the first occupation grants wood by complete rounds remaining', () => {
    for (const [round, wood] of [[5, 4], [6, 3], [9, 2], [12, 0]] as const) {
      const session = setup({ round })
      let response = playAnimalHusbandryWorker(session)
      response = declineFencingIfOffered(session, response)

      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.wood, `round ${round}`).toBe(wood)
    }
  })

  it('E136 S2: an unaffordable granted fencing action is skipped instead of being shown for decline', () => {
    const session = setup({ round: 11 })

    const response = playAnimalHusbandryWorker(session)

    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('E136 S3: the granted fencing action builds a normal four-fence pasture at normal cost', () => {
    const session = setup({ round: 11, wood: 2 })

    let response = acceptFencing(session, playAnimalHusbandryWorker(session))
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(0, { edges: ONE_TILE_PASTURE })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
  })

  it('E136 S4: with fewer than three complete rounds left, playing grants no wood or fencing action', () => {
    const response = playAnimalHusbandryWorker(setup({ round: 12 }))

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : null)
      .not.toBe('farm-select')
    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('E136 S5: non-owners tied for the most pastures both score', () => {
    const response = setup({ played: true, pastureCounts: [1, 2, 2] }).getState()

    expect([0, 1, 2].map((index) => cardBonusScore(response, index))).toEqual([0, 2, 2])
  })

  it('E136 S6: the owner scores when alone with the most pastures', () => {
    const response = setup({ played: true, pastureCounts: [3, 1, 2] }).getState()

    expect([0, 1, 2].map((index) => cardBonusScore(response, index))).toEqual([2, 0, 0])
  })

  it('E136 S7: all players score when tied at zero pastures', () => {
    const response = setup({ played: true }).getState()

    expect([0, 1, 2].map((index) => cardBonusScore(response, index))).toEqual([2, 2, 2])
  })
})

describe('ae-negative-52-competition', () => {
  const { sessions, save, ok, make, choose, finish, lesson, progress, bonus, geometry } = audit52Competition
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E136 N1 actual Lessons purchase at all printed boundaries gives exact wood once and whole undo restores the purchase',()=>{for(const[round,wood]of [[5,4],[8,3],[11,2],[12,0],[13,0],[14,0]] as const){const s=make('E136_AnimalHusbandryWorker',false,state=>state.round=round),r=lesson(s,'E136_AnimalHusbandryWorker');assert.equal(r.state.players[0]!.resources.wood,wood);assert.ok(r.state.players[0]!.occupationPlayed.includes('E136_AnimalHusbandryWorker'));if(round===5){const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.wood,0);assert.equal(u.state.players[0]!.occupationPlayed.includes('E136_AnimalHusbandryWorker'),false);const replay=lesson(s,'E136_AnimalHusbandryWorker');assert.equal(replay.state.players[0]!.resources.wood,4);save('E136-N1-undo',{u,replay})}save(`E136-N1-${round}`,r)}})
  it('E136 N2 natural final harvest scores a unique nonowner winner and each tied eligible player against the actual final geometry',()=>{for(const mode of['unique','tie']){const s=make('E136_AnimalHusbandryWorker',true,state=>geometry(state,'E136_AnimalHusbandryWorker',mode)),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.equal(r.state.players[1]!.pastures.length,2);assert.equal(r.state.players[1]!.fenceSegments.length,7);assert.deepEqual([0,1,2].map(p=>bonus(r,'E136_AnimalHusbandryWorker',p)),[0,2,mode==='tie'?2:0]);save(`E136-N2-${mode}`,r)}})
  it('E136 N3 zero comparison and a hand card cannot invent a unique winner or a purchase reward',()=>{for(const held of[false,true]){const s=make('E136_AnimalHusbandryWorker',!held),r=progress(s,15);assert.equal(r.state.gameOver,true);assert.deepEqual([0,1,2].map(p=>bonus(r,'E136_AnimalHusbandryWorker',p)),held?[0,0,0]:[2, 2, 2]);assert.equal(r.state.players[0]!.resources.wood,0);save(`E136-N3-${held}`,r)}})
  it('E136 N4 the actual granted fence action uses its new wood at normal cost and an occupied room fence attempt rejects before one legal pasture',()=>{const card='E136_AnimalHusbandryWorker',s=make(card,false,state=>{state.round=11;state.players[0]!.resources.wood=2}),pending=lesson(s,card,card);let r=pending;if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice')r=choose(s,r,o=>o.value!=='__skip__');assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select');const bad=assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{edges:['H-1-0','H-2-0','V-1-0','V-1-1']}));r=finish(s,ok(s.commitSelectionChoice(0,{edges:['H-0-2','H-1-2','V-0-2','V-0-3']})));assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,4);assert.equal(r.state.players[0]!.pastures.length,1);save('E136-N4',{pending,bad,r})})
})
