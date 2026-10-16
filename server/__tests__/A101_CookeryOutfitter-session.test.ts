import { expectWait } from './_helpers/trigger-select'
import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import { type GameState, type FarmTilePosition } from '../../shared/contract/types'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const COOK = 'A101_CookeryOutfitter'

const ORIENTAL = 'A060_OrientalFireplace'

const setup = (configure: (state: GameState) => void = () => {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
    state.round = 5
    const owner = state.players[0]!
    owner.occupationPlayed = [COOK]
    owner.minorHand = [ORIENTAL]
    owner.improvements = ['Major_Fireplace1']
    owner.resources.clay = 5
    owner.resources.food = 20
    configure(state)
    for (const player of state.players) {
      for (const card of player.improvements) takeMajorImprovementFromSupply(state, card)
    }
  } }))

  return session
}

const ok = (response: SessionResponse) => {
  assert.equal(response.ok, true, response.error)
  return response
}

const bonus = (response: SessionResponse, player = 0) => {
  assert.ok(response.scores)
  return response.scores[player]!.categories
    .find(category => category.key === 'cardBonusVp')?.entries
    .find(entry => entry.type === 'bonus' && entry.cardId === COOK)?.score ?? 0
}

const options = (response: SessionResponse) => {
  assert.ok(response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice')
  return getChoiceOptions(response)
}

const buyOriental = (session: GameSession) => {
  let response = ok(session.takeAction(0, 'meeting-place'))
  const branch = options(response).find(option => option.value.startsWith('action-improvement-'))
  if (branch) response = ok(session.resolveChoice(0, branch.value))
  if (response.state.players[0]!.minorHand.includes(ORIENTAL)) {
    expect(options(response)).toContainEqual(expect.objectContaining({ value: ORIENTAL }))
    response = ok(session.resolveChoice(0, ORIENTAL))
  }
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = options(response).find(option => JSON.stringify(option).includes('Major_Fireplace1'))
    assert.ok(payment, 'Expected returning Fireplace payment')
    response = ok(session.resolveChoice(0, payment.value))
  }
  return response
}

describe('A101 Cookery Outfitter', () => {
  it('keeps one cooking point when a real Oriental Fireplace purchase returns a Fireplace', () => {
    const session = setup()
    expect(bonus(session.getState())).toBe(1)
    const response = buyOriental(session)
    expect(response.state.players[0]!.minorPlayed).toEqual([ORIENTAL])
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ food: 20, clay: 5 })
    expect(response.state.availableMajorImprovements).toContain('Major_Fireplace1')
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid', returnedCardId: 'Major_Fireplace1', sourceCardId: ORIENTAL,
    }))
    expect(bonus(response)).toBe(1)
  })

  it('undoes and retries the purchase with the same resources, card supply and cooking score', () => {
    const session = setup()
    const before = structuredClone({
      resources: session.state.players[0]!.resources,
      supply: session.state.availableMajorImprovements,
      events: session.state.events,
      log: session.state.log,
    })
    const purchased = buyOriental(session)
    expect(bonus(purchased)).toBe(1)
    const undone = ok(session.undoAction())
    expect(undone.state.players[0]!.minorHand).toEqual([ORIENTAL])
    expect(undone.state.players[0]!.minorPlayed).toEqual([])
    expect(undone.state.players[0]!.improvements).toEqual(['Major_Fireplace1'])
    expect(undone.state.players[0]!.resources).toEqual(before.resources)
    expect(undone.state.availableMajorImprovements).toEqual(before.supply)
    expect(undone.state.events).toEqual(before.events)
    expect(undone.state.log).toEqual(before.log)
    expect(bonus(undone)).toBe(1)
    const retry = buyOriental(session)
    expect(bonus(retry)).toBe(1)
    expect(retry.state.players[0]!.minorPlayed).toEqual([ORIENTAL])
  })

  it('counts a dual-identity cooking minor once alongside a cooking major and excludes an oven', () => {
    const session = setup(state => {
      state.players[0]!.minorPlayed = [ORIENTAL]
      state.players[0]!.minorHand = ['__test_placeholder__']
      state.players[0]!.improvements = ['Major_CookingHearth1', 'Major_ClayOven']
    })
    const before = session.getState()
    expect(bonus(before)).toBe(2)
    for (let read = 0; read < 3; read++) {
      const response = session.getState()
      expect(bonus(response)).toBe(2)
      expect(response.state).toEqual(before.state)
      expect(response.interaction).toEqual(before.interaction)
    }
  })

  it('counts separate physical cooking majors independently', () => {
    const session = setup(state => {
      state.players[0]!.improvements = [
        'Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2',
      ]
    })
    expect(bonus(session.getState())).toBe(4)
  })

  it('does not count ovens, held cards or another player\'s cooking cards', () => {
    const session = setup(state => {
      state.players[0]!.improvements = ['Major_ClayOven', 'Major_StoneOven']
      state.players[1]!.minorPlayed = [ORIENTAL]
      state.players[1]!.improvements = ['Major_CookingHearth1']
    })
    expect(bonus(session.getState())).toBe(0)
  })

  it('awards no cooking bonus before Cookery Outfitter has been played', () => {
    const session = setup(state => {
      state.players[0]!.occupationPlayed = []
      state.players[0]!.occupationHand = [COOK]
      state.players[0]!.minorPlayed = [ORIENTAL]
    })
    expect(bonus(session.getState())).toBe(0)
  })
})

describe("A101 command boundaries", () => {
    const COOK = 'A101_CookeryOutfitter';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, played = true, owner = 0) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 14;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 15, clay: 5, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                const player = state.players[owner]!;
                player.occupationPlayed = played ? [COOK] : [];
                player.occupationHand = played ? ['__test_placeholder__'] : [COOK];
                configure(state);
                for (const player of state.players)
                    for (const card of player.improvements)
                        takeMajorImprovementFromSupply(state, card);
            } }));
        assert.equal(session.getState().state.players.length, 2);
        return session;
    }
    function bonus(response: SessionResponse, card: string, owner = 0) {
        assert.ok(response.scores);
        return response.scores[owner]!.categories.find(category => category.key === 'cardBonusVp')?.entries
            .filter(entry => entry.type === 'bonus' && entry.cardId === card).reduce((sum, entry) => sum + entry.score, 0) ?? 0;
    }
    function choices(response: SessionResponse) {
        assert.ok(response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice', JSON.stringify(response.interaction));
        return getChoiceOptions(response);
    }
    function complete(session: GameSession, response: SessionResponse) {
        for (let n = 0; n < 5 && response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice'; n++) {
            const option = choices(response).find(option => option.value === '__done__' || option.value === '__skip__');
            assert.ok(option, JSON.stringify(response.interaction));
            response = ok(session.resolveChoice(response.interaction.playerIndex, option.value));
        }
        return response;
    }
    it("no cooking card and ovens alone award no cooking points", () => {
        for (const cards of [[], ['Major_ClayOven'], ['Major_ClayOven', 'Major_StoneOven']]) {
            const response = setup(state => state.players[0]!.improvements = cards).getState();
            assert.equal(bonus(response, COOK), 0);
            save(`A101-N1-${cards.length}`, response);
        }
    });
    it("distinct fireplaces and cooking hearths each count once", () => {
        const response = setup(state => state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2']).getState();
        assert.equal(bonus(response, COOK), 4);
        save('A101-N2', response);
    });
    it("a cooking minor counts once alongside a major while ovens are excluded", () => {
        const session = setup(state => { state.players[0]!.minorPlayed = ['A060_OrientalFireplace']; state.players[0]!.improvements = ['Major_CookingHearth1', 'Major_ClayOven']; });
        const response = session.getState();
        const actual = { bonus: bonus(response, COOK), minors: response.state.players[0]!.minorPlayed, majors: response.state.players[0]!.improvements };
        save('A101-N3', { actual, response });
        assert.deepEqual(actual, { bonus: 2, minors: ['A060_OrientalFireplace'], majors: ['Major_CookingHearth1', 'Major_ClayOven'] });
    });
    it("card in hand and opponent cookery do not grant owner points", () => {
        const config = (state: GameState) => { state.players[0]!.improvements = ['Major_Fireplace1']; state.players[1]!.improvements = ['Major_CookingHearth1']; };
        assert.equal(bonus(setup(config, false).getState(), COOK), 0);
        const response = setup(config, true, 1).getState();
        assert.equal(bonus(response, COOK), 0);
        assert.equal(bonus(response, COOK, 1), 1);
        save('A101-N4', response);
    });
    it("real major purchase pays printed cost and undo removes only its cooking bonus", () => {
        const session = setup();
        const undoInteraction = JSON.stringify(session.getState().interaction);
        let response = ok(session.takeAction(0, 'major-improvement'));
        if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice') {
            const option = choices(response).find(option => option.value.startsWith('action-improvement-'));
            if (option)
                response = ok(session.resolveChoice(0, option.value));
        }
        assert.ok(choices(response).some(option => option.value === 'Major_Fireplace1' && !option.disabled));
        response = ok(session.resolveChoice(0, 'Major_Fireplace1'));
        response = complete(session, response);
        assert.equal(response.state.players[0]!.resources.clay, 3);
        assert.equal(bonus(response, COOK), 1);
        const undone = ok(session.undoAction());
        assert.equal(JSON.stringify(undone.interaction), undoInteraction);
        assert.equal(undone.interaction.stateId, 'idle');
        assert.equal(undone.state.currentPlayerIndex, 0);
        assert.equal(undone.state.players[0]!.resources.clay, 5);
        assert.equal(bonus(undone, COOK), 0);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A101-N5', { response, undone });
    });
    it("repeated score reads cannot duplicate cooking points or mutate rule state", () => {
        const session = setup(state => state.players[0]!.improvements = ['Major_Fireplace1']);
        const before = JSON.stringify(session.getState().state);
        for (let n = 0; n < 3; n++)
            assert.equal(bonus(session.getState(), COOK), 1);
        assert.equal(JSON.stringify(session.getState().state), before);
        save('A101-N6', session.getState());
    });
    it("real Oriental Fireplace purchase preserves one cooking point when returning a Fireplace", () => {
        const session = setup(state => {
            state.players[0]!.improvements = ['Major_Fireplace1'];
            state.players[0]!.minorHand = ['A060_OrientalFireplace'];
        });
        assert.equal(bonus(session.getState(), COOK), 1);
        let response = ok(session.takeAction(0, 'meeting-place'));
        const branch = choices(response).find(option => option.value.startsWith('action-improvement-'));
        if (branch)
            response = ok(session.resolveChoice(0, branch.value));
        save('A101-N7-before-purchase', response);
        if (response.state.players[0]!.minorHand.includes('A060_OrientalFireplace') && choices(response).some(option => option.value === 'A060_OrientalFireplace'))
            response = ok(session.resolveChoice(0, 'A060_OrientalFireplace'));
        if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice' && response.interaction.promptKey === 'prompt.selectPayment') {
            const payment = choices(response).find(option => JSON.stringify(option).includes('Major_Fireplace1'));
            assert.ok(payment);
            response = ok(session.resolveChoice(0, payment.value));
        }
        assert.ok(response.state.players[0]!.minorPlayed.includes('A060_OrientalFireplace'));
        assert.equal(response.state.players[0]!.improvements.includes('Major_Fireplace1'), false);
        assert.equal(response.state.players[0]!.resources.food, 40);
        const actual = { bonus: bonus(response, COOK), orientalPlayed: true, returnedFireplace: true };
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A101-N7', { actual, response });
        assert.deepEqual(actual, { bonus: 1, orientalPlayed: true, returnedFireplace: true });
    });
});
