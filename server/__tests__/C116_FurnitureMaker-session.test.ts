import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, playOccupation, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/register-all'
import '../../shared/cards/C/C116_FurnitureMaker'
import '../../shared/cards/B/B109_PaperMaker'
import '../../shared/cards/A/A123_FrameBuilder'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit49Cards from './_helpers/audit/ae-negative-49-cards'

const CARD_ID = 'C116_FurnitureMaker'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
const setupBase = (playerCount = 2) => {
  const session = createWorkSession({ seed: 9707, options: { playerCount }, configure: (state) => {
    state.round = 5
  } })
  sessions.push(session)
  return { session, state: session.state }
}

const playLessons = (
  session: ReturnType<typeof setupBase>['session'],
  spaceId: string,
  occupationId: string,
) => {
  let resp = session.takeAction(0, spaceId)
  expect(resp.ok).toBe(true)
  // Lessons emits an occupation choice (auto-resolves when a single option),
  // and may follow up with a payment-choice prompt. Walk both.
  let guard = 6
  while (guard-- > 0 && resp.interaction.stateId === 'wait') {
    if (resp.interaction.request.kind === 'select-trigger') {
      resp = resolveTriggerIfPresent(session, resp, CARD_ID)
      continue
    }
    if (resp.interaction.request.kind !== 'choice') break
    const opt =
      resp.interaction.request.options?.find((o) => o.value === occupationId)
      ?? resp.interaction.request.options?.[0]
    if (!opt) break
    resp = session.resolveChoice(0, opt.value)
  }
  return resp
}

describe('C116 Furniture Maker after occupation commitment', () => {
  it('case 1: lessons cost 1 food → +1 wood', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = [CARD_ID]
    player.resources = { ...player.resources, wood: 0, food: 5 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons', 'A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'occupation',
        resources: expect.objectContaining({ food: 1 }),
      }),
    ]))
    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
  })

  it('case 2: lessons-4 cost 2 food → +2 wood (4-player setup)', () => {
    const { session, state } = setupBase(4)
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = [CARD_ID, 'B109_PaperMaker']
    player.resources = { ...player.resources, wood: 0, food: 5 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons-4', 'A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'occupation',
        resources: expect.objectContaining({ food: 2 }),
      }),
    ]))
    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[0]!.resources.wood).toBe(2)
  })

  it('case 3: Paper Maker supplies food before paying the two-food occupation cost, earning two wood', () => {
    const { session, state } = setupBase(4)
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = [CARD_ID, 'B109_PaperMaker']
    player.resources = { ...player.resources, wood: 1, food: 0 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons-4', 'A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'cardEffect',
        sourceCardId: 'B109_PaperMaker',
        resources: { wood: 1 },
      }),
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'occupation',
        sourceCardId: 'A123_FrameBuilder',
        resources: { food: 2 },
      }),
    ]))
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('case 4: does not trigger when playing C116 itself', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID]
    player.occupationPlayed = []
    player.resources = { ...player.resources, wood: 0, food: 5 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons', CARD_ID)
    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    // Lessons cost 0 food (first occupation), C116 itself onBuy gives 1 wood
    // (defined on the card). Its after listener excludes its own play.
    expect(resp.state.players[0]!.resources.wood).toBe(1)
  })

  it('case 5: lessons cost 0 food (first occupation, no C116 yet) → C116 not in play, no wood gain', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = []
    player.resources = { ...player.resources, wood: 0, food: 0 }
    session.loadState(state)

    const resp = playLessons(session, 'lessons', 'A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })
  it('commits the occupation before rewarding its food cost, and restores the complete action', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.occupationHand = ['A125_Priest']
    Object.assign(player.resources, { wood: 4, food: 10 })
    session.loadState(state)
    const before = snapshotResponse(session.getState())
    const response = playOccupation(session, 'A125_Priest')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, food: 9 })
    const played = response.state.events.find((event) => event.type === 'card.played' && event.cardId === 'A125_Priest')!
    const gain = response.state.events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)
    expect(gain).toHaveLength(1)
    expect(gain[0]!.seq).toBeGreaterThan(played.seq)
    const restored = restoreSession(session)
    sessions.push(restored)
    expect(restored.getState().state.players[0]!.resources.wood).toBe(5)
    const undone = restored.undoAction()
    expect(undone.ok).toBe(true)
    expect(snapshotResponse(undone)).toEqual(before)
    expect(playOccupation(restored, 'A125_Priest').state.players[0]!.resources.wood).toBe(5)
  })

  it('counts each nested occupation payment once and recovers the outer onBuy choice', () => {
    const { session, state } = setupBase()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID, 'A085_Homekeeper']
    player.occupationHand = ['E097_Beneficiary', 'A114_SeasonalWorker']
    Object.assign(player.resources, { wood: 0, food: 10 })
    session.loadState(state)
    const before = snapshotResponse(session.getState())
    let response = playOccupation(session, 'E097_Beneficiary')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 9 })
    expect(response.state.players[0]!.occupationPlayed).toContain('E097_Beneficiary')
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'E097_Beneficiary', request: { kind: 'choice' } })
    const restored = restoreSession(session)
    sessions.push(restored)
    response = restored.getState()
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the Beneficiary occupation action')
    const accept = response.interaction.request.options!.find((option) => option.value !== '__skip__')!
    response = choose(restored, response, accept.value)
    expect(response.state.players[0]!.occupationPlayed).toContain('A114_SeasonalWorker')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 8 })
    const events = response.state.events
    expect(events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toHaveLength(2)
    for (const cardId of ['E097_Beneficiary', 'A114_SeasonalWorker']) {
      expect(events.filter((event) => event.type === 'resource.paid' && event.paymentFor === 'occupation' && event.sourceCardId === cardId)).toHaveLength(1)
    }
    expect(snapshotResponse(restored.undoAction())).toEqual(before)
  })

})

describe('ae-negative-49-cards', () => {
  const { FURNITURE, sessions, save, ok, make, ready, lesson, minor } = audit49Cards
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C116 N1 actual Furniture Maker purchase gains exactly one wood even when its own occupation costs food and whole undo permits one replay',()=>{for(const prior of[false,true]){const s=make(FURNITURE,false,state=>{if(prior)state.players[0]!.occupationPlayed=['A116_WoodCutter']}),a=lesson(s,FURNITURE);assert.equal(a.state.players[0]!.resources.wood,1);assert.equal(a.state.players[0]!.resources.food,prior?29:30);const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.wood,0);const r=lesson(s,FURNITURE);assert.equal(r.state.players[0]!.resources.wood,1);save(`C116-N1-${prior}`,{a,u,r})}})
  it('C116 N2 a later real paid occupation gives one wood for one food after commitment but a major improvement fee gives none',()=>{const s=make(FURNITURE),a=lesson(s,'A110_Roughcaster');assert.equal(a.state.players[0]!.resources.food,29);assert.equal(a.state.players[0]!.resources.wood,1);const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.food,30);assert.equal(u.state.players[0]!.resources.wood,0);const r=lesson(s,'A110_Roughcaster');assert.equal(r.state.players[0]!.resources.wood,1);const t=make(FURNITURE,true,state=>{state.availableMajorImprovements=['Major_Well'];Object.assign(state.players[0]!.resources,{wood:1,stone:3})}),major=minor(t,'Major_Well');assert.equal(major.state.players[0]!.resources.wood,0);assert.equal(major.state.players[0]!.resources.stone,0);save('C116-N2',{a,u,r,major})})
  it('C116 N3 unaffordable occupation card in hand unrelated minor and actual opponent occupation cannot reward the Furniture Maker owner',()=>{const s=make(FURNITURE,true,state=>state.players[0]!.resources.food=0),bad=assertRejectedUnchanged(s,()=>s.takeAction(0,'lessons')),legal=ok(s.takeAction(0,'grain-seeds'));assert.equal(legal.state.players[0]!.resources.wood,0);const t=make(FURNITURE,false),hand=lesson(t,'A110_Roughcaster');assert.equal(hand.state.players[0]!.resources.wood,0);const v=make(FURNITURE),small=minor(v);assert.equal(small.state.players[0]!.resources.wood,0);const q=make(FURNITURE,true,state=>state.players[1]!.occupationHand=['A110_Roughcaster']);ok(q.takeAction(0,'grain-seeds'));ready(q);let opponent=ok(q.takeAction(1,'lessons'));if(!opponent.state.players[1]!.occupationPlayed.includes('A110_Roughcaster'))opponent=ok(q.resolveChoice(1,'A110_Roughcaster'));assert.equal(opponent.state.players[0]!.resources.wood,0);save('C116-N3',{bad,legal,hand,small,opponent})})
})
