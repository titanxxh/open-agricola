import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { computeScores } from '../../shared/domain/scoring'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C050_StableYard'
import assert from 'node:assert/strict'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'

const CARD_ID = 'C050_StableYard'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, stables = 3, pastures = 3, round = 5, sheep = 0, boar = 0,
} = {}) => {
  const session = new GameSession(5050, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.pastures = Array.from({ length: pastures }, (_, index) => ({
    id: `stable-yard-pasture-${index}`,
    size: 1,
    tiles: [{ row: index, col: 2 }],
    stables: index < stables ? 1 : 0,
    animalType: index === 0 && sheep > 0 ? 'sheep' as const
      : index === 1 && boar > 0 ? 'boar' as const : null,
    animalCount: index === 0 ? sheep : index === 1 ? boar : 0,
  }))
  player.stableTiles = Array.from({ length: stables }, (_, index) => ({ row: index, col: 2 }))
  player.stableAnimals = {}
  player.resources = {
    ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep, boar, cattle: 0,
  }
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)

const printedVp = (session: GameSession, response: SessionResponse) => {
  const player = response.state.players[0]!
  const score = session.withCtx(() => computeScores(response.state)).find((summary) => summary.playerId === player.id)!
  const cards = score.categories.find((category) => category.key === 'cards')!
  return cards.entries.find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score
}

describe('C050 Stable Yard parity', () => {
  it('C050 S1: three stables and three pastures play Stable Yard and grant food for rounds six through fourteen', () => {
    const session = setup()
    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(9)
    expect(printedVp(session, response)).toBe(1)
  })

  it('C050 S2: two stables and three pastures cannot play Stable Yard', () => {
    const response = enterMinor(setup({ stables: 2 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C050 S3: three stables with two pastures keep Stable Yard unavailable', () => {
    const response = enterMinor(setup({ pastures: 2 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('counts the Farm Hand special stable toward the three-stable prerequisite', () => {
    const session = setup({ stables: 2 })
    const owner = session.state.players[0]!
    owner.occupationPlayed = ['B085_FarmHand']
    owner.cardStates.B085_FarmHand = { extraData: { position: { row: 1, col: 1 } } }
    session.loadState(session.state)
    const response = play(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(9)
  })

  it('C050 S4: playing Stable Yard in round fourteen grants no food', () => {
    const response = play(setup({ round: 14 }))

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C050 S5: its anytime exchange converts one accommodated sheep and boar into one cattle', () => {
    const session = setup({ played: true, sheep: 1, boar: 1 })

    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.sourceCard === CARD_ID)
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, option!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, cattle: 1 })
  })

  for (const [scenario, sheep, boar] of [['S6', 0, 1], ['S7', 1, 0]] as const) {
    it(`C050 ${scenario}: the anytime exchange is absent without both animal types`, () => {
      const response = setup({ played: true, sheep, boar }).takeAnytimeAction(0, 'exchange')
      expect(response.ok).toBe(false)
      expect(response.state.players[0]!.resources).toMatchObject({ sheep, boar, cattle: 0 })
    })
  }
})

describe('ae-negative-37-food', () => {
  const { sessions, ok, options, save, setup, finish, next, move, prerequisites, hand, buy, pasture, printed, denyMinor } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C050 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => {
      const card = 'C050_StableYard', s = setup(card, 5, st => {
          hand(st, card);
          prerequisites(st, 0);
          for (let i = 0; i < 3; i++)
              pasture(st, [{ row: 0, col: i + 2 }], null, 0, true, `p${i}`);
          Object.assign(st.players[0]!.resources, {});
      });
      const r = buy(s, card);
      assert.ok(r.state.players[0]!.minorPlayed.includes(card));
      assert.equal(printed(r, card), 1);
      assert.equal(r.state.players[0]!.resources.food, 49);
      save('C050-N1-legal', r);
      const separate = setup(card, 5, st => {
          hand(st, card);
          for (let i = 0; i < 3; i++)
              pasture(st, [{ row: 0, col: i + 2 }], null, 0, false, `p${i}`);
          st.players[0]!.stableTiles = [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }];
      });
      const separateResult = buy(separate, card);
      assert.equal(separateResult.state.players[0]!.resources.food, 49);
      assert.equal(printed(separateResult, card), 1);
      save('C050-N1-unfenced-stables', separateResult);
  });
  it('C050 N3 three stables and three pastures are independent actual purchase requirements', () => {
      const card = 'C050_StableYard';
      for (const mode of ['stables', 'pastures']) {
          const s = setup(card, 5, st => {
              hand(st, card);
              for (let i = 0; i < (mode === 'pastures' ? 2 : 3); i++)
                  pasture(st, [{ row: 0, col: i + 2 }], null, 0, i < (mode === 'stables' ? 2 : 3), `p${i}`);
              if (mode === 'pastures')
                  st.players[0]!.stableTiles.push({ row: 1, col: 2 });
          });
          denyMinor(s, card);
          save(`C050-N3-${mode}`, s.getState());
      }
      const s = setup(card, 14, st => {
          hand(st, card);
          for (let i = 0; i < 3; i++)
              pasture(st, [{ row: 0, col: i + 2 }], null, 0, true, `p${i}`);
      });
      const r = buy(s, card);
      assert.equal(r.state.players[0]!.resources.food, 40);
      save('C050-N3-finalround', r);
  });
  it('C050 N2 a real anytime exchange consumes the accommodated sheep and pig and keeps the new cattle legal', () => { const card = 'C050_StableYard', s = setup(card, 14, st => { hand(st, card); pasture(st, [{ row: 0, col: 2 }], 'sheep', 1, true, 'p1'); pasture(st, [{ row: 0, col: 3 }], 'boar', 1, true, 'p2'); pasture(st, [{ row: 0, col: 4 }], null, 0, true, 'p3'); }); finish(s, buy(s, card)); move(s, 'forest'); next(s); let r = ok(s.takeAnytimeAction(0, 'exchange')); const opt = options(r).find(o => o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesPaid?.sheep === 1 && o.effectPreview.resourcesPaid?.boar === 1 && o.effectPreview.resourcesGained?.cattle === 1); assert.ok(opt); r = finish(s, ok(s.resolveChoice(0, opt.value)), true); assert.equal(r.state.players[0]!.resources.sheep, 0); assert.equal(r.state.players[0]!.resources.boar, 0); assert.equal(r.state.players[0]!.resources.cattle, 1); assert.equal(r.state.players[0]!.pastures.reduce((n, p) => n + p.animalCount, 0), 1); assert.equal(r.state.players[0]!.resources.food, 40); save('C050-N2', r); });
})
