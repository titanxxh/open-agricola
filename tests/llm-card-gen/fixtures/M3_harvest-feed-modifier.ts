import {
  compileLLMCard,
  registerCard,
  freshState,
  setResources,
  markCardPlayed,
  invokeEffectHook,
} from '../session-helpers'
import type { CardFixture, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M3_LazyShepherd'

const FEED_HOOKS = [
  'onStartHarvestFeedingPhase',
  'onHarvestFeedingPhase',
  'onEndHarvestFeedingPhase',
  'onBeforeFeed',
  'onAfterFeed',
]

const fixture: CardFixture = {
  id: 'M3-harvest-feed-modifier',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 懒牧人',
    '- 效果: 收获的喂养阶段 (feeding phase)，你的羊不需要喂食。',
    '',
    '请用 effect 钩子实现 (onStartHarvestFeedingPhase 或类似 feeding-phase hook)。',
  ].join('\n'),
  run(llmCode): FixtureResult {
    let compiled
    try {
      compiled = compileLLMCard({
        llmGeneratedCode: llmCode,
        cardId: CARD_ID,
        cardType: 'minor',
        cardName: '懒牧人',
      })
    } catch (err) {
      return { ok: false, reason: `compile failed: ${(err as Error).message}` }
    }

    const hooks: string[] = compiled.manifest.effectHooks ?? []
    const usedHook = hooks.find((h) => FEED_HOOKS.includes(h))
    if (!usedHook) {
      return {
        ok: false,
        reason: `no feed-phase hook used. effectHooks=${JSON.stringify(hooks)}, expected one of ${JSON.stringify(FEED_HOOKS)}`,
      }
    }

    registerCard(compiled.cardData)

    // Smoke-invoke the hook with a state where p1 has 2 sheep — verify it
    // doesn't throw and returns either void or an ActionFlow.
    const state = freshState()
    setResources(state, 0, { food: 5, sheep: 2 } as any)
    markCardPlayed(state, 0, CARD_ID, 'minor')
    const player = state.players[0]!

    const result = invokeEffectHook(compiled.compiledCode, CARD_ID, usedHook, state, player)
    if (!result.ok) {
      return { ok: false, reason: `${usedHook} hook threw: ${JSON.stringify(result).slice(0, 300)}` }
    }
    return { ok: true }
  },
}

export default fixture
