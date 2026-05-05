import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult, TriggerResult } from './types'
import { confirmNextPlayer } from '../../../server/__tests__/_helpers/legacy-confirms'

const CARD_ID = 'CUSTOM_M6_ActionTallyman'

const fixture: CardFixture = {
  id: 'M6-cardstate-counter',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 行动计数官',
    '- 效果: 每当你使用「伐木」(forest)、「采土坑」(clay-pit) 或「芦苇地」(reed-bank) 行动空间时，',
    '  在本卡上累计计数 +1（用于回顾本局触发次数）。其它行动不计数。',
    '',
    "请用 listener 实现，监听 actions: ['place-farmer']，phases: ['after']，scope: 'player'，",
    "cardIds: [CARD_ID]。handler 内通过 context.space?.id 判断是否在 ['forest','clay-pit','reed-bank'] 集合中，",
    '若不在则 return（不返回任何值）。',
    '',
    '由于沙盒中 player 是只读快照，**不要**直接 mutate `player.cardStates`。',
    '请用 `readCardExtraData(player, CARD_ID)` 读取已有 actionCount，',
    '然后 return `{ flow: { type: "leaf", actionId: "write-card-extra-data",',
    '  params: { data: { actionCount: <prev + 1> } }, sourceCard: CARD_ID }, sourceCard: CARD_ID }`',
    '将新计数写回。',
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

  trigger(session): TriggerResult {
    const steps: TriggerResult['steps'] = []
    const sequence = ['forest', 'fishing', 'clay-pit', 'reed-bank'] as const
    for (const spaceId of sequence) {
      const resp = session.takeAction(0, spaceId) as { pending?: { type?: string }; ok: boolean }
      steps.push({ label: `takeAction(0,'${spaceId}')`, resp })
      if (resp.pending?.type === 'confirmNextPlayer') {
        const cnp = confirmNextPlayer(session)
        steps.push({ label: 'confirmNextPlayer', resp: cnp })
      }
    }
    return { steps }
  },

  assert(session, _ctx, result): FixtureResult {
    for (const step of result.steps) {
      const resp = step.resp as { ok?: boolean; error?: string } | undefined
      if (resp && resp.ok === false) {
        return { ok: false, reason: `step "${step.label}" failed: ${resp.error ?? '?'}` }
      }
    }
    const state = session.getState().state as any
    const p0 = state.players[0]
    const cardState = p0.cardStates?.[CARD_ID]
    if (!cardState) {
      return { ok: false, reason: `player.cardStates[${CARD_ID}] missing after triggers` }
    }
    const fromCounters = cardState.counters?.actionCount
    const fromExtra = cardState.extraData?.actionCount
    const observed = typeof fromCounters === 'number' ? fromCounters : fromExtra
    if (observed !== 3) {
      return {
        ok: false,
        reason: `expected actionCount=3 (forest+clay-pit+reed-bank, fishing not counted), got counters=${fromCounters} extraData=${fromExtra}`,
      }
    }
    return { ok: true }
  },
}

export default fixture
