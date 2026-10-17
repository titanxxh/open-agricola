import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A114_SeasonalWorker'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit14Spaces from './_helpers/audit/ae-negative-14-spaces'

const CARD_ID = 'A114_SeasonalWorker'

const setup = ({ round, inHand = false }: { round: number; inHand?: boolean }) => {
  const session = new GameSession(114, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources = { ...player.resources, food: 0, grain: 0, vegetable: 0 }
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

const chooseCrop = (session: GameSession, response: SessionResponse, crop: 'grain' | 'vegetable') => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    JSON.stringify(candidate.effectPreview).includes(`\"${crop}\":1`)
  )
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A114 Seasonal Worker parity', () => {
  it('A114 S1: playing Seasonal Worker through Lessons keeps the occupation in play', () => {
    const response = playOccupation(setup({ round: 1, inHand: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A114 S2: before round six Day Laborer adds one grain', () => {
    const response = setup({ round: 5 }).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 1, vegetable: 0 })
  })

  it('A114 S3: from round six Day Laborer can choose one grain', () => {
    const session = setup({ round: 6 })

    const response = chooseCrop(session, session.takeAction(0, 'day-laborer'), 'grain')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 1, vegetable: 0 })
  })

  it('A114 S4: from round six Day Laborer can choose one vegetable', () => {
    const session = setup({ round: 6 })

    const response = chooseCrop(session, session.takeAction(0, 'day-laborer'), 'vegetable')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 0, vegetable: 1 })
  })

  it('A114 S5: a non-Day-Laborer action grants no crop', () => {
    const response = setup({ round: 6 }).takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
  })
})

describe('ae-negative-14-spaces', () => {
  const { SEASON, sessions, save, ok, setup, turn, selectCrop } = audit14Spaces
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A114 N1 round five adds grain only and round six chooses exactly one crop',()=>{const early=turn(setup(SEASON,undefined,true,5),0,'day-laborer');assert.equal(early.state.players[0]!.resources.food,42);assert.equal(early.state.players[0]!.resources.grain,1);assert.equal(early.state.players[0]!.resources.vegetable,0);save('A114-N1-early',early);for(const crop of['grain','vegetable'] as const){const s=setup(SEASON,undefined,true,6);const r=selectCrop(s,turn(s,0,'day-laborer'),crop);assert.equal(r.state.players[0]!.resources.food,42);assert.equal(r.state.players[0]!.resources[crop],1);assert.equal(r.state.players[0]!.resources[crop==='grain'?'vegetable':'grain'],0);save(`A114-N1-${crop}`,r)}})
  it('A114 N2 nonmatching owner opponent and unplayed uses cannot grant a crop',()=>{for(const played of[true,false]){const s=setup(SEASON,undefined,played);const r=turn(s,0,played?'forest':'day-laborer');assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.vegetable,0);save(`A114-N2-${played}`,r)}const s=setup(SEASON);turn(s,0,'grain-seeds');const r=turn(s,1,'day-laborer');assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.vegetable,0);assert.equal(r.state.players[1]!.resources.grain,0);save('A114-N2-opponent',r)})
  it('A114 N3 wrong actor invalid crop and stale choice cannot duplicate reward',()=>{const s=setup(SEASON);const pending=turn(s,0,'day-laborer');assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice');const o=pending.interaction.request.options[0]!;assertRejectedUnchanged(s,()=>s.resolveChoice(1,o.value));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'both-crops'));const r=selectCrop(s,pending,'vegetable');assertRejectedUnchanged(s,()=>s.resolveChoice(0,o.value));assert.equal(r.state.players[0]!.resources.vegetable,1);save('A114-N3',r)})
  it('A114 N4 whole action undo restores crop and base food before one retry',()=>{const s=setup(SEASON);const first=selectCrop(s,turn(s,0,'day-laborer'),'vegetable');const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,40);assert.equal(undone.state.players[0]!.resources.vegetable,0);const retry=selectCrop(s,turn(s,0,'day-laborer'),'grain');assert.equal(retry.state.players[0]!.resources.food,42);assert.equal(retry.state.players[0]!.resources.grain,1);save('A114-N4',{first,undone,retry})})
})
