import { enterFeeding } from './_helpers/harvest-feeding'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/C/C059_SchnappsDistillery'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Harvest from './_helpers/audit/ae-negative-38-harvest'

describe('C059_SchnappsDistillery harvest max enforcement (server-side)', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 0
    })

    const playerA = state.players[0]!
    const playerB = state.players[1]!
    playerA.startPlayer = true
    playerB.startPlayer = false
    playerA.name = 'PlayerA'
    playerB.name = 'PlayerB'

    // PlayerA needs 2 food (familySize=1 * 2), has C59 + 2 vegetables
    playerA.minorPlayed.push('C059_SchnappsDistillery')
    playerA.resources.vegetable = 2

    // PlayerB: skip feeding complications
    setActiveWorkerCount(playerB, 0) // avoid pending feed

    session.loadState(state)
    return session
  }

  it('rejects a count above max without mutating the feeding draft', () => {
    const session = setup()
    let resp = enterFeeding(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('feed')
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.request.remaining).toBe(2)

    const before = session.getState()
    resp = session.resolveChoice(0, 'confirm', { selections: [
      {
        sourceId: 'C059_SchnappsDistillery',
        exchangeIndex: 0,
        count: 2,
        sourceName: 'Schnapps Distillery',
      },
    ] })

    expect(resp.ok).toBe(false)
    expect(resp.state).toEqual(before.state)
    expect(resp.interaction).toEqual(before.interaction)

    resp = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: 'C059_SchnappsDistillery',
      exchangeIndex: 0,
      count: 1,
      sourceName: 'Schnapps Distillery',
    }] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('allows count=1 (within max)', () => {
    const session = setup()
    let resp = enterFeeding(session)
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')

    resp = session.resolveChoice(0, 'confirm', { selections: [
      {
        sourceId: 'C059_SchnappsDistillery',
        exchangeIndex: 0,
        count: 1,
        sourceName: 'Schnapps Distillery',
      },
    ] })

    const playerA = resp.state.players[0]!
    expect(playerA.resources.vegetable).toBe(1)
    expect(playerA.resources.begging).toBe(0)
    const convertLog = resp.state.log.find((e) => e.key === 'log.harvestFeedConvert')
    expect(convertLog).toBeDefined()
    expect((convertLog as any).params.cost).toEqual({ vegetable: 1 })
  })

  it('rejects an unknown source without mutating the feeding draft', () => {
    const session = setup()
    let resp = enterFeeding(session)
    if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) throw new Error('expected harvestFeed pending')

    const before = session.getState()
    resp = session.resolveChoice(0, 'confirm', { selections: [
      {
        sourceId: 'NoSuchCard',
        exchangeIndex: 0,
        count: 2,
        sourceName: 'Schnapps Distillery',
      },
    ] })

    expect(resp.ok).toBe(false)
    expect(resp.state).toEqual(before.state)
    expect(resp.interaction).toEqual(before.interaction)
  })
})

describe('ae-negative-38-harvest', () => {
  const { sessions, save, ok, pendingCard, finish, progress, buy, bonus, QUIET, printed, distill } = audit38Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C059 N1 actual stone vegetable purchase and a real feeding catalog exchange permit exactly one vegetable for five food after an illegal two use retry', () => { const b = distill(false, 1, 100), bought = finish(b, buy(b, 'C059_SchnappsDistillery')); assert.deepEqual([bought.state.players[0]!.resources.vegetable, bought.state.players[0]!.resources.stone, printed(bought, 'C059_SchnappsDistillery')], [0, 0, 2]); const s = distill(), feed = progress(s, 12, '__feed__', QUIET); save('C059-N1-feed', feed); assert.ok(feed.interaction.stateId === 'wait' && feed.interaction.request.kind === 'feed'); const recipe = feed.interaction.request.exchangeCatalog?.find(e => e.sourceId === 'C059_SchnappsDistillery'); assert.ok(recipe); const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { selections: [{ sourceId: recipe.sourceId, exchangeIndex: recipe.exchangeIndex, count: 2, sourceName: recipe.sourceId }] })), r = finish(s, ok(s.resolveChoice(0, 'confirm', { selections: [{ sourceId: recipe.sourceId, exchangeIndex: recipe.exchangeIndex, count: 1, sourceName: recipe.sourceId }] }))); assert.deepEqual([r.state.players[0]!.resources.vegetable, r.state.players[0]!.resources.food, r.state.players[0]!.resources.begging], [1, 1, 0]); save('C059-N1', { bought, feed, bad, r }); });
  it('C059 N2 fifth sixth and later vegetables count remaining reserve plus growing field crops with no score above the two bonus cap', () => {
      const rows = [];
      for (const [veg, score] of [[4, 0], [5, 1], [6, 2], [7, 2]] as const) {
          const s = distill(true, veg - 2, 100, 14);
          const state = s.getState().state;
          state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] }];
          s.loadState(state);
          const r = ok(s.getState());
          assert.equal(bonus(r, 'C059_SchnappsDistillery'), score);
          rows.push(r);
      }
      const t = distill(false, 6, 100, 14), hand = ok(t.getState());
      assert.equal(bonus(hand, 'C059_SchnappsDistillery'), 0);
      save('C059-N2', { rows, hand });
  });
  it('C059 N3 missing printed resources reject and a held or nonharvest card cannot offer its five food recipe while actual decline retains vegetables', () => {
      const rows = [];
      for (const [veg, stone] of [[0, 2], [1, 1]] as const) {
          const s = distill(false, veg, 100, 14, stone), p = buy(s, 'C059_SchnappsDistillery'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'C059_SchnappsDistillery'));
          rows.push({ p, bad });
      }
      const q = distill(true, 2, 100), decline = progress(q, 12, '', QUIET);
      assert.deepEqual([decline.state.players[0]!.resources.vegetable, decline.state.players[0]!.resources.food], [2, 96]);
      const t = distill(false, 2, 0), feed = progress(t, 12, '__feed__', QUIET);
      assert.ok(feed.interaction.stateId === 'wait' && feed.interaction.request.kind === 'feed');
      assert.equal(feed.interaction.request.exchangeCatalog?.some(e => e.sourceId === 'C059_SchnappsDistillery'), false);
      const u = distill(true, 2, 100, 12), p = u.takeAnytimeAction(0, 'exchange');
      assert.equal(p.ok, false);
      assert.equal(p.state.players[0]!.resources.food, 100);
      assert.equal(p.interaction.stateId, 'idle');
      assert.equal(pendingCard(p, 'C059_SchnappsDistillery'), false);
      save('C059-N3', { rows, decline, feed, p });
  });
})
