import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getFenceCount } from '../../shared/actions/effects/fencing'
import { setFencesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'
import type { ActionSpace } from '../../shared/contract/types'

import '../../shared/cards/C/C1_Overhaul'
import '../../shared/cards/E/E5_NightLoot'

describe('passing-mechanism: C1_Overhaul complex onBuy', () => {
  it('buyer 完整执行栅栏拆除 + free rebuild pending，pending owner 是 buyer，卡传入 next.minorHand', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.players[0]!.minorHand = ['C1_Overhaul']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[0]!.occupationHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    state.players[0]!.occupationPlayed = ['__test_occ_a__', '__test_occ_b__']
    state.players[0]!.resources.wood = 5
    setFencesForTest(state.players[0]!, 3)
    session.loadState(state)

    session.takeAction(0, 'meeting-place')
    let resp = session.resolveChoice(0, 'minor:C1_Overhaul')
    expect(resp.ok).toBe(true)

    // 卡已传给 P2（passing 核心行为）
    expect(resp.state.players[1]!.minorHand).toContain('C1_Overhaul')
    expect(resp.state.players[0]!.minorPlayed).not.toContain('C1_Overhaul')

    // onBuy 是 optional seq，先确认执行（选非 __skip__ 选项）
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.playerIndex).toBe(0)
    const seqOption = resp.interaction.options?.find((o: { value: string }) => o.value !== '__skip__')
    expect(seqOption).toBeDefined()

    const seqResp = session.resolveChoice(0, seqOption!.value)
    expect(seqResp.ok).toBe(true)

    // consume-fence 已运行（fence 数为 0），等待 fence farmSelect（buyer P0 负责解决）
    expect(getFenceCount(seqResp.state.players[0]!)).toBe(0)
    expect(seqResp.interaction.stateId).toBe('wait')
    expect(seqResp.interaction.playerIndex).toBe(0)
    expect(seqResp.interaction.request?.kind).toBe('farm-select')

    // 执行 fence rebuild（注：passing 后 buyer 不再持有 C1，c1 discount listener 不触发，
    // 属已知 gap，此处只验证 fence action 本身可执行）
    const fenceResp = session.resolveChoice(0, 'confirm', {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(fenceResp.ok).toBe(true)

    const buyer = fenceResp.state.players[0]!
    expect(getFenceCount(buyer)).toBe(4)
    expect(buyer.pastures).toHaveLength(1)

    // c1Active flag 已清除
    expect(buyer.cardStates?.['C1_Overhaul']?.extraData?.c1Active).toBeFalsy()

    // card.passed event 存在
    const passedEvents = fenceResp.state.events.filter((e) => e.type === 'card.passed')
    expect(passedEvents).toHaveLength(1)
    expect(passedEvents[0]).toMatchObject({
      type: 'card.passed',
      cardId: 'C1_Overhaul',
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
    state.players[0]!.minorHand = ['C1_Overhaul']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[0]!.occupationHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    state.players[0]!.occupationPlayed = ['__test_occ_a__', '__test_occ_b__']
    state.players[0]!.resources.wood = 1
    session.loadState(state)

    session.takeAction(0, 'meeting-place')
    const resp = session.resolveChoice(0, 'minor:C1_Overhaul')
    expect(resp.ok).toBe(true)

    // 卡传给 P2
    expect(resp.state.players[1]!.minorHand).toContain('C1_Overhaul')
    expect(resp.state.players[0]!.minorPlayed).not.toContain('C1_Overhaul')

    // 无 fence 时不会出现 farm-select pending
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request?.kind).not.toBe('farm-select')
    }
  })
})

describe('passing-mechanism: E5_NightLoot complex onBuy', () => {
  it('buyer onBuy auto-executes batch collect；P0 获得 wood+stone；卡传入 next.minorHand', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.players[0]!.minorHand = ['E5_NightLoot']
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

    session.takeAction(0, 'meeting-place')
    const buyResp = session.resolveChoice(0, 'minor:E5_NightLoot')
    expect(buyResp.ok).toBe(true)

    // 卡已传给 P2（passing 核心行为）
    expect(buyResp.state.players[1]!.minorHand).toContain('E5_NightLoot')
    expect(buyResp.state.players[0]!.minorPlayed).not.toContain('E5_NightLoot')

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
      cardId: 'E5_NightLoot',
      fromPlayerId: buyResp.state.players[0]!.id,
      toPlayerId: buyResp.state.players[1]!.id,
    })
  })
})
