import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit12Replacement from './_helpers/audit/ae-negative-12-replacement'

const CUTTER = 'A116_WoodCutter', BAKER = 'C107_Baker', MILLER = 'E095_Miller', FIREPLACE = 'Major_Fireplace1'

describe('A097 once between the owner\'s own Turns', () => {
  const { FRESH, OCC, sessions, ok, setup, turn, options, replacement } = audit12Replacement
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  // Round 4 ends with a harvest; P0 owns Freshman, a Fireplace, 1 grain and two occupations in hand.
  const between = (cards: string[]) => setup(FRESH, state => {
    const owner = state.players[0]!
    owner.occupationPlayed.push(...cards)
    owner.occupationHand = [OCC, CUTTER]
    owner.improvements = [FIREPLACE]
    owner.resources.grain = 1
    state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== FIREPLACE)
  }, 4)
  /** Confirms player switches, turn hand-offs and feeding until a card choice or idle. */
  const settle = (session: GameSession, response: SessionResponse) => {
    for (let step = 0; step < 12 && response.interaction.stateId === 'wait'; step++) {
      const { request, playerIndex } = response.interaction
      if (request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
      else if (request.kind === 'confirm-next-player') response = ok(session.resolveChoice(request.nextPlayerIndex, 'confirm'))
      else if (request.kind === 'feed') response = ok(session.resolveChoice(playerIndex, 'confirm', { selections: [] }))
      else break
    }
    return response
  }
  const playFree = (session: GameSession, response: SessionResponse, card: string) => {
    response = replacement(session, response, FRESH)
    // A single playable occupation is played without a choice.
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') response = ok(session.resolveChoice(0, card))
    assert.ok(response.state.players[0]!.occupationPlayed.includes(card), JSON.stringify(response.interaction))
    return response
  }
  const freshmanOffered = (response: SessionResponse) => options(response).some(option => option.sourceCard === FRESH)
  const playedFreeOccupations = (response: SessionResponse) => response.state.events
    .filter(event => event.type === 'card.played' && [OCC, CUTTER].includes(event.cardId)).length

  it('A097 W1 one replacement covers the opponent Turn and the harvest; the next own Turn renews it', () => {
    const session = between([MILLER, BAKER])
    turn(session, 0, 'day-laborer'); turn(session, 1, 'clay-pit'); turn(session, 0, 'fishing')
    // P1's Grain Seeds gives P0 a Miller Bake Bread after P0's last Turn of the round.
    let response = settle(session, turn(session, 1, 'grain-seeds'))
    assert.equal(response.state.currentPlayerIndex, 1)
    response = playFree(session, response, OCC)
    assert.ok(response.state.players[0]!.occupationPlayed.includes(OCC))
    assert.equal(response.state.players[0]!.resources.grain, 1)
    assert.equal(response.state.players[0]!.resources.food, 43)
    // C107 Baker's harvest Bake Bread is in the same stretch: only the ordinary bake is left.
    response = settle(session, response)
    assert.equal(response.state.roundPhase, 'feeding')
    assert.equal(freshmanOffered(response), false, JSON.stringify(response.interaction))
    assert.equal(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined, BAKER)
    response = ok(session.resolveChoice(0, options(response).find(option => option.value !== '__skip__')!.value))
    for (let step = 0; step < 3 && response.interaction.stateId === 'wait' && response.interaction.promptKey?.startsWith('ui.interactionBakeBread'); step++) {
      response = ok(session.resolveChoice(0, options(response).find(option => option.value === FIREPLACE || option.value === `count-${FIREPLACE}-1`)!.value))
    }
    response = settle(session, response)
    assert.deepEqual([response.state.round, response.state.roundPhase, response.interaction.stateId], [5, 'work', 'idle'])
    // The Fireplace baked the grain (+2 food) and feeding took 4.
    assert.deepEqual([response.state.players[0]!.resources.grain, response.state.players[0]!.resources.food], [0, 41])
    assert.ok(response.state.players[0]!.occupationHand.includes(CUTTER))
    // Without grain or a field, only Freshman makes Grain Utilization usable in P0's next Turn.
    assert.equal(session.getActionAvailability(0)['grain-utilization'], true)
    response = playFree(session, turn(session, 0, 'grain-utilization'), CUTTER)
    assert.ok(response.state.players[0]!.occupationPlayed.includes(CUTTER))
    assert.equal(response.state.players[0]!.resources.food, 41)
    assert.equal(playedFreeOccupations(response), 2)
  }, 30_000)

  it('A097 W2 a replacement in the owner\'s last Turn leaves one for the following harvest', () => {
    const session = between([BAKER])
    turn(session, 0, 'day-laborer'); turn(session, 1, 'clay-pit')
    // Grain Utilization could bake the grain, but P0 takes Freshman in its last Turn of the round.
    let response = playFree(session, turn(session, 0, 'grain-utilization'), OCC)
    assert.equal(response.state.players[0]!.resources.grain, 1)
    response = settle(session, turn(session, 1, 'reed-bank'))
    assert.equal(response.state.roundPhase, 'feeding')
    assert.equal(freshmanOffered(response), true, JSON.stringify(response.interaction))
    response = settle(session, playFree(session, response, CUTTER))
    assert.deepEqual([response.state.round, response.state.roundPhase, response.interaction.stateId], [5, 'work', 'idle'])
    // Both occupations were free; the grain was never baked and feeding took 4 food.
    assert.deepEqual([response.state.players[0]!.resources.grain, response.state.players[0]!.resources.food], [1, 38])
    assert.equal(playedFreeOccupations(response), 2)
  }, 30_000)
})

describe('ae-negative-12-replacement', () => {
  const { FRESH, OCC, sessions, save, ok, setup, turn, replacement } = audit12Replacement
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('A097 N1 grainless Bake replacement plays occupation free and rejects other actor and unknown card', () => {
    const session = setup(FRESH, state => { state.players[0]!.occupationHand = [OCC, 'A116_WoodCutter']; state.players[0]!.resources.food = 0 })
    let response = replacement(session, turn(session, 0, 'grain-utilization'), FRESH)
    assertRejectedUnchanged(session, () => session.resolveChoice(1, OCC)); assertRejectedUnchanged(session, () => session.resolveChoice(0, 'does-not-exist'))
    response = ok(session.resolveChoice(0, OCC)); assert.equal(response.state.players[0]!.resources.food, 0); assert.ok(response.state.players[0]!.occupationPlayed.includes(OCC)); assert.ok(response.state.players[0]!.occupationHand.includes('A116_WoodCutter')); save('A097-N1', response)
  })
  it('A097 N2 no playable occupation or unplayed Freshman cannot make grainless space available', () => {
    for (const session of [setup(FRESH), setup(FRESH, state => state.players[0]!.occupationHand = [OCC], 14, false)]) {
      assert.equal(session.getActionAvailability(0)['grain-utilization'], false); const response = assertRejectedUnchanged(session, () => session.takeAction(0, 'grain-utilization')); save(`A097-N2-${response.state.players[0]!.occupationPlayed.length}`, response)
    }
  })
  it('A097 N3 Bread Paddle cannot reuse Freshman within the same placement', () => {
    const session = setup(FRESH, state => { state.players[0]!.occupationHand = [OCC, 'A116_WoodCutter']; state.players[0]!.minorPlayed = ['B025_BreadPaddle']; state.players[0]!.resources.food = 0 })
    let response = replacement(session, turn(session, 0, 'grain-utilization'), FRESH); response = ok(session.resolveChoice(0, OCC))
    assert.equal(response.interaction.stateId === 'wait' ? response.interaction.request.kind : '', 'confirm-next-player')
    assert.ok(response.state.players[0]!.occupationHand.includes('A116_WoodCutter')); assert.equal(response.state.players[0]!.resources.food, 0); assert.equal(response.interaction.stateId === 'wait' ? response.interaction.request.kind : '', 'confirm-next-player'); save('A097-N3', response)
  })
  it('A097 N4 Blighter veto cannot be bypassed by a free occupation replacement', () => {
    const session = setup(FRESH, state => { state.players[0]!.occupationPlayed.push('E101_Blighter'); state.players[0]!.occupationHand = [OCC] })
    assert.equal(session.getActionAvailability(0)['grain-utilization'], false); const response = assertRejectedUnchanged(session, () => session.takeAction(0, 'grain-utilization')); assert.ok(response.state.players[0]!.occupationHand.includes(OCC)); save('A097-N4', response)
  })
})
