import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { confirmNextPlayer } from './_helpers/legacy-confirms'

// 注册卡牌到 card registry（side-effect import，与项目其他 session 测试一致）
import '../../shared/cards/A/A1_Shelter'
import '../../shared/cards/C/C1_Overhaul'

function setupPassingSession(opts: {
  playerCount?: number
  startPlayerIndex?: number
  buyerMinorHand?: string[]
} = {}) {
  const playerCount = opts.playerCount ?? 2
  const startIdx = opts.startPlayerIndex ?? 0
  const session = playerCount === 2
    ? new GameSession()
    : new GameSession(undefined, undefined, { playerCount })
  const state = session.getState().state
  state.players = state.players.slice(0, playerCount)
  state.currentPlayerIndex = startIdx
  state.round = 1
  for (let i = 0; i < playerCount; i++) {
    state.players[i]!.minorHand =
      i === startIdx ? (opts.buyerMinorHand ?? ['__test_placeholder__']) : ['__test_placeholder__']
    state.players[i]!.occupationHand = ['__test_placeholder__']
  }
  session.loadState(state)
  return { session, state }
}

describe('passing-mechanism: basic pass to next', () => {
  it('passing 卡购买后 next.minorHand 含且 buyer.minorPlayed 不含；emit card.passed 而非 card.played；totalMinorBuilt 不变', () => {
    const { session } = setupPassingSession({ buyerMinorHand: ['A1_Shelter'] })

    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'minor:A1_Shelter')
    expect(resp.ok).toBe(true)

    const after = resp.state
    expect(after.players[1]!.minorHand).toContain('A1_Shelter')
    expect(after.players[0]!.minorPlayed).not.toContain('A1_Shelter')
    expect(after.players[0]!.stats.totalMinorBuilt).toBe(0)

    const passedEvents = after.events.filter((e) => e.type === 'card.passed')
    expect(passedEvents).toHaveLength(1)
    expect(passedEvents[0]).toMatchObject({
      type: 'card.passed',
      cardId: 'A1_Shelter',
      fromPlayerId: after.players[0]!.id,
      toPlayerId: after.players[1]!.id,
      sourceActionId: 'apply-improvement',
      sourceCardId: 'A1_Shelter',
    })

    const playedForA1 = after.events.filter(
      (e) => e.type === 'card.played' && (e as { cardId: string }).cardId === 'A1_Shelter',
    )
    expect(playedForA1).toHaveLength(0)
  })
})

// activeModifiers skip 由 Task 3 Step 3.1 静态保证（passing 分支不调 getCardModifiers），不写运行时单卡用例

describe('passing-mechanism: cycle and wrap', () => {
  it('2 人轮转 2 圈：每次 buy 都 pass；stats 始终为 0；events 共 2 个 card.passed', () => {
    const { session } = setupPassingSession({ buyerMinorHand: ['A1_Shelter'] })

    // P1 用 meeting-place 买 A1 → A1 传到 P2.minorHand
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(0, 'minor:A1_Shelter')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.minorHand).toContain('A1_Shelter')

    // 推进到 P2 回合（meeting-place 结束后触发 confirm-next-player）
    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.currentPlayerIndex).toBe(1)

    // P2 用 major-improvement（roundAvailable: 1，包含 minor/major 选项）买 A1
    // 此时 A1 是 P2.minorHand 唯一的真实卡，engine 单选项自动 resolve
    // meeting-place 已被 P1 占用，P2 只能用其他入口
    resp = session.takeAction(1, 'major-improvement')
    expect(resp.ok).toBe(true)
    // 单选项 auto-resolve：A1 直接 pass，行动完成，进入 confirm-next-player
    // 已传回 P1.minorHand
    expect(resp.state.players[0]!.minorHand).toContain('A1_Shelter')
    expect(resp.state.players[0]!.stats.totalMinorBuilt).toBe(0)
    expect(resp.state.players[1]!.stats.totalMinorBuilt).toBe(0)

    // 全局 events 中累计 2 个 card.passed
    const passedEvents = resp.state.events.filter((e) => e.type === 'card.passed')
    expect(passedEvents).toHaveLength(2)
  })

  it('3 人 wrap：座次最后一位买 → 第一位接收', () => {
    const { session } = setupPassingSession({
      playerCount: 3,
      startPlayerIndex: 2,
      buyerMinorHand: ['A1_Shelter'],
    })

    // P3（index 2）用 meeting-place 买 → (2 + 1) % 3 === 0 → 传到 P1
    let resp = session.takeAction(2, 'meeting-place')
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(2, 'minor:A1_Shelter')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.minorHand).toContain('A1_Shelter')
    expect(resp.state.players[2]!.minorPlayed).not.toContain('A1_Shelter')
  })
})

describe('passing-mechanism: undo', () => {
  it('undoAction 后 buyer.minorHand 恢复 / next.minorHand 不含 / events 移除 card.passed', () => {
    const { session, state } = setupPassingSession({ buyerMinorHand: ['A1_Shelter'] })
    const woodBefore = state.players[0]!.resources.wood ?? 0

    session.takeAction(0, 'meeting-place')
    let resp = session.resolveChoice(0, 'minor:A1_Shelter')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.minorHand).toContain('A1_Shelter')

    resp = session.undoAction()
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.minorHand).toContain('A1_Shelter')
    expect(resp.state.players[1]!.minorHand).not.toContain('A1_Shelter')
    expect(resp.state.players[0]!.resources.wood ?? 0).toBe(woodBefore)

    const passedActive = resp.state.events.filter((e) => e.type === 'card.passed')
    expect(passedActive).toHaveLength(0)
  })
})

describe('passing-mechanism: receiver behavior', () => {
  it('receiver 不选 passing 卡时卡仍留 minorHand', () => {
    const { session } = setupPassingSession({ buyerMinorHand: ['A1_Shelter'] })

    session.takeAction(0, 'meeting-place')
    let resp = session.resolveChoice(0, 'minor:A1_Shelter')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.minorHand).toContain('A1_Shelter')

    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.currentPlayerIndex).toBe(1)

    resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)

    expect(session.getState().state.players[1]!.minorHand).toContain('A1_Shelter')
  })

  it('prerequisite 不满足时 receiver 的 minor candidate 不含该卡', () => {
    const { session, state } = setupPassingSession({ buyerMinorHand: ['C1_Overhaul'] })
    state.players[0]!.occupationPlayed = ['__test_occ_a__', '__test_occ_b__']
    state.players[0]!.resources.wood = 1
    session.loadState(state)

    session.takeAction(0, 'meeting-place')
    let resp = session.resolveChoice(0, 'minor:C1_Overhaul')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.minorHand).toContain('C1_Overhaul')

    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.currentPlayerIndex).toBe(1)

    resp = session.takeAction(1, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    const options = (resp.interaction.options ?? []).map((o: { value: string }) => o.value)
    expect(options).not.toContain('minor:C1_Overhaul')
    expect(session.getState().state.players[1]!.minorHand).toContain('C1_Overhaul')
  })
})
