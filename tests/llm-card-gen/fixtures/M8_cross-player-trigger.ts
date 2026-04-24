import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult, TriggerResult } from './types'

const CARD_ID = 'CUSTOM_M8_NeighborlyHelp'

const fixture: CardFixture = {
  id: 'M8-cross-player-trigger',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 邻居互助',
    "- 效果: 当**任何玩家**（包括对手）使用「伐木」(forest) 行动空间后，",
    '  本卡牌的所有者额外获得 1 木材。（即触发玩家不一定是卡主时，奖励仍归卡主。）',
    '',
    "请用 listener 实现：监听 actions: ['place-farmer']，phases: ['after']，",
    "scope: 'any'，cardIds: [CARD_ID]。handler 内通过 context.space?.id === 'forest'",
    '过滤；条件满足时返回 `{ flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }`。',
    '引擎会在卡主与触发玩家不同时自动插入 PlayerSwitchNode，使奖励归到卡主。',
    '不要手动检查所有权或在 handler 内做玩家切换。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '邻居互助',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    const p0 = state.players[0]!
    const p1 = state.players[1]!
    p0.resources = { ...ALL_ZERO_RESOURCES }
    p1.resources = { ...ALL_ZERO_RESOURCES }
    // Each player keeps just 1 active worker; we only need a single forest
    // placement by p1 to verify the cross-player trigger fires once.
    setActiveWorkerCount(p0, 1)
    setActiveWorkerCount(p1, 1)
    setWorkersAtHome(state, p0, 1)
    setWorkersAtHome(state, p1, 1)
    state.currentPlayerIndex = 1
    state.round = 1
    state.actionSpaces.find((s) => s.id === 'forest')!.resources.wood = 3
    built.session.devPlayCard(0, CARD_ID) // card belongs to p0
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  trigger(session): TriggerResult {
    const steps: TriggerResult['steps'] = []
    const r1 = session.takeAction(1, 'forest') as { ok: boolean; pending?: { type?: string } }
    steps.push({ label: "takeAction(1,'forest')", resp: r1 })
    if (r1.pending?.type === 'confirmNextPlayer') {
      steps.push({ label: 'confirmNextPlayer', resp: session.confirmNextPlayer() })
    }
    return { steps }
  },

  assert(session, _ctx, result): FixtureResult {
    const last = result.steps[result.steps.length - 1]!.resp as { ok: boolean; error?: string } | undefined
    if (last && last.ok === false) {
      return { ok: false, reason: `last step failed: ${last.error ?? '?'}` }
    }
    const state = session.getState().state as any
    const p0Wood = state.players[0].resources.wood
    const p1Wood = state.players[1].resources.wood
    if (p1Wood !== 3) {
      return { ok: false, reason: `expected p1.wood=3 (took 3 from forest), got ${p1Wood}` }
    }
    if (p0Wood !== 1) {
      return { ok: false, reason: `expected p0.wood=1 (cross-player gain via card), got ${p0Wood}` }
    }
    return { ok: true }
  },
}

export default fixture
