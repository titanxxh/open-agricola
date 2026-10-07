import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M5_FrugalFamily'

const fixture: CardFixture = {
  id: 'M5-cost-reduction',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 节俭翻修家',
    '- 效果: 你翻修房屋时，所需芦苇 (reed) -1（最少 0）。',
  ].join('\n'),

  setup(llmCode, options) {
    const built = buildSessionWithLLMCard(llmCode, {
      historicalRecording: options?.historicalRecording,
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '节俭翻修家',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    const p0 = state.players[0]!
    // wood→clay 3-room renovation base cost = 3 clay + 1 reed.
    // The card discounts reed by 1 → reed cost clamps to 0. Give exactly
    // reed:1 so a working discount leaves reed untouched, a broken one spends it.
    p0.resources = { ...ALL_ZERO_RESOURCES, clay: 3, reed: 1 }
    p0.houseType = 'wood'
    p0.rooms = 3
    p0.roomTiles = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: 1 },
    ]
    setActiveWorkerCount(p0, 2)
    setWorkersAtHome(state, p0, 2)
    state.currentPlayerIndex = 0
    // round=7: game is well into mid-game; house-redevelopment is available from round 1.
    state.round = 7
    built.session.devPlayCard(0, CARD_ID)
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  scenario(driver) {
    driver.takeAction(0, 'house-redevelopment')
  },

  assert(session, _ctx): FixtureResult {
    const p0 = (session.getState().state as any).players[0]
    if (p0.houseType !== 'clay') {
      return { ok: false, reason: `expected houseType=clay after renovation, got ${p0.houseType}` }
    }
    // reed discount -1 clamps the 1-reed base cost to 0 → reed stays at 1.
    // A broken / missing discount would spend it → reed=0.
    if (p0.resources.reed !== 1) {
      return { ok: false, reason: `expected reed=1 (discount waived the 1-reed cost), got ${p0.resources.reed}` }
    }
    // clay base cost 3 (unitFee 1 × 3 rooms) is unaffected by the discount.
    if (p0.resources.clay !== 0) {
      return { ok: false, reason: `expected clay=0 (3-room renovation spent all 3 clay), got ${p0.resources.clay}` }
    }
    return { ok: true }
  },
}

export default fixture
