import { compileLLMCard, registerCard } from '../session-helpers'
import type { CardFixture, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M6_FrugalLogger'

const fixture: CardFixture = {
  id: 'M6-cardstate-counter',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 木屑节约',
    '- 效果: 每个工作回合，你**第 1 次**使用「伐木」(forest) 行动时，额外获得 1 木材。',
    '  同一回合内第 2 次及以后的「伐木」无此加成。',
    '',
    '请用 listener 监听 actions: [\'forest\']，并使用 player.cardStates[CARD_ID]',
    '记录本回合是否已触发 (例如 { triggeredRound: state.round })。listener handler 内',
    '判断后再决定是否返回 gainLeaf(CARD_ID, { wood: 1 })。',
    '同时建议加 onRoundStart 钩子重置 player.cardStates[CARD_ID]。',
  ].join('\n'),
  run(llmCode): FixtureResult {
    let compiled
    try {
      compiled = compileLLMCard({
        llmGeneratedCode: llmCode,
        cardId: CARD_ID,
        cardType: 'minor',
        cardName: '木屑节约',
      })
    } catch (err) {
      return { ok: false, reason: `compile failed: ${(err as Error).message}` }
    }

    const listeners = compiled.manifest.listeners ?? []
    const forestListener = listeners.find((l: any) => l.actions?.includes('forest'))
    if (!forestListener) {
      return { ok: false, reason: `no listener for actions: ['forest']` }
    }

    // The code should track per-round state somehow — either directly via
    // player.cardStates, or via the helper API (write-card-extra-data /
    // readCardExtraData).
    const src = compiled.compiledCode
    const usesCardStates = src.includes('cardStates')
    const usesExtraData = src.includes('CardExtraData') || src.includes('card-extra-data')
    if (!usesCardStates && !usesExtraData) {
      return {
        ok: false,
        reason:
          'compiled code does not reference cardStates or card-extra-data helpers — no per-round state tracking visible',
      }
    }

    registerCard(compiled.cardData)
    return { ok: true }
  },
}

export default fixture
