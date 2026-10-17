import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { markAllWorkersUsed, setActiveWorkerCount, setNewbornCount, newbornCount, familySize } from '../../shared/domain/player'
import { E030_ChildsToy } from '../../shared/cards/E/E030_ChildsToy'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import type { ActionChoiceOption } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

const CARD_ID = 'E030_ChildsToy'

describe('E030_ChildsToy session', () => {
  it('with card and 1 newborn, feeding requires full 2 food per person (no discount)', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    setActiveWorkerCount(player, 2)
    setNewbornCount(player, 1)
    player.resources.food = 4
    player.minorPlayed.push(CARD_ID)

    // Player 2 has enough food - no complication
    const player2 = state.players[1]!
    setActiveWorkerCount(player2, 2)
    setNewbornCount(player2, 0)
    player2.resources.food = 10

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Drive through all pending states
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
      } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
      } else if (resp.interaction.stateId === 'wait') {
        const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
        }
      } else {
        break
      }
    }

    expect(resp.state.players[0]!.resources.begging).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('without card and 1 newborn, feeding has newborn discount', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    setActiveWorkerCount(player, 2)
    setNewbornCount(player, 1)
    player.resources.food = 3
    // Card NOT played

    const player2 = state.players[1]!
    setActiveWorkerCount(player2, 2)
    setNewbornCount(player2, 0)
    player2.resources.food = 10

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Drive through all pending states
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
      } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
      } else if (resp.interaction.stateId === 'wait') {
        const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
        }
      } else {
        break
      }
    }

    // Without the card, newborn discount applies:
    // required = max(0, 2 * 2 - 1) = 3
    // Player had 3 food, so exactly enough — no begging
    expect(resp.state.players[0]!.resources.begging).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('with card and 1 newborn but insufficient food, player begs', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    setActiveWorkerCount(player, 2)
    setNewbornCount(player, 1)
    player.resources.food = 3 // Need 4 with card, only have 3
    player.minorPlayed.push(CARD_ID)

    const player2 = state.players[1]!
    setActiveWorkerCount(player2, 2)
    setNewbornCount(player2, 0)
    player2.resources.food = 10

    session.loadState(state)

    let resp = session.performRoundEnd()

    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
      } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
      } else if (resp.interaction.stateId === 'wait') {
        const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
        }
      } else {
        break
      }
    }

    // With card: required = 4, had 3, so 1 begging
    expect(resp.state.players[0]!.resources.begging).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('preserves newborn flag after feeding (non-destructive mutation)', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    setActiveWorkerCount(player, 3)
    setNewbornCount(player, 1)
    markAllWorkersUsed(state, player)
    player.resources.food = 10
    player.minorPlayed.push(CARD_ID)

    const player2 = state.players[1]!
    setActiveWorkerCount(player2, 2)
    setNewbornCount(player2, 0)
    markAllWorkersUsed(state, player2)
    player2.resources.food = 10

    session.loadState(state)

    let resp = session.performRoundEnd()
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
      } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
      } else if (resp.interaction.stateId === 'wait') {
        const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
        }
      } else {
        break
      }
    }

    const p1 = resp.state.players[0]!
    expect(p1.workers.filter((w) => w.isActive).length).toBe(3)
    expect(p1.resources.food).toBe(4) // 10 - 6
    expect(newbornCount(p1)).toBe(0)
  })

  describe('prerequisite "Exactly 2 Adults"', () => {
    it('blocks when player has only 1 adult', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      setActiveWorkerCount(player, 1)
      setNewbornCount(player, 0)
      expect(session.withCtx(() => meetsCardPrerequisites(player, E030_ChildsToy, state.round, state))).toBe(false)
    })

    it('blocks when one active worker is a newborn (1 adult + 1 newborn)', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 1)
      expect(session.withCtx(() => meetsCardPrerequisites(player, E030_ChildsToy, state.round, state))).toBe(false)
    })

    it('allows when player has exactly 2 adults (no newborns)', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 0)
      expect(session.withCtx(() => meetsCardPrerequisites(player, E030_ChildsToy, state.round, state))).toBe(true)
    })
  })
})

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, choose, finish, ready, fill, end, final, minor, purchase, rejectBuy, undo, resource, points, house, newborn } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("E030 N1 real purchases accept either one wood or one clay with exactly two adults and retain the unused alternative", () => { for (const mode of ['wood', 'clay', 'bothwood', 'bothclay']) {
      const s = make('E030_ChildsToy', st => { Object.assign(st.players[0]!.resources, { wood: mode === 'clay' ? 0 : 1, clay: mode === 'wood' ? 0 : 1 }); }, false), p = minor(s), r = finish(s, choose(s, 0, 'E030_ChildsToy'), true, [mode.endsWith('clay') || mode === 'clay' ? '"clay":1' : '"wood":1']), u = undo(s);
      resource(r, { wood: mode === 'bothclay' ? 1 : 0, clay: mode === 'bothwood' ? 1 : 0 });
      assert.equal(points(r, 'E030_ChildsToy'), 2);
      assert.ok(u.state.players[0]!.minorHand.includes('E030_ChildsToy'));
      save(`E030-N1-${mode}`, { p, r, u });
  } ; const s = make('E030_ChildsToy', st => { st.players[0]!.resources.wood = 1; }, false, 14); purchase(s, 'E030_ChildsToy'); const scored = final(s); assert.equal(points(scored, 'E030_ChildsToy'), 2); save('E030-N1-final', scored); });
  it("E030 N2 three or four genuine adults reject purchase while two adults plus a real newborn permit it", () => { for (const n of [3, 4]) {
      const s = make('E030_ChildsToy', st => { house(st.players[0]!, n); setActiveWorkerCount(st.players[0]!, n); st.players[0]!.resources.wood = 1; }, false, 7);
      save(`E030-N2-${n}`, rejectBuy(s, 'E030_ChildsToy'));
  } const s = make('E030_ChildsToy', st => { house(st.players[0]!, 3); st.players[0]!.resources.wood = 1; }, false, 7), grown = newborn(s); fill(s); ready(s); const r = purchase(s, 'E030_ChildsToy'); assert.equal(newbornCount(r.state.players[0]!), 1); assert.equal(familySize(r.state.players[0]!), 3); resource(r, { wood: 0 }); save('E030-N2-newborn', { grown, r }); });
  it("E030 N3 genuine round-seven newborn needs six food and declining grain conversion causes one begging while held and nonharvest controls do not", () => { for (const [held, round] of [[false, 7], [true, 7], [false, 5]] satisfies Array<[
      boolean,
      number
  ]>) {
      const s = make('E030_ChildsToy', st => { house(st.players[0]!, 3); st.players[0]!.resources.food = 5; st.players[0]!.resources.grain = 1; }, !held, round), grown = newborn(s), p = end(s, false, [], undefined, 'feed');
      save(`E030-N3-${held}-${round}-feeding`, { grown, p });
      if (!held && round === 7) {
          assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'feed');
          assert.equal(p.interaction.request.remaining, 1);
          assert.equal(p.interaction.request.foodUsed, 5);
          assert.ok(p.interaction.request.exchangeCatalog?.some(e => e.from.grain === 1 && e.to.food === 1));
      }
      const r = finish(s, p, false);
      resource(r, { food: round === 5 ? 5 : 0, grain: 1, begging: !held && round === 7 ? 1 : 0 });
      save(`E030-N3-${held}-${round}`, { grown, p, r });
  } });
})
