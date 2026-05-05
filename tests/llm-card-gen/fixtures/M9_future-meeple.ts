import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setHand,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult, TriggerResult } from './types'

const CARD_ID = 'CUSTOM_M9_Foreseer'

const fixture: CardFixture = {
  id: 'M9-future-meeple',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 预兆者',
    '- 效果: 打出本牌时 (onBuy)，在下一回合 (state.round + 1) 的回合开始为你预放 1 木材。',
    '',
    '## 实现要求',
    '',
    'sandbox 没有暴露 `futureMeeplesNode` 等 helper，请直接构造 future-meeples 的 leaf flow：',
    '',
    '```ts',
    'onBuy: (state, player) => ({',
    '  type: "leaf",',
    '  actionId: "future-meeples",',
    '  params: {',
    '    __futureMeepleRequest: {',
    '      cardId: CARD_ID,',
    '      playerId: player.id,',
    '      entries: [{ round: state.round + 1, resources: { wood: 1 } }],',
    '    },',
    '  },',
    '  sourceCard: CARD_ID,',
    '})',
    '```',
    '',
    '不要使用 gainLeaf — 这是预放未来回合的资源，不是立即获得。',
    '不要直接 mutate state.pendingFutureMeeples / state.futureMeeples（state 是只读快照）。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '预兆者',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    setActiveWorkerCount(state.players[1]!, 0)
    const p0 = state.players[0]!
    p0.resources = { ...ALL_ZERO_RESOURCES, food: 5 }
    setHand(state, 0, { occupation: [CARD_ID] })
    setActiveWorkerCount(p0, 2)
    setWorkersAtHome(state, p0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  trigger(session): TriggerResult {
    const steps: TriggerResult['steps'] = []
    // 'lessons' is base; with one occupation in hand and zero played,
    // it presents a single-option choice that auto-resolves the play.
    const r1 = session.takeAction(0, 'lessons') as {
      ok: boolean
      interaction: { stateId: string; options?: Array<{ value: string }> }
    }
    steps.push({ label: "takeAction(0,'lessons')", resp: r1 })
    if (r1.interaction.stateId === 'wait') {
      const r2 = session.resolveChoice(0, CARD_ID)
      steps.push({ label: `resolveChoice(0, ${CARD_ID})`, resp: r2 })
    }
    return { steps }
  },

  assert(session, _ctx, result): FixtureResult {
    const last = result.steps[result.steps.length - 1]!.resp as { ok: boolean; error?: string } | undefined
    if (!last || !last.ok) {
      return { ok: false, reason: `last step failed: ${last?.error ?? '?'}` }
    }
    const state = session.getState().state as any
    const p0 = state.players[0]
    if (!p0.occupationPlayed.includes(CARD_ID)) {
      return {
        ok: false,
        reason: `expected ${CARD_ID} in occupationPlayed, got ${JSON.stringify(p0.occupationPlayed)}`,
      }
    }
    const futureMeeples = (state.futureMeeples ?? []) as Array<{
      round: number
      resources: Record<string, number>
      playerId?: string
      cardId?: string
    }>
    if (futureMeeples.length < 1) {
      return {
        ok: false,
        reason: `expected at least 1 entry in state.futureMeeples, got ${JSON.stringify(futureMeeples)}`,
      }
    }
    const match = futureMeeples.find(
      (e) => e.round === 2 && (e.resources?.wood ?? 0) === 1,
    )
    if (!match) {
      return {
        ok: false,
        reason: `expected futureMeeples entry with round=2, resources.wood=1, got ${JSON.stringify(futureMeeples)}`,
      }
    }
    if (match.playerId && match.playerId !== p0.id) {
      return {
        ok: false,
        reason: `expected futureMeeples entry to belong to p0 (${p0.id}), got playerId=${match.playerId}`,
      }
    }
    // TODO: deferred — also advance to round 2 and verify the wood actually
    // lands on grain-utilization (or wherever the round map sends it). The
    // landing semantics depend on FIXED_ROUND_ACTION_ORDER + the ambient
    // resolveFutureMeeples step at round-start, which is finicky to set up
    // here without dragging in a full round-end / next-player simulation.
    return { ok: true }
  },
}

export default fixture
