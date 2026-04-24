// @ts-nocheck
import { compileLLMCard, registerCard } from '../session-helpers'
import type { CardFixture, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M8_GossipMonger'

const fixture: CardFixture = {
  id: 'M8-cross-player-trigger',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 八卦贩子',
    '- 效果: 当**其他玩家**打出任何小改良时，你立即获得 1 食物。',
    '',
    '请用 listener 实现，scope: \'opponent\'，监听 actions: [\'minor-improvement\']，',
    'phases: [\'after\']，handler 返回 gainLeaf(CARD_ID, { food: 1 })。',
  ].join('\n'),
  run(llmCode): FixtureResult {
    let compiled
    try {
      compiled = compileLLMCard({
        llmGeneratedCode: llmCode,
        cardId: CARD_ID,
        cardType: 'occupation',
        cardName: '八卦贩子',
      })
    } catch (err) {
      return { ok: false, reason: `compile failed: ${(err as Error).message}` }
    }

    const listeners = compiled.manifest.listeners ?? []
    const opponentListener = listeners.find((l: any) => l.scope === 'opponent')
    if (!opponentListener) {
      const scopes = listeners.map((l: any) => l.scope ?? '(unset)')
      return {
        ok: false,
        reason: `no listener with scope: 'opponent' (found scopes: ${JSON.stringify(scopes)})`,
      }
    }
    if (!opponentListener.actions?.includes('minor-improvement')) {
      return {
        ok: false,
        reason: `opponent listener does not target action 'minor-improvement', got actions=${JSON.stringify(opponentListener.actions)}`,
      }
    }

    registerCard(compiled.cardData)
    return { ok: true }
  },
}

export default fixture
