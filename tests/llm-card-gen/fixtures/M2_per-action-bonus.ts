// @ts-nocheck
import { compileLLMCard, registerCard } from '../session-helpers'
import type { CardFixture, FixtureResult } from './types'

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
    '',
    '请用 listener 实现，监听 actions: [\'forest\']，phases: [\'after\']，handler 返回 gainLeaf(CARD_ID, { wood: 1 })。',
  ].join('\n'),
  run(llmCode): FixtureResult {
    let compiled
    try {
      compiled = compileLLMCard({
        llmGeneratedCode: llmCode,
        cardId: CARD_ID,
        cardType: 'occupation',
        cardName: '伐木靴',
      })
    } catch (err) {
      return { ok: false, reason: `compile failed: ${(err as Error).message}` }
    }

    const listeners = compiled.manifest.listeners ?? []
    if (listeners.length === 0) {
      return { ok: false, reason: 'no listeners declared in manifest' }
    }
    const matchingListener = listeners.find((l: any) => l.actions?.includes('forest'))
    if (!matchingListener) {
      const acts = listeners.map((l: any) => l.actions).flat()
      return {
        ok: false,
        reason: `no listener listed action 'forest' (found actions: ${JSON.stringify(acts)})`,
      }
    }
    if (!matchingListener.phases?.includes('after')) {
      return {
        ok: false,
        reason: `forest listener phases = ${JSON.stringify(matchingListener.phases)}, expected to include "after"`,
      }
    }

    registerCard(compiled.cardData)
    return { ok: true }
  },
}

export default fixture
