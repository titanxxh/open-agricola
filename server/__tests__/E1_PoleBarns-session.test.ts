import { expectWait } from './_helpers/trigger-select'
import { type SessionResponse, GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { describe, expect, it } from 'vitest'
import { E001_PoleBarns } from '../../shared/cards/E/E001_PoleBarns'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { type FenceSegment, type GameState } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions, expectTileFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const poleFenceEdges = ['H-0-1', 'H-0-2', 'H-0-3', 'H-2-1', 'H-2-2', 'H-2-3', 'V-0-1', 'V-1-1', 'V-0-4', 'V-1-4', 'V-0-2', 'V-1-2', 'V-0-3', 'V-1-3', 'H-1-1']
const preparePoleFarm = (player: GameState['players'][number], ordinaryFences = 15, palisades = 0) => {
  assert.ok(ordinaryFences + palisades === 14 || ordinaryFences + palisades === 15)
  player.fenceSegments = [
    ...poleFenceEdges.slice(0, ordinaryFences).map((edge): FenceSegment => ({ edge, type: 'fence' })),
    ...poleFenceEdges.slice(ordinaryFences, ordinaryFences + palisades).map((edge): FenceSegment => ({ edge, type: 'palisade' })),
  ]
  const tiles = ordinaryFences + palisades === 15
    ? [[{ row: 0, col: 1 }], [{ row: 1, col: 1 }], [{ row: 0, col: 2 }, { row: 1, col: 2 }], [{ row: 0, col: 3 }, { row: 1, col: 3 }]]
    : [[{ row: 0, col: 1 }, { row: 1, col: 1 }], [{ row: 0, col: 2 }, { row: 1, col: 2 }], [{ row: 0, col: 3 }, { row: 1, col: 3 }]]
  player.pastures = tiles.map((tiles, index) => ({ id: `pole-${index}`, tiles, animalType: null, animalCount: 0 }))
}

describe('E001_PoleBarns prerequisite', () => {
  it('blocks when player has fewer than 15 fence segments on board', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    const player = state.players[0]!
    preparePoleFarm(player, 14, 1)
    expect(session.withCtx(() => meetsCardPrerequisites(player, E001_PoleBarns, state.round, state))).toBe(false)
  })

  it('does not count Wood Palisades toward the 15-fence prerequisite', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = [
      ...Array.from({ length: 14 }, (_, i): FenceSegment => ({
        edge: `H-0-${i}`,
        type: 'fence',
      })),
      { edge: 'V-0-0', type: 'palisade' },
    ]
    expect(session.withCtx(() => meetsCardPrerequisites(player, E001_PoleBarns, state.round, state))).toBe(false)
  })

  it('allows when player has 15 fence segments on board', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    const player = state.players[0]!
    preparePoleFarm(player)
    expect(session.withCtx(() => meetsCardPrerequisites(player, E001_PoleBarns, state.round, state))).toBe(true)
  })
})

describe('E001 Pole Barns parity', () => {
  const CARD_ID = 'E001_PoleBarns'

  const FILLER = '__test_placeholder__'

  const setup = ({
    ordinaryFences = 15, palisades = 0, stablesOnBoard = 0,
  } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6001, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.pastures = []
      player.fenceSegments = []
      player.stableTiles = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: index === 0 ? 2 : 0, clay: 0, reed: 0, stone: 0,
        food: index === 0 ? 0 : 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.minorHand = [CARD_ID]
    preparePoleFarm(owner, ordinaryFences, palisades)
    owner.stableTiles = Array.from({ length: stablesOnBoard }, (_, index) => ({
      row: 2, col: index + 2,
    }))
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? getChoiceOptions(response) ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
    return response
  }

  const play = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const acceptStableBuild = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }

  it('E001 S1: fourteen ordinary fences do not allow Pole Barns to be played', () => {
    const response = enterMinor(setup({ ordinaryFences: 14 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('E001 S2: a Wood Palisade does not complete the fifteen-fence prerequisite', () => {
    const response = enterMinor(setup({ ordinaryFences: 14, palisades: 1 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('E001 S3: fifteen ordinary fences and two wood play Pole Barns and build three free stables', () => {
    const session = setup()
    let response = acceptStableBuild(session, play(session))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (response.interaction.stateId !== 'wait') return
    const stables = expectTileFarmSelection(response, 'stable').selectableTiles.slice(0, 3)
    expect(stables).toHaveLength(3)

    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.stableTiles).toHaveLength(3)
  })

  it('E001 S4: the free stable action may be declined', () => {
    const session = setup()
    const offered = play(session)
    expect(options(offered).some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(expectWait(offered).interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
  })

  it('E001 S5: the free stable limit is capped by the one stable left in supply', () => {
    const session = setup({ stablesOnBoard: 3 })
    expect(session.getState().state.players[0]!.stableTiles).toHaveLength(3)
    let response = acceptStableBuild(session, play(session))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (response.interaction.stateId !== 'wait') return
    const farm = expectTileFarmSelection(response, 'stable')
    assert.ok(farm.farmType === 'stable')
    expect(farm.maxSelections).toBe(1)
    const stable = farm.selectableTiles[0]!

    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(4)
  })
})

describe("E001 command boundaries", () => {
    const POLE = 'E001_PoleBarns';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
    function setup(wood: number, configure: (state: GameState) => void = () => { }) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 14;
                for (const p of state.players)
                    Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.resources.wood = wood;
                state.players[0]!.minorHand = [POLE, 'A030_BakingSheet', 'A016_RammedClay'];
                configure(state);
            } }));
        return session;
    }
    function enterMinor(session: GameSession) {
        let r = ok(session.takeAction(0, 'meeting-place'));
        assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice');
        const action = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'));
        assert.ok(action, JSON.stringify(r.interaction));
        r = ok(session.resolveChoice(0, action.value));
        return r;
    }
    function buy(session: GameSession, card: string) {
        let r = enterMinor(session);
        if (r.state.players[0]!.minorHand.includes(card)) {
            assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice', JSON.stringify(r.interaction));
            const option = getChoiceOptions(r).find(o => o.value === card);
            assert.ok(option, JSON.stringify(r.interaction));
            r = ok(session.resolveChoice(0, option.value));
        }
        assert(r.state.players[1]!.minorHand.includes(card));
        return r;
    }
    function optional(session: GameSession, r: SessionResponse, accept: boolean) {
        assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice', JSON.stringify(r.interaction));
        const option = getChoiceOptions(r).find(o => accept ? o.sourceCard === POLE && o.labelKey === 'actions.stables.name' : o.value === '__skip__');
        assert.ok(option);
        return ok(session.resolveChoice(0, option.value));
    }
    function pole(state: GameState, count = 15, actor = 0) { preparePoleFarm(state.players[actor]!, count); }
    it("fifteen own fences and two wood allow up to three free stables and passing", () => {
        const session = setup(2, state => pole(state));
        let pending = buy(session, POLE);
        pending = optional(session, pending, true);
        assert.ok(pending.interaction.stateId === 'wait' && expectWait(pending).interaction.request.kind === 'farm-select');
        const r = ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }] }));
        assert.equal(r.state.players[0]!.stableTiles.length, 3);
        assert.equal(r.state.players[0]!.resources.wood, 0);
        assert.equal(r.state.players[0]!.fenceSegments.length, 15);
        assert(r.state.players[1]!.minorHand.includes(POLE));
        assert.ok(r.interaction.stateId === 'wait');
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(r.interaction.playerIndex, 0);
        assert.equal(r.state.currentPlayerIndex, 0);
        save('E001-N1', r);
    });
    it("fourteen fences opponent fences and insufficient card wood cannot buy", () => {
        for (const [count, actor, wood] of [[14, 0, 2], [15, 1, 2], [15, 0, 1]]) {
            const session = setup(wood!, state => pole(state, count, actor));
            const r = enterMinor(session);
            assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice', JSON.stringify(r.interaction));
            assert(!getChoiceOptions(r).some(o => o.value === POLE && !o.disabled));
            assertRejectedUnchanged(session, () => session.resolveChoice(0, POLE));
            const legal = ok(session.resolveChoice(0, 'A030_BakingSheet'));
            assert.equal(legal.state.players[0]!.resources.wood, wood);
            assert.equal(legal.state.players[0]!.stableTiles.length, 0);
            assert.ok(legal.interaction.stateId === 'wait');
            assert.deepEqual(legal.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
            assert.equal(legal.interaction.playerIndex, 0);
            assert.equal(legal.state.currentPlayerIndex, 0);
            save(`E001-N2-${count}-${actor}-${wood}`, legal);
        }
    });
    it("illegal four targets bad tiles and stock overflow reject before remaining legal stable", () => {
        const session = setup(2, state => { pole(state); state.players[0]!.stableTiles = [{ row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }]; });
        let pending = buy(session, POLE);
        pending = optional(session, pending, true);
        for (const stables of [[{ row: 0, col: 1 }, { row: 0, col: 2 }], [{ row: 1, col: 0 }], [{ row: 99, col: 99 }], [{ row: 2, col: 1 }]])
            assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables }));
        const r = ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }));
        assert.equal(r.state.players[0]!.stableTiles.length, 4);
        assert.equal(r.state.players[0]!.resources.wood, 0);
        assert.ok(r.interaction.stateId === 'wait');
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(r.interaction.playerIndex, 0);
        assert.equal(r.state.currentPlayerIndex, 0);
        save('E001-N3', r);
    });
    it("decline and whole undo preserve fences and restore stable cost and passing", () => {
        const session = setup(2, state => pole(state));
        const undoInteraction = JSON.stringify(session.getState().interaction);
        const pending = buy(session, POLE);
        const r = optional(session, pending, false);
        assert.equal(r.state.players[0]!.stableTiles.length, 0);
        assert.equal(r.state.players[0]!.resources.wood, 0);
        const undone = ok(session.undoAction());
        assert.equal(JSON.stringify(undone.interaction), undoInteraction);
        assert.equal(undone.interaction.stateId, 'idle');
        assert.equal(undone.state.currentPlayerIndex, 0);
        assert.equal(undone.state.players[0]!.resources.wood, 2);
        assert.equal(undone.state.players[0]!.fenceSegments.length, 15);
        assert(undone.state.players[0]!.minorHand.includes(POLE));
        assert(!undone.state.players[1]!.minorHand.includes(POLE));
        assert.ok(r.interaction.stateId === 'wait');
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(r.state.currentPlayerIndex, 0);
        save('E001-N4', { r, undone });
    });
});
