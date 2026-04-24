import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setHand,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult, TriggerResult } from './types'

const CARD_ID = 'CUSTOM_M1_QuickHaul'

const fixture: CardFixture = {
  id: 'M1-immediate-gain-with-cost-prereq',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 速运',
    '- 打出费用 (cost): 1 wood',
    '- 前置条件 (prerequisite): 3 Occupations',
    '- 效果: 打出本牌时 (onBuy)，立即获得 3 木材和 1 食物。',
    '',
    '请用 onBuy 钩子实现获得效果，使用 gainLeaf(CARD_ID, { wood: 3, food: 1 }) 这种格式返回 ActionFlow。',
    '注意 cost 和 prerequisite 必须出现在 CARD_DEF 字面量中（new MinorImprovement({ ... }) 的参数）。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'minor',
      cardName: '速运',
      cardCost: { wood: 1 },
      cardPrerequisite: '3 Occupations',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    setActiveWorkerCount(state.players[1]!, 0)
    const p0 = state.players[0]!
    p0.resources = { ...ALL_ZERO_RESOURCES, wood: 1 }
    // 3 placeholder occupations satisfy `3 Occupations` prerequisite
    // (parsed via player.occupationPlayed.length >= 3).
    p0.occupationPlayed.push('SCAFFOLD_OCC_1', 'SCAFFOLD_OCC_2', 'SCAFFOLD_OCC_3')
    setHand(state, 0, { minor: [CARD_ID] })
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
    // meeting-place flow: seq[set-first-player, optional minor-improvement].
    // Engine surfaces a choice with options [<accept>, __skip__] for the
    // optional wrapper. Picking the accept value runs minor-improvement; if
    // the inner choice has only one option, it's auto-resolved against our
    // CARD_ID and the play happens before pending settles to confirmNextPlayer.
    const r1 = session.takeAction(0, 'meeting-place') as {
      ok: boolean
      pending?: { type?: string; options?: Array<{ value: string }> }
    }
    steps.push({ label: "takeAction(0,'meeting-place')", resp: r1 })
    if (r1.pending?.type !== 'choice') return { steps }

    const acceptOpt = (r1.pending.options ?? []).find((o) => o.value !== '__skip__')
    if (!acceptOpt) return { steps }
    const r2 = session.resolveChoice(0, acceptOpt.value) as {
      ok: boolean
      pending?: { type?: string; options?: Array<{ value: string }> }
    }
    steps.push({ label: `resolveChoice(0, ${acceptOpt.value}) [accept-minor]`, resp: r2 })

    // If a further minor-selection choice surfaces, resolve it; otherwise the
    // sole option was auto-resolved.
    if (r2.pending?.type === 'choice') {
      const r3 = session.resolveChoice(0, CARD_ID)
      steps.push({ label: `resolveChoice(0, ${CARD_ID})`, resp: r3 })
    }
    return { steps }
  },

  assert(session, _ctx, result): FixtureResult {
    const r1 = result.steps[0]!.resp as {
      ok: boolean
      error?: string
      pending?: { type?: string; options?: Array<{ value: string }> }
    }
    if (!r1.ok) {
      return { ok: false, reason: `takeAction(meeting-place) not ok: ${r1.error ?? '?'}` }
    }
    if (r1.pending?.type !== 'choice') {
      return {
        ok: false,
        reason: `expected pending.type='choice' (skip/accept) after meeting-place, got ${JSON.stringify(r1.pending)}`,
      }
    }
    // Verify CARD_ID survived the cost/prerequisite filter — it must appear
    // somewhere as a selectable target. If it didn't, either the optional
    // minor would not be offered (only __skip__) or the inner selection
    // would lack our card. We confirm by checking the final state below.
    const last = result.steps[result.steps.length - 1]!.resp as { ok: boolean; error?: string } | undefined
    if (!last || !last.ok) {
      return { ok: false, reason: `last step failed: ${last?.error ?? '?'}` }
    }
    const state = session.getState().state as any
    const p0 = state.players[0]
    if (!p0.minorPlayed.includes(CARD_ID)) {
      return {
        ok: false,
        reason: `expected ${CARD_ID} in minorPlayed (cost/prerequisite filter likely rejected it). minorPlayed=${JSON.stringify(p0.minorPlayed)}`,
      }
    }
    if (p0.minorHand.includes(CARD_ID)) {
      return { ok: false, reason: `card still in minorHand after play: ${JSON.stringify(p0.minorHand)}` }
    }
    if (p0.resources.wood !== 3) {
      return { ok: false, reason: `expected wood=3 (1 start - 1 cost + 3 gain), got ${p0.resources.wood}` }
    }
    if (p0.resources.food !== 1) {
      return { ok: false, reason: `expected food=1 (gain), got ${p0.resources.food}` }
    }
    const space = state.actionSpaces.find((s: any) => s.id === 'meeting-place')
    if (!space || space.takenBy.length !== 1) {
      return {
        ok: false,
        reason: `expected meeting-place takenBy.length=1, got ${JSON.stringify(space?.takenBy)}`,
      }
    }
    return { ok: true }
  },
}

export default fixture
