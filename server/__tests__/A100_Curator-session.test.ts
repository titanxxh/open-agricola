import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A100_Curator'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A100_Curator'

const FILLER = '__test_placeholder__'

const ACCUMULATION = ['forest', 'clay-pit', 'reed-bank'] as const

const setup = ({
  played = true,
  food = 1,
  spaces = [...ACCUMULATION],
  remainingResources = false,
}: { played?: boolean; food?: number; spaces?: string[]; remainingResources?: boolean } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5100, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = played ? 3 : 14
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = index === 0 ? food : 20
    if (played || index !== 0) markAllWorkersUsed(state, player)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  if (!played) setWorkersAtHome(state, player, 2)
  if (played) {
    setActiveWorkerCount(player, spaces.length)
    state.actionSpaces.forEach((space) => {
      space.takenBy = space.takenBy.filter((worker) => worker.playerId !== player.id)
    })
    spaces.forEach((spaceId, index) => {
      const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
      const worker = player.workers.filter((candidate) => candidate.isActive)[index]
      if (!space || !worker) throw new Error(`missing Curator setup ${spaceId}`)
      space.takenBy.push({ playerId: player.id, workerId: worker.id })
    })
    const resourceBySpace = { forest: 'wood', 'clay-pit': 'clay', 'reed-bank': 'reed' } as const
    for (const spaceId of ACCUMULATION) {
      const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
      space.resources[resourceBySpace[spaceId]] = remainingResources ? 1 : 0
    }
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const acceptCurator = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) =>
    candidate.sourceCard === CARD_ID && candidate.value !== '__skip__')
    ?? getChoiceOptions(response)?.find((candidate) => candidate.value !== '__skip__')
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0

describe('A100 Curator parity', () => {
  it('A100 S1: Curator is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false, food: 0, spaces: [] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A100 S2: three people returning from emptied accumulation spaces still qualify', () => {
    const session = setup({ food: 1, remainingResources: false })
    const response = acceptCurator(session, session.performRoundEnd())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(bonusVp(response)).toBe(1)
  })

  it('counts three people returning from two accumulation spaces', () => {
    const session = setup({ spaces: ['forest', 'forest', 'clay-pit'] })
    const response = acceptCurator(session, session.performRoundEnd())
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(bonusVp(response)).toBe(1)
  })

  it('A100 S3: with resources remaining on three used accumulation spaces the point can be bought', () => {
    const session = setup({ food: 1, remainingResources: true })

    const response = acceptCurator(session, session.performRoundEnd())

    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(bonusVp(response)).toBe(1)
  })

  it('A100 S4: the bonus-point purchase may be declined', () => {
    const session = setup({ food: 1, remainingResources: true })
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(bonusVp(response)).toBe(0)
  })

  it('A100 S5: two accumulation spaces plus one non-accumulation space do not qualify', () => {
    const response = setup({
      food: 1,
      spaces: ['forest', 'clay-pit', 'farmland'],
      remainingResources: true,
    }).performRoundEnd()

    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(bonusVp(response)).toBe(0)
  })

  it('A100 S6: with no food three accumulation spaces offer no purchase', () => {
    const response = setup({ food: 0, remainingResources: true }).performRoundEnd()

    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(bonusVp(response)).toBe(0)
    expect(response.interaction.stateId === 'wait'
      ? (getChoiceOptions(response)?.some((option) => option.sourceCard === CARD_ID) ?? false)
      : false).toBe(false)
  })
})

describe("A100 command boundaries", () => {
    const CURATOR = 'A100_Curator';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, played = true) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 3;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                const player = state.players[0]!;
                player.occupationPlayed = played ? [CURATOR] : [];
                player.occupationHand = played ? ['__test_placeholder__'] : [CURATOR];
                configure(state);
            } }));
        return session;
    }
    function ready(session: GameSession, actor: number) { let response = session.getState(); if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'confirm-next-player')
        response = confirmNext(session, response); assert.equal(response.interaction.stateId, 'idle'); assert.equal(response.state.currentPlayerIndex, actor); }
    function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)); }
    function choices(response: SessionResponse) { assert.ok(response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice', JSON.stringify(response.interaction)); return getChoiceOptions(response); }
    function curator({ people = 3, food = 20, played = true }: {
        people?: number;
        food?: number;
        played?: boolean;
    } = {}) {
        return setup(state => { const p = state.players[0]!; setActiveWorkerCount(p, people); p.roomTiles.push({ row: 0, col: 0 }); p.rooms = 3; p.resources.food = food; }, played);
    }
    function finishCurator(session: GameSession, last = 'reed-bank') {
        turn(session, 0, 'forest');
        turn(session, 1, 'grain-seeds');
        turn(session, 0, 'clay-pit');
        turn(session, 1, 'day-laborer');
        const response = session.getState();
        if (workersAvailable(response.state, response.state.players[0]!) <= 0)
            return response;
        let lastResponse = turn(session, 0, last);
        if (last === 'farmland')
            lastResponse = ok(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }));
        return confirmNext(session, lastResponse);
    }
    function curatorChoice(session: GameSession, response: SessionResponse, accept: boolean) {
        for (let n = 0; n < 4 && response.interaction.stateId === 'wait'; n++) {
            if (expectWait(response).interaction.request.kind === 'select-trigger')
                response = ok(session.resolveChoice(0, CURATOR));
            else if (expectWait(response).interaction.request.kind === 'choice') {
                const matching = choices(response).filter(o => accept ? o.sourceCard === CURATOR && o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesPaid?.food === 1 && o.effectPreview.bonusVp === 1 : o.value === '__skip__');
                assert.equal(matching.length, 1, JSON.stringify(response.interaction));
                const option = matching[0];
                assert.ok(option);
                response = ok(session.resolveChoice(0, option.value));
            }
            else
                break;
        }
        return response;
    }
    function bonus(response: SessionResponse) { assert.ok(response.scores); const ownerScore = response.scores[0]; assert.ok(ownerScore); return ownerScore.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => e.type === 'bonus' && e.cardId === CURATOR).reduce((sum, e) => sum + e.score, 0) ?? 0; }
    it("three actual returning people from emptied accumulation spaces may pay one food for one point", () => {
        const session = curator();
        const pending = finishCurator(session);
        assert.ok(pending.interaction.stateId === 'wait');
        const response = curatorChoice(session, pending, true);
        assert.equal(response.state.players[0]!.resources.food, 19);
        assert.equal(bonus(response), 1);
        assert.equal(response.state.round, 4);
        assert.equal(response.interaction.stateId, 'idle');
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A100-N1', response);
    });
    it("declining preserves the food and gives no point", () => {
        const session = curator();
        const response = curatorChoice(session, finishCurator(session), false);
        assert.equal(response.state.players[0]!.resources.food, 20);
        assert.equal(bonus(response), 0);
        assert.equal(response.state.round, 4);
        assert.equal(response.interaction.stateId, 'idle');
        assert.equal(response.state.roundPhase, 'work');
        save('A100-N2', response);
    });
    it("two accumulation workers plus a nonaccumulation worker cannot qualify", () => {
        const session = curator();
        const response = finishCurator(session, 'farmland');
        assert.equal(response.state.players[0]!.resources.food, 20);
        assert.equal(bonus(response), 0);
        assert.equal(response.state.round, 4);
        assert.equal(response.interaction.stateId, 'idle');
        assert.equal(response.state.roundPhase, 'work');
        save('A100-N3', response);
    });
    it("no food and card in hand cannot buy a free return home point", () => {
        for (const config of [{ food: 0 }, { played: false }]) {
            const session = curator(config);
            const response = finishCurator(session);
            assert.equal(bonus(response), 0);
            assert.equal(response.state.round, 4);
            assert.equal(response.state.players[0]!.resources.food, config.food ?? 20);
            assert.equal(response.interaction.stateId, 'idle');
        assert.equal(response.state.roundPhase, 'work');
        save(`A100-N4-${config.food ?? 'hand'}`, response);
        }
    });
    it("wrong actor and stale accepted response cannot duplicate food payment or score", () => {
        const session = curator();
        const pending = finishCurator(session);
        const option = choices(pending).find(o => o.sourceCard === CURATOR && o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesPaid?.food === 1 && o.effectPreview.bonusVp === 1);
        assert.ok(option);
        assertRejectedUnchanged(session, () => session.resolveChoice(1, option.value));
        const response = curatorChoice(session, pending, true);
        assertRejectedUnchanged(session, () => session.resolveChoice(0, option.value));
        assert.equal(bonus(response), 1);
        assert.equal(response.state.players[0]!.resources.food, 19);
        assert.equal(response.interaction.stateId, 'idle');
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A100-N5', response);
    });
});
