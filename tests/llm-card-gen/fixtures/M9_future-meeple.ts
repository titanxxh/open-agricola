import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setHand,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M9_Foreseer'

const fixture: CardFixture = {
  id: 'M9-future-meeple',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 预兆者',
    '- 效果: 打出此卡时，预放 1 木材，在下一轮开始时获得。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '预兆者',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    setActiveWorkerCount(state.players[1]!, 0)
    const p0 = state.players[0]!
    p0.resources = { ...ALL_ZERO_RESOURCES, food: 5 }
    setHand(state, 0, { occupation: [CARD_ID] })
    setActiveWorkerCount(p0, 2)
    setWorkersAtHome(state, p0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
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

  assert(session, _ctx, _result): FixtureResult {
    const state = session.getState().state as any
    const p0 = state.players[0]
    if (!p0.occupationPlayed.includes('CUSTOM_M9_Foreseer')) {
      return { ok: false, reason: `expected CUSTOM_M9_Foreseer in occupationPlayed, got ${JSON.stringify(p0.occupationPlayed)}` }
    }
    const fm = (state.futureMeeples ?? []) as Array<{ playerId?: string; round?: number; resources?: { wood?: number } }>
    const woodEntry = fm.find((e) => e.playerId === p0.id && (e.resources?.wood ?? 0) >= 1)
    if (!woodEntry) {
      return { ok: false, reason: `expected a futureMeeples entry for p0 with wood>=1, got ${JSON.stringify(fm)}` }
    }
    if (woodEntry.round !== state.round + 1) {
      return { ok: false, reason: `expected future-meeple round=${state.round + 1} (next round), got ${woodEntry.round}` }
    }
    return { ok: true }
  },
}

export default fixture
