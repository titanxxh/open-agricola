import {
  ALL_ZERO_RESOURCES,
  buildSessionWithLLMCard,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setHand,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M11_MedievalMallet'

const fixture: CardFixture = {
  id: 'M11-improvement-cost-reduction',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 中世纪木槌',
    '- 效果: 打出后，建造房间和购买改良时各少支付 2 木材。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '中世纪木槌',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    const player = state.players[0]!
    player.resources = { ...ALL_ZERO_RESOURCES, stone: 2 }
    setHand(state, 0, { minor: ['__test_placeholder__'], occupation: ['__test_placeholder__'] })
    setHand(state, 1, { minor: ['__test_placeholder__'], occupation: ['__test_placeholder__'] })
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.availableMajorImprovements = ['Major_Joinery']
    built.session.devPlayCard(0, CARD_ID)
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  scenario(driver) {
    driver.takeAction(0, 'major-improvement')
  },

  assert(session, _ctx): FixtureResult {
    const player = session.getState().state.players[0]!
    if (!player.improvements.includes('Major_Joinery')) {
      return { ok: false, reason: `expected Major_Joinery to be bought, got ${JSON.stringify(player.improvements)}` }
    }
    if (player.resources.stone !== 0 || player.resources.wood !== 0) {
      return { ok: false, reason: `expected wood=0 and stone=0, got ${JSON.stringify(player.resources)}` }
    }
    return { ok: true }
  },
}

export default fixture
