import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import { isCardFlagged, setCardFlag } from '../../shared/cards/helpers/card-state'
import { recordActionSnapshot } from '../../shared/cards/helpers/action-snapshot'
import '../../shared/cards/B/B27_Toolbox'
import '../../shared/cards/B/B150_LargeScaleFarmer'
import { B27_Toolbox_impl } from '../../shared/cards/B/B27_Toolbox'

const CARD_ID = 'B27_Toolbox'

const setupPlayed = (food = 5) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = { ...player.resources, food, wood: 20, clay: 20, reed: 20, stone: 20 }
  player.minorPlayed.push(CARD_ID)

  // 确保 Joinery / Pottery / Basket 在 availableMajorImprovements
  for (const id of ['Major_Joinery', 'Major_Pottery', 'Major_Basket']) {
    if (!state.availableMajorImprovements.includes(id)) {
      state.availableMajorImprovements.push(id)
    }
  }

  session.loadState(state)
  return session
}

describe('B27 Toolbox session', () => {
  it('已 played + 修房 → onEndTurn 弹一次买 major（不每次 construct 都弹）', () => {
    const session = setupPlayed()
    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // 推进到 ToolboxImprovement prompt：
    // farm-expansion OR → 选 construct seq → room select confirm w/ rooms payload → OR done → ToolboxImprovement
    let safety = 30
    let reachedBuyMajor = false
    while (resp.interaction.stateId === 'wait' && safety-- > 0) {
      const opts = resp.interaction.options
      const promptKey = (resp.pending as { promptKey?: string }).promptKey
      if (promptKey === 'ui.interactionToolboxImprovement') {
        reachedBuyMajor = true
        // 外层 optional 的 sourceCard 应是 B27
        const triggerOpt = opts.find(o => o.sourceCard === CARD_ID)
        expect(triggerOpt).toBeDefined()
        // flag 在 onEndTurn handler 内已清
        expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
        const skip = opts.find(o => o.value === '__skip__')
        expect(skip).toBeDefined()
        resp = session.resolveChoice(0, skip!.value)
        break
      }
      // Engine farm prompt: confirm with the first selectable room tile so we
      // actually build (B27 needs a real construct to trigger onEndTurn).
      if (promptKey === 'ui.interactionRoomSelect' && resp.interaction.stateId === 'wait' && resp.interaction.farm.farmType === 'room') {
        const tile = resp.interaction.farm.selectableTiles[0]!
        resp = session.resolveChoice(0, 'confirm', { rooms: [tile] })
        continue
      }
      // 若进入 farm-expansion OR 第二轮（含 __done__），选 done 结束
      const doneOpt = opts.find(o => o.value === '__done__')
      const constructOption = opts.find(o => /construct/i.test(o.value))
      const choice = constructOption ?? doneOpt ?? opts.find(o => o.value !== '__skip__') ?? opts[0]!
      resp = session.resolveChoice(0, choice.value)
    }
    expect(reachedBuyMajor).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('什么都没造 → onEndTurn 不弹', () => {
    const session = setupPlayed()
    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    // grain-seeds 直接 gain 1 grain，不修房 / 围栏 / stable
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('B27 在手里 + 已造过房（人工设置）+ 调 onBuy → flag set', () => {
    const session = setupPlayed()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = player.minorPlayed.filter(id => id !== CARD_ID)
    player.minorHand.push(CARD_ID)
    // 模拟"本 turn 已造过 1 个房间"：先快照后增加 roomTiles
    recordActionSnapshot(player, 1)
    player.roomTiles = [...(player.roomTiles ?? []), { row: 0, col: 0 }] as typeof player.roomTiles
    session.loadState(state)

    // 直接调用 effect.onBuy
    B27_Toolbox_impl.effect!.onBuy!(state, player)

    expect(isCardFlagged(player, CARD_ID)).toBe(true)
  })

  it('跨 turn flag 残留 + onBuy 时本 turn 没造 → flag 被清', () => {
    const session = setupPlayed()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = player.minorPlayed.filter(id => id !== CARD_ID)
    player.minorHand.push(CARD_ID)
    setCardFlag(player, CARD_ID, true)
    // 本 action 快照：什么都没造
    recordActionSnapshot(player, 99)
    session.loadState(state)

    B27_Toolbox_impl.effect!.onBuy!(state, player)

    expect(isCardFlagged(player, CARD_ID)).toBe(false)
  })

  it('与机制 A jump 共存：B150 jump 不重复触发 onEndTurn', () => {
    const session = setupPlayed()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('B150_LargeScaleFarmer')
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)

    let safety = 50
    while (resp.interaction.stateId === 'wait' && safety-- > 0) {
      const opts = resp.interaction.options
      const promptKey = (resp.pending as { promptKey?: string }).promptKey
      // Engine farm prompt: confirm with the first selectable room tile so we
      // actually build (test asserts construct → setFlag flow).
      if (promptKey === 'ui.interactionRoomSelect' && resp.interaction.stateId === 'wait' && resp.interaction.farm.farmType === 'room') {
        const tile = resp.interaction.farm.selectableTiles[0]!
        resp = session.resolveChoice(0, 'confirm', { rooms: [tile] })
        continue
      }
      // 优先选 construct（如果有）以确保修房触发 setFlag；
      // 修房完成后 OR 会有 __done__，优先选它结束 OR 进入 B150/B27 prompt。
      const constructOption = opts.find(o => o.value === 'construct' || /construct/i.test(o.value))
      const doneOpt = opts.find(o => o.value === '__done__')
      const choice = constructOption ?? doneOpt ?? opts.find(o => o.value !== '__skip__') ?? opts[0]!
      resp = session.resolveChoice(0, choice.value)
    }

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
  })
})
