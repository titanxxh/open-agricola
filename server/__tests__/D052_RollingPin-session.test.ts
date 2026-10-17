import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D052_RollingPin'
import assert from 'node:assert/strict'
import { confirmNext } from './_helpers/negative-rule-audit'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'

const CARD_ID = 'D052_RollingPin'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, wood = 1, clay = 0, occupations = 1, round = 2,
} = {}) => {
  const session = new GameSession(6052, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
  player.minorPlayed = played ? [CARD_ID] : []
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `__occupation_${index}__`)
  player.resources.wood = wood
  player.resources.clay = clay
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const prepareRoundEnd = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  session.loadState(state)
}

describe('D052 Rolling Pin parity', () => {
  it('D052 S1: one occupation allows paying one wood to play Rolling Pin', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D052 S2: no occupation keeps Rolling Pin unavailable without spending wood', () => {
    const response = enterMinor(setup({ occupations: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('D052 S3: without wood an otherwise legal Rolling Pin is unavailable', () => {
    const response = enterMinor(setup({ wood: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('D052 S4: more clay than wood at returning home grants one food each round', () => {
    const session = setup({ played: true, wood: 1, clay: 2 })
    prepareRoundEnd(session)

    let response = session.performRoundEnd()
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources.food).toBe(21)

    prepareRoundEnd(session)
    response = session.performRoundEnd()
    expect(response.state.round).toBe(4)
    expect(response.state.players[0]!.resources.food).toBe(22)
  })

  it.each([['S5', 1, 1], ['S6', 2, 1]] as const)(
    'D052 %s: %i wood and %i clay at returning home grant no food',
    (_scenario, wood, clay) => {
      const session = setup({ played: true, wood, clay })
      prepareRoundEnd(session)

      const response = session.performRoundEnd()

      expect(response.state.round).toBe(3)
      expect(response.state.players[0]!.resources.food).toBe(20)
    },
  )
})

describe('ae-negative-37-food', () => {
  const { sessions, save, setup, finish, completeRound, take, move, prerequisites, hand, buy, noSource, printed, denyMinor } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D052 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => { const card = 'D052_RollingPin', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 1); Object.assign(st.players[0]!.resources, { "wood": 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.wood, 0); save('D052-N1-legal', r); const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 1); Object.assign(st.players[0]!.resources, { "wood": 0 }); }); denyMinor(t, card); save('D052-N1-short', t.getState()); const excluded = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "wood": 1 }); }); denyMinor(excluded, card); save('D052-N1-prerequisite', excluded.getState()); });
  it('D052 N2 strict supply clay majority grants one food at each real return home and never in midround', () => {
      for (const [clay, wood] of [[1, 0], [4, 4], [3, 4]]) {
          const card = 'D052_RollingPin', s = setup(card, 5, st => Object.assign(st.players[0]!.resources, { clay, wood }));
          let r = finish(s, completeRound(s, ['grain-seeds', 'forest', 'reed-bank', 'clay-pit']));
          assert.equal(r.state.round, 6);
          assert.equal(r.state.players[0]!.resources.food, clay > wood ? 41 : 40);
          save(`D052-N2-${clay}-${wood}`, r);
          r = finish(s, completeRound(s, ['grain-seeds', 'forest', 'reed-bank', 'clay-pit']));
          assert.equal(r.state.round, 7);
          assert.equal(r.state.players[0]!.resources.food, clay > wood ? 42 : 40);
          save(`D052-N2-repeat-${clay}-${wood}`, r);
      }
  });
  it('D052 N3 a hand card or equal supply cannot gain food from a clay board pile', () => {
      for (const mode of ['hand', 'board']) {
          const card = 'D052_RollingPin', s = setup(card, 5, st => {
              if (mode === 'hand') {
                  hand(st, card);
                  st.players[0]!.resources.clay = 5;
              }
              st.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay = 9;
          });
          let r = take(s, 'grain-seeds');
          noSource(r, card);
          assert.equal(r.state.players[0]!.resources.food, 40);
          finish(s, r);
          move(s, 'forest');
          move(s, 'reed-bank');
          move(s, 'clay-pit');
          r = finish(s, confirmNext(s, s.getState()));
          assert.equal(r.state.round, 6);
          assert.equal(r.state.players[0]!.resources.food, 40);
          save(`D052-N3-${mode}`, r);
      }
  });
})
