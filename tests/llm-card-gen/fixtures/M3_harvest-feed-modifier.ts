import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  markAllWorkersUsed,
  setActiveWorkerCount,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M3_HarvestHelper'

const fixture: CardFixture = {
  id: 'M3-harvest-feed-modifier',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 收获助手',
    '- 效果: 每次收获的喂养阶段开始时，你额外获得 1 食物（用于本次喂养）。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '收获助手',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round
    state.players.forEach((p) => {
      // Single adult: required = familySize*2 - newborn = 2.
      setActiveWorkerCount(p, 1)
      p.resources = { ...ALL_ZERO_RESOURCES, food: 1 }
      p.fields = []
      p.pastures = []
    })
    // Both players need workers used so performRoundEnd advances into harvest.
    state.players.forEach((p) => markAllWorkersUsed(state, p))
    built.session.devPlayCard(0, CARD_ID)
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  scenario(driver) {
    driver.advanceToHarvest()
  },

  assert(session, _ctx): FixtureResult {
    const state = session.getState().state as any
    const p0Beg = state.players[0].resources.begging
    const p1Beg = state.players[1].resources.begging
    if (p0Beg !== 0) return { ok: false, reason: `expected p0.begging=0 (card grants +1 food, 1+1=2 covers cost), got ${p0Beg}` }
    if (p1Beg !== 1) return { ok: false, reason: `expected p1.begging=1 (control player has only 1 of 2 food), got ${p1Beg}` }
    return { ok: true }
  },
}

export default fixture
