import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult, TriggerResult } from './types'

const CARD_ID = 'CUSTOM_M7_WoodToFood'

// IMPLEMENTATION NOTES:
//
// - Anytime abilities are wired as card listeners with `phases: ['anytime']`
//   (see shared/cards/E/E86_PenBuilder.ts, E62_SourDough.ts, E22_GuestRoom.ts).
//   The listener's `registrationId` becomes the `AnytimeAction.id` exposed in
//   `interaction.anytimeActions`, and `takeAnytimeAction(playerIndex, id)`
//   executes the returned flow. For a sandboxed custom card the registration
//   id is `{cardId}:listener:{index}`.
// - Anytime actions only surface when the engine has an active interaction
//   (choice pending + activePlayerIndex/activeSpaceId set). We enter one by
//   calling `takeAction(0, 'farmland')`, which opens a plow `farmSelect`
//   choice; that's the standard pattern used by the real-card session tests.
// - "ONE-TIME" semantics are achieved by: listener checks
//   `player.cardStates?.[CARD_ID]?.flagged`, and the returned flow appends a
//   `flag-card` leaf so a second invocation returns `void` and the anytime
//   entry disappears from subsequent interactions.

const fixture: CardFixture = {
  id: 'M7-anytime-ability',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 木材换食物',
    '- 效果: 任意时机，你可以支付 2 木材，获得 3 食物。整局游戏只能使用一次。',
    '',
    '实现要求：',
    "- 使用 listener，phases 设为 ['anytime']，cardIds: [CARD_ID]。不要设 actions 字段。",
    '- handler 读取 `context.player.cardStates?.[CARD_ID]?.flagged` 来判断是否已用过，',
    '  已用过直接 return（返回 undefined / void）。',
    '- 未用过时，返回 `{ flow, sourceCard: CARD_ID }`，其中 flow 是一个 seq，',
    '  依次包含：payLeaf({ cardId: CARD_ID, cost: { wood: 2 } })、gainLeaf(CARD_ID, { food: 3 })、',
    "  以及 `{ type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID }`（记为已用）。",
    "- 重要：seq **不要** 设 `optional: true`。anytime 行动本身已经由玩家主动选择是否触发，",
    '  seq 内部再加 optional 会导致玩家可以跳过支付却仍领取奖励。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '木材换食物',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    setActiveWorkerCount(state.players[1]!, 0)
    const p0 = state.players[0]!
    p0.resources = { ...ALL_ZERO_RESOURCES, wood: 2 }
    setWorkersAtHome(state, p0, 1)
    state.currentPlayerIndex = 0
    state.round = 1
    built.session.devPlayCard(0, CARD_ID)
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  trigger(session, ctx): TriggerResult {
    const steps: TriggerResult['steps'] = []
    const r1 = session.takeAction(0, 'farmland') as {
      ok: boolean
      interaction?: { anytimeActions?: Array<{ id: string; sourceCard?: string }> }
    }
    steps.push({ label: "takeAction(0,'farmland')", resp: r1 })
    const myAnytime = (r1.interaction?.anytimeActions ?? []).find(
      (a) => a.sourceCard === ctx.cardId,
    )
    if (!myAnytime) {
      steps.push({
        label: 'no anytime found',
        resp: { interaction: r1.interaction },
      })
      return { steps }
    }
    const r2 = session.takeAnytimeAction(0, myAnytime.id)
    steps.push({ label: `takeAnytimeAction(0, ${myAnytime.id})`, resp: r2 })
    return { steps }
  },

  assert(session, ctx, result): FixtureResult {
    // Manifest sanity: listener with phases:['anytime'] expected.
    const manifest = (ctx.manifest ?? {}) as {
      listeners?: Array<{ phases?: string[]; actions?: string[] }>
    }
    const anytimeL = (manifest.listeners ?? []).find((l) => l.phases?.includes('anytime'))
    if (!anytimeL) {
      return {
        ok: false,
        reason: `no listener with phases:['anytime'] (got ${JSON.stringify(manifest.listeners)})`,
      }
    }
    const last = result.steps[result.steps.length - 1]!
    if (last.label === 'no anytime found') {
      return {
        ok: false,
        reason: `no anytime action exposed for ${ctx.cardId} in interaction.anytimeActions (resp=${JSON.stringify(last.resp).slice(0, 400)})`,
      }
    }
    const r = last.resp as { ok: boolean; error?: string } | undefined
    if (!r || r.ok === false) {
      return { ok: false, reason: `takeAnytimeAction failed: ${r?.error ?? '?'}` }
    }
    const state = session.getState().state as any
    const p0 = state.players[0]
    if (p0.resources.wood !== 0) {
      return { ok: false, reason: `expected wood=0 (2-2 paid), got ${p0.resources.wood}` }
    }
    if (p0.resources.food !== 3) {
      return { ok: false, reason: `expected food=3 (gained), got ${p0.resources.food}` }
    }
    // After consumption the anytime entry should not re-appear. Check current
    // interaction via getState (it holds the latest interaction snapshot).
    const latest = session.getState() as any
    const anytimeIds = (latest.interaction?.anytimeActions ?? []).map((a: { id: string }) => a.id)
    const ourListenerId = `${ctx.cardId}:listener:0`
    if (anytimeIds.includes(ourListenerId)) {
      return {
        ok: false,
        reason: `anytime still exposed after use — flag-card likely missing from flow. anytimeActions=${JSON.stringify(anytimeIds)}`,
      }
    }
    return { ok: true }
  },
}

export default fixture
