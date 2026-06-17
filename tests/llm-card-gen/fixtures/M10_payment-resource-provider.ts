import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setHand,
  setWorkersAtHome,
} from '../session-helpers'
import type { GameSession } from '../../../server/game/authoritative-session'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M10_TravelingTeacher'
const TRAVELING_PLAYERS = 'traveling-players'

const getTravelingPlayersFood = (session: GameSession): number => {
  const state = session.getState().state
  return state.actionSpaces.find((s) => s.id === TRAVELING_PLAYERS)?.resources?.food ?? 0
}

const fixture: CardFixture = {
  id: 'M10-payment-resource-provider',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 巡游教师',
    '- 效果: 每次你支付职业费用时，可以使用 Traveling Players 行动格上累积的 food 来支付，支付后从该行动格移除对应 food。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '巡游教师',
      playerCount: 4,
    })
    const state = built.session.getState().state
    freezeOtherPlayers(state, 0)
    const p0 = state.players[0]!
    setWorkersAtHome(state, p0, 2)
    p0.occupationPlayed = [CARD_ID, 'A123_FrameBuilder']
    p0.resources = { ...ALL_ZERO_RESOURCES }
    setHand(state, 0, { occupation: ['A153_PigOwner'], minor: ['__test_placeholder__'] })
    const tp = state.actionSpaces.find((s) => s.id === TRAVELING_PLAYERS)
    if (!tp) throw new Error('traveling-players space missing')
    tp.resources = { ...tp.resources, food: 3 }
    state.currentPlayerIndex = 0
    state.round = 5
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  scenario(driver) {
    driver.playOccupationViaLessons(0)
  },

  assert(session, _ctx): FixtureResult {
    const state = session.getState().state
    const p0 = state.players[0]
    if (!p0) return { ok: false, reason: 'missing player 0' }
    if (!p0.occupationPlayed.includes('A153_PigOwner')) {
      return { ok: false, reason: 'expected A153_PigOwner to be played via lessons' }
    }
    if (p0.resources.food !== 0) {
      return { ok: false, reason: `expected player food to stay 0, got ${p0.resources.food}` }
    }
    const tpFood = getTravelingPlayersFood(session)
    if (tpFood !== 2) {
      return { ok: false, reason: `expected traveling-players food to decrease from 3 to 2, got ${tpFood}` }
    }
    return { ok: true }
  },
}

export default fixture
