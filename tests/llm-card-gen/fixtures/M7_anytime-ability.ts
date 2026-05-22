import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M7_WoodToFood'

const fixture: CardFixture = {
  id: 'M7-anytime-ability',
  cardId: CARD_ID,
  cardType: 'occupation',
  // spec §5.1 例外：userMessage 显式提示用 phases: ['anytime'] listener。「任意时机」
  // 能力到 anytime listener 的映射对小模型非显然，作为 fixture 级最小提示保留——
  // 不是去实现化遗漏，勿删。
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 木材换食物',
    '- 效果: 任意时机，你可以支付 2 木材，获得 3 食物。整局游戏只能使用一次。',
    '- 实现提示: 用 listener、phases 设为 [\'anytime\'] 实现这个「任意时机」能力。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '木材换食物',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    setActiveWorkerCount(state.players[1]!, 0)
    const p0 = state.players[0]!
    p0.resources = { ...ALL_ZERO_RESOURCES, wood: 2 }
    setWorkersAtHome(state, p0, 1)
    state.currentPlayerIndex = 0
    state.round = 1
    built.session.devPlayCard(0, CARD_ID)
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  scenario(driver) {
    driver.takeActionRaw(0, 'farmland')
    driver.takeAnytimeForCard(0)
  },

  assert(session, ctx): FixtureResult {
    const p0 = (session.getState().state as any).players[0]
    if (p0.resources.wood !== 0) return { ok: false, reason: `expected wood=0 (2-2 paid), got ${p0.resources.wood}` }
    if (p0.resources.food !== 3) return { ok: false, reason: `expected food=3 (gained), got ${p0.resources.food}` }
    const latest = session.getState() as any
    const stillExposed = (latest.interaction?.anytimeActions ?? []).some((a: any) => a.sourceCard === ctx.cardId)
    if (stillExposed) return { ok: false, reason: 'anytime still exposed after one-time use' }
    return { ok: true }
  },
}

export default fixture
