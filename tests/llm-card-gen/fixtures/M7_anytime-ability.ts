import { compileLLMCard, registerCard } from '../session-helpers'
import type { CardFixture, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M7_RoadsideCook'

const fixture: CardFixture = {
  id: 'M7-anytime-ability',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 路边厨子',
    '- 效果: 任意时机 (anytime)，你可以支付 1 wood 换 2 food (每个工作回合最多触发 3 次)。',
    '',
    '请用 listener 实现，phase 设为 \'anytime\'，并通过 cardStates 限制每回合次数。',
  ].join('\n'),
  run(llmCode): FixtureResult {
    let compiled
    try {
      compiled = compileLLMCard({
        llmGeneratedCode: llmCode,
        cardId: CARD_ID,
        cardType: 'minor',
        cardName: '路边厨子',
      })
    } catch (err) {
      return { ok: false, reason: `compile failed: ${(err as Error).message}` }
    }

    const listeners = compiled.manifest.listeners ?? []
    const anytimeListener = listeners.find((l: any) => l.phases?.includes('anytime'))
    if (!anytimeListener) {
      const phases = listeners.map((l: any) => l.phases).flat()
      return {
        ok: false,
        reason: `no listener with phase 'anytime' (found phases: ${JSON.stringify(phases)})`,
      }
    }

    registerCard(compiled.cardData)
    return { ok: true }
  },
}

export default fixture
