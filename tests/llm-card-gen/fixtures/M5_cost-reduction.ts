import { compileLLMCard, registerCard } from '../session-helpers'
import type { CardFixture, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M5_FrugalMason'

const fixture: CardFixture = {
  id: 'M5-cost-reduction',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 节俭石匠',
    '- 效果: 你改建房屋 (renovate-house) 时，所需石头或黏土总量减少 2 (最少 0)。',
    '',
    '请用 listener 实现，监听 actions: [\'renovate-house\']，phases: [\'computeCosts\']。',
  ].join('\n'),
  run(llmCode): FixtureResult {
    let compiled
    try {
      compiled = compileLLMCard({
        llmGeneratedCode: llmCode,
        cardId: CARD_ID,
        cardType: 'minor',
        cardName: '节俭石匠',
      })
    } catch (err) {
      return { ok: false, reason: `compile failed: ${(err as Error).message}` }
    }

    const listeners = compiled.manifest.listeners ?? []
    const renovateListener = listeners.find((l: any) => l.actions?.includes('renovate-house'))
    if (!renovateListener) {
      const acts = listeners.map((l: any) => l.actions).flat()
      return {
        ok: false,
        reason: `no listener for actions: ['renovate-house'] (found: ${JSON.stringify(acts)})`,
      }
    }
    if (!renovateListener.phases?.includes('computeCosts')) {
      return {
        ok: false,
        reason: `renovate listener phases = ${JSON.stringify(renovateListener.phases)}, expected to include "computeCosts"`,
      }
    }

    registerCard(compiled.cardData)
    return { ok: true }
  },
}

export default fixture
