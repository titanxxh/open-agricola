import assert from 'node:assert/strict'
import { afterEach, it, describe, expect } from 'vitest'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { getChoiceOptions } from './_helpers/session-assertions'

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, take, finish, ready, end, purchase, rejectBuy, resource, bonus, field } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("C029 N1 real grain-free-supply purchase harvests a field then trades one grain for points and food to every opponent", () => { for (const players of [2, 4]) {
      const s = make('C029_BeerTable', st => { field(st.players[0]!, 2); st.players[0]!.resources.wood = 2; }, false, 4, players), bought = purchase(s, 'C029_BeerTable');
      resource(bought, { grain: 0, wood: 0 });
      const spaces = players === 2 ? [[1, 'clay-pit'], [0, 'forest'], [1, 'reed-bank']] : [[1, 'clay-pit'], [2, 'reed-bank'], [3, 'grove'], [0, 'forest'], [1, 'copse'], [2, 'hollow-4'], [3, 'grain-seeds']];
      for (const [a, space] of spaces) {
          assert.equal(ready(s).state.currentPlayerIndex, a);
          finish(s, take(s, Number(a), String(space)), false);
      }
      const r = end(s, true);
      resource(r, { grain: 0, food: 96 });
      for (let a = 1; a < players; a++)
          resource(r, { food: 97 }, a);
      assert.equal(bonus(r, 'C029_BeerTable'), 2);
      assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 1);
      save(`C029-N1-${players}`, { bought, r });
  } });
  it("C029 N2 reserve grain wood shortage no grain and optional decline enforce the printed gates", () => { for (const mode of ['grain', 'wood']) {
      const s = make('C029_BeerTable', st => { Object.assign(st.players[0]!.resources, { wood: mode === 'wood' ? 1 : 2, grain: mode === 'grain' ? 1 : 0 }); }, false, 4);
      save(`C029-N2-buy-${mode}`, rejectBuy(s, 'C029_BeerTable'));
  } for (const decline of [false, true]) {
      const s = make('C029_BeerTable', st => { st.players[0]!.resources.grain = decline ? 1 : 0; }, true, 4), r = end(s, !decline, [], decline ? undefined : 'C029_BeerTable');
      resource(r, { grain: decline ? 1 : 0, food: 96 });
      resource(r, { food: 96 }, 1);
      assert.equal(bonus(r, 'C029_BeerTable'), 0);
      save(`C029-N2-${decline ? 'decline' : 'grain'}`, r);
  } });
  it("C029 N3 nonharvest held card and ordinary midround work cannot trade grain early", () => { for (const mode of ['nonharvest', 'hand', 'midround']) {
      const s = make('C029_BeerTable', st => { st.players[0]!.resources.grain = 1; }, mode !== 'hand', mode === 'hand' ? 4 : 5), r = mode === 'midround' ? finish(s, take(s, 0, 'forest'), true, [], 'C029_BeerTable') : end(s, true, [], 'C029_BeerTable');
      resource(r, { grain: 1, food: mode === 'hand' ? 96 : 100 });
      assert.equal(bonus(r, 'C029_BeerTable'), 0);
      save(`C029-N3-${mode}`, r);
  } });
})

describe('Beer Table with actual recipients', () => {
  const cardId = 'C029_BeerTable'
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  const make = (playerCount: number, grain = 1) => {
    const session = createWorkSession({ seed: 42, options: { playerCount }, configure(state) {
      state.round = 4
      for (const [index, player] of state.players.entries()) {
        player.resources = {
          food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: index === 0 ? grain : 0,
          vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
        }
        for (const [workerIndex, id] of (index === 0 ? ['forest', 'clay-pit'] : ['reed-bank', 'fishing']).entries()) {
          state.actionSpaces.find(space => space.id === id)!.takenBy.push({ playerId: player.id, workerId: player.workers[workerIndex]!.id })
        }
      }
      state.players[0]!.minorPlayed = [cardId]
    } })
    sessions.push(session)
    return session
  }

  const finish = (session: GameSession, initial: SessionResponse) => {
    let response = initial
    for (let step = 0; step < 12 && response.interaction.stateId === 'wait'; step++) {
      expect(response.ok, response.error).toBe(true)
      const request = response.interaction.request
      if (request.kind === 'confirm-player-switch') response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
      else if (request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      else if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
        response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
      } else throw new Error(`Unexpected harvest request: ${request.kind}`)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.round).toBe(5)
    return response
  }

  it('retains its own grain payment and two points when solo has no other recipients', () => {
    const session = make(1)
    const score = session.getState().scores![0]!.total
    const pending = session.performRoundEnd()
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', sourceCard: cardId, request: { kind: 'choice' } })
    const option = getChoiceOptions(pending).find(entry => entry.value !== '__skip__')
    assert.ok(option)
    const response = finish(session, session.resolveChoice(0, option.value))

    expect(response.state.players).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 14, begging: 0 })
    expect(response.state.players[0]!.cardStates[cardId]?.counters?.bonusVp).toBe(2)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === cardId))
      .toEqual([expect.objectContaining({ resources: { grain: 1 } })])
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === cardId)).toBe(false)
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectPay', params: expect.objectContaining({ cardId, cost: { grain: 1 } }),
    }))
    expect(response.scores![0]!.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'cardBonusVp', total: 2 }),
      expect.objectContaining({ key: 'grains', quantity: 0, total: -1 }),
    ]))
    expect(response.scores![0]!.total).toBe(score)
  })

  it('gives one food only to the real opponent while preserving the same owner payment and points', () => {
    const session = make(2)
    const scores = session.getState().scores!
    const pending = session.performRoundEnd()
    expect(pending.interaction).toMatchObject({ stateId: 'wait', sourceCard: cardId, request: { kind: 'choice' } })
    const option = getChoiceOptions(pending).find(entry => entry.value !== '__skip__')
    assert.ok(option)
    const response = finish(session, session.resolveChoice(0, option.value))
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 16 })
    expect(response.state.players[1]!.resources).toMatchObject({ grain: 0, food: 17 })
    expect(response.state.players[0]!.cardStates[cardId]?.counters?.bonusVp).toBe(2)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === cardId))
      .toEqual([expect.objectContaining({ to: { kind: 'player', playerId: 'p2' }, resources: { food: 1 } })])
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain', playerId: 'p2', params: expect.objectContaining({ cardId, gain: { food: 1 } }),
    }))
    expect(response.scores![0]!.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'cardBonusVp', total: 2 }),
      expect.objectContaining({ key: 'grains', quantity: 0, total: -1 }),
    ]))
    expect(response.scores!.map(score => score.total)).toEqual(scores.map(score => score.total))
  })

  it.each([
    { playerCount: 1, grain: 0 }, { playerCount: 2, grain: 0 },
    { playerCount: 1, grain: 1 }, { playerCount: 2, grain: 1 },
  ])('leaves $grain grain and awards nothing when unavailable or declined at $playerCount players', ({ playerCount, grain }) => {
    const session = make(playerCount, grain)
    const scores = session.getState().scores!
    let response = session.performRoundEnd()
    if (grain === 1) {
      expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: cardId })
      expect(getChoiceOptions(response)).toContainEqual(expect.objectContaining({ value: '__skip__' }))
      response = session.resolveChoice(0, '__skip__')
    }
    response = finish(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ grain, food: playerCount === 1 ? 14 : 16 })
    if (playerCount === 2) expect(response.state.players[1]!.resources.food).toBe(16)
    expect(response.state.players[0]!.cardStates[cardId]?.counters?.bonusVp ?? 0).toBe(0)
    expect(response.state.events.some(event => event.sourceCardId === cardId)).toBe(false)
    expect(response.state.log.some(entry => entry.params?.cardId === cardId)).toBe(false)
    expect(response.scores).toEqual(scores)
  })
})
