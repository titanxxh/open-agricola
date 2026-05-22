import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setHand,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M1_QuickHaul'

const fixture: CardFixture = {
  id: 'M1-immediate-gain-with-cost-prereq',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 速运',
    '- 打出费用 (cost): 1 wood',
    '- 前置条件 (prerequisite): 3 Occupations',
    '- 效果: 打出本牌时立即获得 3 木材和 1 食物。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'minor',
      cardName: '速运',
      cardCost: { wood: 1 },
      cardPrerequisite: '3 Occupations',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    setActiveWorkerCount(state.players[1]!, 0)
    const p0 = state.players[0]!
    p0.resources = { ...ALL_ZERO_RESOURCES, wood: 1 }
    // 3 placeholder occupations satisfy `3 Occupations` prerequisite
    // (parsed via player.occupationPlayed.length >= 3).
    p0.occupationPlayed.push('SCAFFOLD_OCC_1', 'SCAFFOLD_OCC_2', 'SCAFFOLD_OCC_3')
    setHand(state, 0, { minor: [CARD_ID] })
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
    driver.playMinorViaMeetingPlace(0)
  },

  assert(session, _ctx, _result): FixtureResult {
    const state = session.getState().state as any
    const p0 = state.players[0]
    if (!p0.minorPlayed.includes('CUSTOM_M1_QuickHaul')) {
      return { ok: false, reason: `expected CUSTOM_M1_QuickHaul in minorPlayed, got ${JSON.stringify(p0.minorPlayed)}` }
    }
    if (p0.minorHand.includes('CUSTOM_M1_QuickHaul')) {
      return { ok: false, reason: `card still in minorHand: ${JSON.stringify(p0.minorHand)}` }
    }
    if (p0.resources.wood !== 3) {
      return { ok: false, reason: `expected wood=3 (1 start - 1 cost + 3 gain), got ${p0.resources.wood}` }
    }
    if (p0.resources.food !== 1) return { ok: false, reason: `expected food=1, got ${p0.resources.food}` }
    // 验证 scenario 确实执行了 meeting-place 行动（占用了行动格），而非被 driver drain 短路
    const space = state.actionSpaces.find((s: any) => s.id === 'meeting-place')
    if (!space || space.takenBy.length !== 1) {
      return { ok: false, reason: `expected meeting-place takenBy.length=1, got ${JSON.stringify(space?.takenBy)}` }
    }
    return { ok: true }
  },
}

export default fixture
