import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D030_ArtisanDistrict'
import assert from 'node:assert/strict'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

const CARD_ID = 'D030_ArtisanDistrict'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A100_Curator', 'A106_SlurrySpreader', 'A167_BreederBuyer']
const BOTTOM_ROW_MAJORS = [
  'Major_ClayOven', 'Major_StoneOven', 'Major_Joinery', 'Major_Pottery', 'Major_Basket',
]

const setup = ({
  played = false, occupations = 3, stone = 1, bottomMajors = 0, topMajor = false,
}: {
  played?: boolean
  occupations?: number
  stone?: number
  bottomMajors?: number
  topMajor?: boolean
} = {}) => {
  const session = new GameSession(2030, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
  if (played) player.minorPlayed = [CARD_ID]
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.improvements = BOTTOM_ROW_MAJORS.slice(0, bottomMajors)
  if (topMajor) player.improvements.push('Major_Fireplace1')
  player.resources.stone = stone
  state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy = []
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playArtisanDistrict = (session: GameSession) => {
  let response = enterMinorChoice(session)
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const artisanDistrictBonus = (response: SessionResponse) => response.scores[0]!.categories
  .find((category) => category.key === 'cardBonusVp')
  ?.entries.find((entry) => entry.cardId === CARD_ID)?.score ?? 0

describe('D030 Artisan District parity', () => {
  it('D030 S1: three occupations and one stone play Artisan District', () => {
    const response = playArtisanDistrict(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })

  it('D030 S2: fewer than three occupations keep Artisan District unavailable', () => {
    const response = enterMinorChoice(setup({ occupations: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(1)
  })

  it('D030 S3: without one stone Artisan District is unavailable', () => {
    const response = enterMinorChoice(setup({ stone: 0 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  for (const [scenario, bottomMajors, bonus] of [
    ['S4', 2, 0], ['S5', 3, 2], ['S6', 4, 5], ['S7', 5, 8],
  ] as const) {
    it(`D030 ${scenario}: ${bottomMajors} bottom-row major improvements score ${bonus} bonus points`, () => {
      const response = setup({ played: true, bottomMajors }).getState()

      expect(artisanDistrictBonus(response)).toBe(bonus)
    })
  }

  it('D030 S8: a top-row major improvement does not count toward the bottom-row threshold', () => {
    const response = setup({ played: true, bottomMajors: 2, topMajor: true }).getState()

    expect(artisanDistrictBonus(response)).toBe(0)
  })
})

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, final, purchase, rejectBuy, undo, resource, bonus, points, ownMajor, occupations } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("D030 N1 real purchase requires three occupations and one stone and pays its printed base point", () => { for (const mode of ['occupation', 'stone']) {
      const s = make('D030_ArtisanDistrict', st => { occupations(st.players[0]!, mode === 'occupation' ? 2 : 3); st.players[0]!.resources.stone = mode === 'stone' ? 0 : 1; }, false);
      save(`D030-N1-${mode}`, rejectBuy(s, 'D030_ArtisanDistrict'));
  } const s = make('D030_ArtisanDistrict', st => { occupations(st.players[0]!, 3); st.players[0]!.resources.stone = 1; }, false, 14), r = purchase(s, 'D030_ArtisanDistrict'), u = undo(s), scored = (purchase(s, 'D030_ArtisanDistrict'), final(s)); resource(r, { stone: 0 }); assert.equal(points(scored, 'D030_ArtisanDistrict'), 1); resource(u, { stone: 1 }); save('D030-N1', { r, u, scored }); });
  it("D030 N2 actual final scoring counts only the five printed bottom-row majors against all thresholds", () => { const bottom = ['Major_ClayOven', 'Major_StoneOven', 'Major_Joinery', 'Major_Pottery', 'Major_Basket']; for (const [n, expected] of [[0, 0], [2, 0], [3, 2], [4, 5], [5, 8]]) {
      const s = make('D030_ArtisanDistrict', st => bottom.slice(0, n).forEach(id => ownMajor(st, id)), true, 14), r = final(s);
      assert.equal(bonus(r, 'D030_ArtisanDistrict'), expected);
      save(`D030-N2-${n}`, r);
  } const s = make('D030_ArtisanDistrict', st => [...bottom.slice(0, 2), 'Major_Fireplace1', 'Major_Fireplace2', 'Major_Well'].forEach(id => ownMajor(st, id)), true, 14), r = final(s); assert.equal(bonus(r, 'D030_ArtisanDistrict'), 0); save('D030-N2-top', r); });
  it("D030 N3 held card and opponent bottom-row workshops do not provide owner bonus", () => { const majors = ['Major_ClayOven', 'Major_StoneOven', 'Major_Joinery', 'Major_Pottery', 'Major_Basket']; for (const held of [false, true]) {
      const s = make('D030_ArtisanDistrict', st => majors.forEach(id => ownMajor(st, id, held ? 0 : 1)), !held, 14), r = final(s);
      assert.equal(bonus(r, 'D030_ArtisanDistrict'), 0);
      save(`D030-N3-${held}`, r);
  } });
})
