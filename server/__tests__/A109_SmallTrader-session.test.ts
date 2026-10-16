import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A030_BakingSheet'
import '../../shared/cards/A/A109_SmallTrader'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A109_SmallTrader'

const MINOR_ID = 'A030_BakingSheet'

const MAJOR_ID = 'Major_Fireplace1'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, clay = 0 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5109, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    player.resources.clay = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.minorHand = played ? [MINOR_ID] : [FILLER]
  owner.resources.clay = clay
  state.availableMajorImprovements = [MAJOR_ID]
  session.loadState(state)
  return session
}

const chooseCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  for (let step = 0; step < 3; step += 1) {
    const player = response.state.players[0]!
    if (player.minorPlayed.includes(cardId)
      || player.occupationPlayed.includes(cardId)
      || player.improvements.includes(cardId)) return response
    if (response.interaction.stateId !== 'wait') return response
    const option = getChoiceOptions(response)?.find((candidate) =>
      candidate.value === cardId || candidate.value.startsWith('action-improvement-'))
    if (!option) return response
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  return response
}

describe('A109 Small Trader parity', () => {
  it('A109 S1: Small Trader is played as the first occupation without paying food', () => {
    const session = setup({ played: false })
    const response = chooseCard(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A109 S2: playing a minor from hand with Major or Minor Improvement gains three food', () => {
    const session = setup()
    const response = chooseCard(session, session.takeAction(0, 'major-improvement'), MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_ID)
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

  it('A109 S3: taking a major improvement from the board grants no Small Trader food', () => {
    const session = setup({ clay: 2 })
    const response = chooseCard(session, session.takeAction(0, 'major-improvement'), MAJOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0 })
  })

  it('A109 S4: Meeting Place minor improvements do not grant Small Trader food', () => {
    const session = setup()
    const response = chooseCard(session, session.takeAction(0, 'meeting-place'), MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
  it('rewards a minor played through a card-granted major-or-minor action', () => {
    const session = setup()
    const state = session.state
    const owner = state.players[0]!
    owner.minorPlayed = ['A023_StoneCompany']
    owner.minorHand = ['E047_SyrupTap']
    owner.resources.wood = 1
    state.availableMajorImprovements = []
    state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 1
    session.loadState(state)
    let response = session.takeAction(0, 'western-quarry')
    for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
      const options = getChoiceOptions(response) ?? []
      const option = options.find((candidate) => candidate.value === 'A023_StoneCompany')
        ?? options.find((candidate) => candidate.value === 'E047_SyrupTap')
        ?? options.find((candidate) => candidate.value !== '__skip__' && candidate.value !== 'confirm')
      if (!option) break
      response = session.resolveChoice(0, option.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

})

describe("A109 command boundaries", () => {
    const TRADER = 'A109_SmallTrader', MINOR = 'A030_BakingSheet', PAID = 'A037_Bucksaw', MAJOR = 'Major_Fireplace1';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
    function setup(configure: (state: GameState) => void = () => { }, played = true) { const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) { state.round = 14; for (const p of state.players) {
            Object.assign(p.resources, { food: 40, wood: 1, clay: 2, reed: 0, stone: 0, grain: 0, vegetable: 0 });
            p.minorHand = [MINOR, PAID];
        } state.players[0]!.occupationPlayed = played ? [TRADER] : []; state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [TRADER]; state.availableMajorImprovements = [MAJOR]; configure(state); } })); return s; }
    function enter(s: GameSession, space: string, actor = 0) { let r = ok(s.takeAction(actor, space)); if (r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice') {
        const action = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'));
        if (action)
            r = ok(s.resolveChoice(actor, action.value));
    } return r; }
    function select(s: GameSession, initial: SessionResponse, card: string, actor = 0) {
      let r = initial
      for (let step = 0; step < 8; step++) {
        if (r.state.players[actor]!.minorPlayed.includes(card) || r.state.players[actor]!.improvements.includes(card)) return r
        assert.ok(r.interaction.stateId === 'wait')
        const request = r.interaction.request
        assert.ok(request.kind === 'choice' || request.kind === 'select-trigger', JSON.stringify(r.interaction))
        const options = getChoiceOptions(r)
        const target = options.find(option => option.value === card || option.value === `major:${card}` || option.value === `minor:${card}`)
        if (target) {
          assert.equal(target.disabled ?? false, false)
          r = ok(s.resolveChoice(actor, target.value))
        } else if (request.kind === 'select-trigger') {
          const stoneCompany = options.find(option => option.value === 'A023_StoneCompany')
          assert.ok(stoneCompany, JSON.stringify(r.interaction))
          assert.equal(stoneCompany.disabled ?? false, false)
          r = ok(s.resolveChoice(actor, stoneCompany.value))
        } else {
          assert.equal(r.interaction.sourceCard, 'A023_StoneCompany')
          const improvements = options.filter(option => option.sourceCard === 'A023_StoneCompany' && option.labelKey === 'actions.improvement.name')
          assert.equal(improvements.length, 1, JSON.stringify(r.interaction))
          const improvement = improvements[0]!
          assert.equal(improvement.disabled ?? false, false)
          r = ok(s.resolveChoice(actor, improvement.value))
        }
      }
      throw new Error(`The explicit purchase did not finish for ${card}`)
    }
    it("literal major or minor paid hand purchase rewards three food exactly once", () => { const s = setup(); const r = select(s, enter(s, 'major-improvement'), PAID); assert(r.state.players[0]!.minorPlayed.includes(PAID)); assert.equal(r.state.players[0]!.resources.food, 43); assert.equal(r.state.players[0]!.resources.wood, 0); assertRejectedUnchanged(s, () => s.resolveChoice(0, PAID)); save('A109-N1', r); });
    it("board major and minor only Meeting Place do not grant trader food", () => { for (const [space, card] of [['major-improvement', MAJOR], ['meeting-place', MINOR]]) {
        const s = setup();
        const r = select(s, enter(s, space!), card!);
        assert.equal(r.state.players[0]!.resources.food, 40);
        if (card === MAJOR)
            assert.equal(r.state.players[0]!.resources.clay, 0);
        assert.ok(r.interaction.stateId === 'wait');
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(r.state.currentPlayerIndex, 0);
        save(`A109-N2-${space}`, r);
    } });
    it("unaffordable wrong actor and invalid purchase reject before legal hand reward", () => { const s = setup(state => state.players[0]!.resources.wood = 0); const pending = enter(s, 'major-improvement'); for (const [actor, card] of [[0, PAID], [1, MINOR], [0, '__invented_card__']] as const)
        assertRejectedUnchanged(s, () => s.resolveChoice(actor, card)); const r = select(s, pending, MINOR); assert.equal(r.state.players[0]!.resources.food, 43); assert.equal(r.state.players[0]!.resources.wood, 0); save('A109-N3', r); });
    it("card granted major or minor rewards but optional decline does not", () => { for (const accept of [true, false]) {
        const s = setup(state => { state.players[0]!.minorPlayed = ['A023_StoneCompany']; state.players[0]!.minorHand = ['E047_SyrupTap']; state.actionSpaces.find(a => a.id === 'western-quarry')!.resources.stone = 1; });
        let r = ok(s.takeAction(0, 'western-quarry'));
        if (accept)
            r = select(s, r, 'E047_SyrupTap');
        else {
            for (let n = 0; n < 5 && r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind !== 'confirm-next-player'; n++) {
                assert.ok(expectWait(r).interaction.request.kind === 'choice' || expectWait(r).interaction.request.kind === 'select-trigger');
                const o = getChoiceOptions(r).find(o => o.value === '__skip__') ?? getChoiceOptions(r).find(o => o.value === 'A023_StoneCompany');
                assert.ok(o, JSON.stringify(r.interaction));
                r = ok(s.resolveChoice(0, o.value));
            }
        }
        assert.equal(r.state.players[0]!.resources.food, accept ? 43 : 40);
        assert.ok(r.interaction.stateId === 'wait');
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(r.state.currentPlayerIndex, 0);
        save(`A109-N4-${accept}`, r);
    } });
    it("unplayed and opponent purchase cannot reward the owner", () => { const s = setup(undefined, false); const unplayed = select(s, enter(s, 'major-improvement'), MINOR); assert.equal(unplayed.state.players[0]!.resources.food, 40); const other = setup(); confirmNext(other, ok(other.takeAction(0, 'grain-seeds'))); const r = select(other, enter(other, 'major-improvement', 1), MINOR, 1); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(r.state.players[1]!.resources.food, 40); assert.ok(unplayed.interaction.stateId === 'wait');
        assert.deepEqual(unplayed.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(unplayed.state.currentPlayerIndex, 0);
        assert.ok(r.interaction.stateId === 'wait');
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 });
        assert.equal(r.state.currentPlayerIndex, 1);
        save('A109-N5', { r, unplayed }); });
    it("whole action undo restores cost card and reward before exactly one retry", () => { const s = setup(); const bought = select(s, enter(s, 'major-improvement'), PAID); const undone = ok(s.undoAction()); assert.equal(undone.state.players[0]!.resources.food, 40); assert.equal(undone.state.players[0]!.resources.wood, 1); assert(undone.state.players[0]!.minorHand.includes(PAID)); const r = select(s, enter(s, 'major-improvement'), PAID); assert.equal(r.state.players[0]!.resources.food, 43); assert.equal(r.state.players[0]!.resources.wood, 0); save('A109-N6', { bought, undone, r }); });
});
