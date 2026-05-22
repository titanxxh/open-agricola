import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M6_ActionTallyman'

const fixture: CardFixture = {
  id: 'M6-cardstate-counter',
  cardId: CARD_ID,
  cardType: 'occupation',
  // spec §5.1 例外：userMessage 显式指定计数器键名 actionCount。该键名是本 fixture
  // 的 assert 与卡牌实现之间的契约（assert 按此键读 cardStates[CARD_ID].counters
  // .actionCount 验证），键名由 LLM 自取会破坏 assert，故须指定——勿删。
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 行动计数官',
    '- 效果: 每当你使用「伐木」(forest)、「采土坑」(clay-pit) 或「芦苇地」(reed-bank)',
    '  行动空间时，在本卡上累计计数 +1（用于回顾本局触发次数）。其它行动不计数。',
    '- 实现提示: 把计数累计在本卡计数器（counter）的键名 `actionCount` 上。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '行动计数官',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    const p0 = state.players[0]!
    const p1 = state.players[1]!
    p0.resources = { ...ALL_ZERO_RESOURCES }
    // Activate 4 workers for p0 so all four place-farmer actions fit in one round.
    setActiveWorkerCount(p0, 4)
    setWorkersAtHome(state, p0, 4)
    // Deactivate p1 entirely (active=0) so on round-end its workers don't return.
    setActiveWorkerCount(p1, 0)
    setWorkersAtHome(state, p1, 0)
    state.currentPlayerIndex = 0
    state.round = 1
    state.actionSpaces.find((s) => s.id === 'forest')!.resources.wood = 1
    state.actionSpaces.find((s) => s.id === 'clay-pit')!.resources.clay = 1
    state.actionSpaces.find((s) => s.id === 'reed-bank')!.resources.reed = 1
    state.actionSpaces.find((s) => s.id === 'fishing')!.resources.food = 1
    built.session.devPlayCard(0, CARD_ID)
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  scenario(driver) {
    for (const sp of ['forest', 'fishing', 'clay-pit', 'reed-bank']) {
      driver.takeAction(0, sp)
    }
  },

  assert(session, _ctx): FixtureResult {
    const p0 = (session.getState().state as any).players[0]
    const cs = p0.cardStates?.['CUSTOM_M6_ActionTallyman']
    if (!cs) return { ok: false, reason: 'cardStates[CUSTOM_M6_ActionTallyman] missing' }
    const observed = cs.counters?.actionCount ?? cs.extraData?.actionCount
    if (observed !== 3) {
      return { ok: false, reason: `expected actionCount=3, got counters=${cs.counters?.actionCount} extraData=${cs.extraData?.actionCount}` }
    }
    return { ok: true }
  },
}

export default fixture
