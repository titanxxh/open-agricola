import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { executeCardListener } from '../../shared/cards/card-listeners'
import { type DraftGameEvent } from '../../shared/contract/events'
import { A095_Angler_impl } from '../../shared/cards/A/A095_Angler'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent , expectWait } from './_helpers/trigger-select'
import '../../shared/cards/A/A031_DebtSecurity'
import assert from 'node:assert/strict'
import { type ActionChoiceOption, type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A095_Angler'

const TEST_MINOR = 'A006_StorageBarn'

const setup = (fishingFood: number, actor = 0, withMinor = true) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5095, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'

  const player = state.players[0]!
  state.players.forEach((candidate) => {
    candidate.minorHand = ['__test_placeholder__']
    candidate.occupationHand = ['__test_placeholder__']
    candidate.resources.food = 0
    setWorkersAtHome(state, candidate, 2)
  })
  player.occupationPlayed = [CARD_ID]
  player.minorHand = withMinor ? ['A031_DebtSecurity'] : [TEST_MINOR]
  player.resources.food = withMinor ? 2 : 0

  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('fishing space missing')
  fishing.resources.food = fishingFood

  session.loadState(state)
  return session
}

const playOccupationSession = () => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5096, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    setWorkersAtHome(state, player, 2)
  })
  state.players[0]!.occupationHand = [CARD_ID]
  state.players[0]!.resources.food = 0
  session.loadState(state)
  return session.takeAction(0, 'lessons')
}

const resolveAnglerMinor = (session: GameSession) => {
  let response = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = getChoiceOptions(response).find((option) => option.sourceCard === CARD_ID && option.value !== '__skip__')
  expect(accept).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  if (response.interaction.stateId === 'wait') {
    const improvement = getChoiceOptions(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  if (response.interaction.stateId === 'wait') {
    const card = getChoiceOptions(response).find((option) => option.value === 'A031_DebtSecurity')
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const supplyCardEffectFood = (food: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'cardEffect',
})

const fishingFood = (food: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'actionSpace', spaceId: 'fishing' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
})

const runListener = (
  transactionEvents: DraftGameEvent[],
  resourcesGained: { food?: number },
  actionEvents?: DraftGameEvent[],
) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5097, configure(state) {
    state.players[0]!.occupationPlayed = [CARD_ID]
  } }))
  const registration = A095_Angler_impl.listeners?.[0]
  assert.ok(registration)
  const space = session.state.actionSpaces.find(candidate => candidate.id === 'fishing')
  assert.ok(space)
  return session.withCtx(() => executeCardListener(registration, {
    state: session.state, player: session.state.players[0]!, space,
    actionId: 'collect', phase: 'after', transactionEvents, actionEvents,
    result: { type: 'ok', resourcesGained }, actionHooks: session.actionHooks,
  }))
}

describe('A095_Angler session', () => {
  it('A095 S1: Angler is played as the first occupation without paying food', () => {
    const response = playOccupationSession()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it.each([['S2a', 1], ['S2b', 2]] as const)(
    'A095 %s: collecting %i food from Fishing allows a Major or Minor Improvement',
    (_scenario, fishingFood) => {
      const session = setup(fishingFood)
      const response = resolveAnglerMinor(session)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.minorPlayed).toContain('A031_DebtSecurity')
      expect(response.state.players[0]!.resources.food).toBe(fishingFood)
    },
  )

  it('A095 S3: the optional improvement after Fishing can be declined', () => {
    const session = setup(2)
    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      resp = session.resolveChoice(resp.interaction.playerIndex, '__skip__')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 2)
    expect(resp.state.players[0]!.minorHand).toContain('A031_DebtSecurity')
  })

  it('A095 S4: collecting more than two food from Fishing offers no improvement', () => {
    const session = setup(3)
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 3)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).not.toBe(CARD_ID)
    expect(resp.interaction.promptKey).not.toBe('ui.interactionOptionalAction')
  })

  it('A095 S5: using a non-Fishing accumulation space offers no improvement', () => {
    const session = setup(2)
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 2
    session.loadState(state)

    const response = session.takeAction(0, 'reed-bank')

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain('A031_DebtSecurity')
  })

  it('A095 S6: another player using Fishing does not trigger the owner Angler', () => {
    const response = setup(2, 1).takeAction(1, 'fishing')

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain('A031_DebtSecurity')
    expect(response.state.players[1]!.resources.food).toBe(2)
  })
})

describe('A095_Angler listener provenance guard', () => {
  it('ignores generic supply/cardEffect food even when result reports food gained', () => {
    const result = runListener([supplyCardEffectFood(2)], { food: 2 })

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction food when current action has no food movement', () => {
    const result = runListener([fishingFood(2)], { food: 2 }, [])

    expect(result).toBeUndefined()
  })
})

describe("A095 command boundaries", () => {
    const ANGLER = 'A095_Angler';
    const DEBT = 'A031_DebtSecurity';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setupAngler(configure: (state: GameState) => void = () => { }, round = 14, played = true) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = round;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.occupationPlayed = played ? [ANGLER] : [];
                state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [ANGLER];
                configure(state);
            } }));
        return session;
    }
    function ready(session: GameSession, actor: number) {
        let response = session.getState();
        if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'confirm-next-player')
            response = confirmNext(session, response);
        assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction));
        assert.equal(response.state.currentPlayerIndex, actor);
    }
    function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)); }
    function options(response: SessionResponse): ActionChoiceOption[] { assert.ok(response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice', JSON.stringify(response.interaction)); return getChoiceOptions(response); }
    function accept(session: GameSession, response: SessionResponse) { assert.ok(response.interaction.stateId === 'wait'); assert.equal(response.interaction.sourceCard, ANGLER); const choices = options(response).filter(o => o.sourceCard === ANGLER); assert.equal(choices.length, 1); const choice = choices[0]!; assert.equal(choice.disabled ?? false, false); return ok(session.resolveChoice(response.interaction.playerIndex, choice.value)); }
    function angler(amount = 2, food = 2, played = true) { return setupAngler(state => { state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = amount; state.players[0]!.resources.food = food; state.players[0]!.minorHand = [DEBT]; }, 5, played); }
    it("original one and two food allow minor with ordinary two food cost", () => {
        for (const amount of [1, 2]) {
            const session = angler(amount);
            let response = accept(session, turn(session, 0, 'fishing'));
            if (!response.state.players[0]!.minorPlayed.includes(DEBT))
                response = ok(session.resolveChoice(0, DEBT));
            assert.ok(response.state.players[0]!.minorPlayed.includes(DEBT));
            assert.equal(response.state.players[0]!.resources.food, amount);
            assert.equal(response.state.actionSpaces.find(s => s.id === 'fishing')!.resources.food, 0);
            save(`A095-N1-${amount}`, response);
        }
    });
    it("decline preserves food and hand and insufficient payment cannot buy debt", () => {
        const session = angler();
        turn(session, 0, 'fishing');
        const response = ok(session.resolveChoice(0, '__skip__'));
        assert.equal(response.state.players[0]!.resources.food, 4);
        assert.ok(response.state.players[0]!.minorHand.includes(DEBT));
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A095-N2-decline', response);
        const poor = angler(1, 0);
        const denied = turn(poor, 0, 'fishing');
        assert.equal(denied.state.players[0]!.resources.food, 1);
        assert.ok(!denied.state.players[0]!.minorPlayed.includes(DEBT));
        assertRejectedUnchanged(poor, () => poor.resolveChoice(0, DEBT));
        assert.ok(denied.interaction.stateId === 'wait');
        assert.deepEqual(denied.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(denied.state.currentPlayerIndex, 0);
        save('A095-N2-poor', denied);
    });
    it("three food nonFishing unplayed and actual opponent cannot trigger owner", () => {
        for (const [session, space] of [[angler(3), 'fishing'], [angler(), 'day-laborer'], [angler(2, 2, false), 'fishing']] as const) {
            const response = turn(session, 0, space);
            assert.equal(response.interaction.stateId === 'wait' ? expectWait(response).interaction.request.kind : '', 'confirm-next-player');
            assert.ok(response.state.players[0]!.minorHand.includes(DEBT));
            save(`A095-N3-${space}-${response.state.players[0]!.resources.food}`, response);
        }
        const session = angler();
        turn(session, 0, 'grain-seeds');
        const response = turn(session, 1, 'fishing');
        assert.ok(response.state.players[0]!.minorHand.includes(DEBT));
        assert.equal(response.state.players[1]!.resources.food, 42);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 });
        assert.equal(response.state.currentPlayerIndex, 1);
        save('A095-N3-opponent', response);
    });
});
