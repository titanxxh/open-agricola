import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M2_LumberJackBoots'

const fixture: CardFixture = {
  id: 'M2-per-action-bonus',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 伐木靴',
    '- 效果: 你每次使用「伐木」(forest) 行动空间时，额外获得 1 木材。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '伐木靴',
    })
    const state = built.session.getState().state
    freezeOtherPlayers(state, 0)
    const p0 = state.players[0]!
    p0.resources = { ...ALL_ZERO_RESOURCES }
    setWorkersAtHome(state, p0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    forest.resources = { ...forest.resources, wood: 3 }
    built.session.devPlayCard(0, CARD_ID)
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  scenario(driver) {
    driver.takeAction(0, 'forest')
  },

  assert(session, _ctx, _result): FixtureResult {
    const state = session.getState().state as any
    const wood = state.players[0].resources.wood
    if (wood !== 4) return { ok: false, reason: `expected wood=4 (3 from space + 1 bonus), got ${wood}` }
    const forest = state.actionSpaces.find((s: any) => s.id === 'forest')
    if (forest.resources.wood !== 0) return { ok: false, reason: `forest wood not cleared: ${forest.resources.wood}` }
    return { ok: true }
  },
}

export default fixture
