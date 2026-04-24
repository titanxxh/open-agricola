// @ts-nocheck
import {
  compileLLMCard,
  registerCard,
  freshState,
  setResources,
  markCardPlayed,
  invokeEffectHook,
} from '../session-helpers'
import type { CardFixture, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M9_StockpileTimer'

const fixture: CardFixture = {
  id: 'M9-future-meeple',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 木材定时器',
    '- 效果: 打出本牌时 (onBuy)，立即在接下来 3 个回合开始时 (round-start)，你各获得 1 wood。',
    '',
    '提示：可以在 onBuy 钩子里返回一个 future-meeples ActionFlow，',
    '或返回包含 3 个 round-start 资源派发的 sequence flow。',
    '也可以用 onRoundStart 钩子配合 cardStates 计数器实现 (打出后剩余 N 回合)。',
  ].join('\n'),
  run(llmCode): FixtureResult {
    let compiled
    try {
      compiled = compileLLMCard({
        llmGeneratedCode: llmCode,
        cardId: CARD_ID,
        cardType: 'minor',
        cardName: '木材定时器',
      })
    } catch (err) {
      return { ok: false, reason: `compile failed: ${(err as Error).message}` }
    }

    const hooks: string[] = compiled.manifest.effectHooks ?? []
    // Either onBuy that returns a future-meeple flow, OR onRoundStart with state.
    const hasOnBuy = hooks.includes('onBuy')
    const hasOnRoundStart = hooks.includes('onRoundStart')
    if (!hasOnBuy && !hasOnRoundStart) {
      return {
        ok: false,
        reason: `expected onBuy or onRoundStart hook for round-based payout, got effectHooks=${JSON.stringify(hooks)}`,
      }
    }

    registerCard(compiled.cardData)

    // Try invoking onBuy if present. Don't be strict about return shape — just
    // make sure the hook doesn't throw.
    if (hasOnBuy) {
      const state = freshState()
      setResources(state, 0, { wood: 0 })
      markCardPlayed(state, 0, CARD_ID, 'minor')
      const player = state.players[0]!
      const result = invokeEffectHook(compiled.compiledCode, CARD_ID, 'onBuy', state, player)
      if (!result.ok) {
        return { ok: false, reason: `onBuy threw: ${JSON.stringify(result).slice(0, 300)}` }
      }
    }
    return { ok: true }
  },
}

export default fixture
