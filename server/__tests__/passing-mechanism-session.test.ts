import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

// 注册卡牌到 card registry（side-effect import，与项目其他 session 测试一致）
import '../../shared/cards/A/A1_Shelter'

describe('passing-mechanism: basic pass to next', () => {
  it('passing 卡购买后 next.minorHand 含且 buyer.minorPlayed 不含；emit card.passed 而非 card.played；totalMinorBuilt 不变', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const [p1, p2] = state.players

    p1!.minorHand = ['A1_Shelter']
    p2!.minorHand = ['__test_placeholder__']
    p1!.occupationHand = ['__test_placeholder__']
    p2!.occupationHand = ['__test_placeholder__']

    session.loadState(state)

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
    })

    const playedForA1 = after.events.filter(
      (e) => e.type === 'card.played' && (e as { cardId: string }).cardId === 'A1_Shelter',
    )
    expect(playedForA1).toHaveLength(0)
  })
})
