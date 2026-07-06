import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getFenceCount } from '../../shared/actions/effects/fencing'
import { getOwnOrdinaryFenceCount } from '../../shared/domain/fence-segments'
import { setFencesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'
import type { ActionSpace } from '../../shared/contract/types'

import '../../shared/cards/C/C001_Overhaul'
import '../../shared/cards/E/E005_NightLoot'

const buyMinor = (
  session: GameSession,
  playerIndex: number,
  response: ReturnType<GameSession['takeAction']>,
  cardId: string,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  let cardPrompt = response
  const directOption = cardPrompt.interaction.request.options?.find((option) => option.value === cardId)
  if (!directOption) {
    const improvementOption = cardPrompt.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
    expect(improvementOption).toBeDefined()
    cardPrompt = session.resolveChoice(playerIndex, improvementOption!.value)
    expect(cardPrompt.ok).toBe(true)
    if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
    if (!cardPrompt.interaction.request.options?.some((option) => option.value === cardId)) {
      return cardPrompt
    }
  }
  const cardOption = cardPrompt.interaction.request.options?.find((option) => option.value === cardId)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(playerIndex, cardOption!.value)
}

describe('passing-mechanism: C001_Overhaul complex onBuy', () => {
  it('buyer 执行强制免费 rebuild，pending owner 是 buyer，卡传入 next.minorHand', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.players[0]!.minorHand = ['C001_Overhaul']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[0]!.occupationHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    state.players[0]!.occupationPlayed = ['__test_occ_a__', '__test_occ_b__']
    state.players[0]!.resources.wood = 1
    setFencesForTest(state.players[0]!, 3)
    session.loadState(state)

    const action = session.takeAction(0, 'meeting-place')
    const resp = buyMinor(session, 0, action, 'C001_Overhaul')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.minorHand).toContain('C001_Overhaul')
    expect(resp.state.players[0]!.minorPlayed).not.toContain('C001_Overhaul')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(getOwnOrdinaryFenceCount(resp.state.players[0]!)).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.request.kind).toBe('farm-select')

    const fenceResp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(fenceResp.ok).toBe(true)

    const buyer = fenceResp.state.players[0]!
    expect(getFenceCount(buyer)).toBe(4)
    expect(buyer.resources.wood).toBe(0)
    expect(buyer.pastures).toHaveLength(1)
    const passedEvents = fenceResp.state.events.filter((e) => e.type === 'card.passed')
    expect(passedEvents).toHaveLength(1)
    expect(passedEvents[0]).toMatchObject({
      type: 'card.passed',
      cardId: 'C001_Overhaul',
      fromPlayerId: fenceResp.state.players[0]!.id,
      toPlayerId: fenceResp.state.players[1]!.id,
    })
  })

  it('buyer 无 fence 时 onBuy 直接完成，卡仍传给 next', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.players[0]!.minorHand = ['C001_Overhaul']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[0]!.occupationHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    state.players[0]!.occupationPlayed = ['__test_occ_a__', '__test_occ_b__']
    state.players[0]!.resources.wood = 1
    session.loadState(state)

    const action = session.takeAction(0, 'meeting-place')
    const resp = buyMinor(session, 0, action, 'C001_Overhaul')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.minorHand).toContain('C001_Overhaul')
    expect(resp.state.players[0]!.minorPlayed).not.toContain('C001_Overhaul')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request?.kind).not.toBe('farm-select')
    }
  })
})

describe('passing-mechanism: E005_NightLoot complex onBuy', () => {
  it('buyer onBuy auto-executes batch collect；P0 获得 wood+stone；卡传入 next.minorHand', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.players[0]!.minorHand = ['E005_NightLoot']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[0]!.occupationHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    state.players[0]!.resources.food = 5

    // 设置仅一个 wood+stone pair 的 accumulation space
    const woodSpace = state.actionSpaces.find((s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0)
    const stoneSpace = state.actionSpaces.find((s: ActionSpace) => (s.gainPerRound.stone ?? 0) > 0)
    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
      s.resources.clay = 0
      s.resources.reed = 0
      s.resources.stone = 0
    })
    if (woodSpace) woodSpace.resources.wood = 3
    if (stoneSpace) stoneSpace.resources.stone = 2

    session.loadState(state)

    const action = session.takeAction(0, 'meeting-place')
    const buyResp = buyMinor(session, 0, action, 'E005_NightLoot')
    expect(buyResp.ok).toBe(true)

    // 卡已传给 P2（passing 核心行为）
    expect(buyResp.state.players[1]!.minorHand).toContain('E005_NightLoot')
    expect(buyResp.state.players[0]!.minorPlayed).not.toContain('E005_NightLoot')

    if (!woodSpace || !stoneSpace) return

    // 单一 pair 时 xor 自动 collapse + seq 两个 collect leaf auto-execute
    // onBuy 在 resolveChoice 内即完成，P0 立即获得 wood + stone
    const buyer = buyResp.state.players[0]!
    expect(buyer.resources.wood).toBeGreaterThanOrEqual(1)
    expect(buyer.resources.stone).toBeGreaterThanOrEqual(1)

    // accumulation space 资源已减少
    const woodSpaceAfter = buyResp.state.actionSpaces.find((s: ActionSpace) => s.id === woodSpace.id)
    const stoneSpaceAfter = buyResp.state.actionSpaces.find((s: ActionSpace) => s.id === stoneSpace.id)
    expect(woodSpaceAfter?.resources.wood).toBeLessThan(3)
    expect(stoneSpaceAfter?.resources.stone).toBeLessThan(2)

    // card.passed event 存在
    const passedEvents = buyResp.state.events.filter((e) => e.type === 'card.passed')
    expect(passedEvents).toHaveLength(1)
    expect(passedEvents[0]).toMatchObject({
      type: 'card.passed',
      cardId: 'E005_NightLoot',
      fromPlayerId: buyResp.state.players[0]!.id,
      toPlayerId: buyResp.state.players[1]!.id,
    })
  })
})
