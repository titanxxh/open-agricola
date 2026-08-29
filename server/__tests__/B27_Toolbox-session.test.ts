import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { isCardFlagged, setCardFlag, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { endTurnScope, recordActionSnapshot } from '../../shared/cards/helpers/action-snapshot'
import '../../shared/cards/A/A040_PottersYard'
import '../../shared/cards/B/B027_Toolbox'
import '../../shared/cards/B/B150_LargeScaleFarmer'
import '../../shared/cards/C/C094_StableCleaner'
import '../../shared/cards/E/E052_Cubbyhole'
import { B027_Toolbox_impl } from '../../shared/cards/B/B027_Toolbox'

const CARD_ID = 'B027_Toolbox'
const POTTERS_YARD_ID = 'A040_PottersYard'
const CUBBYHOLE_ID = 'E052_Cubbyhole'
const STABLE_CLEANER_ID = 'C94-stable-cleaner-anytime'

const setupPlayed = (food = 5) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
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
    const initialState = session.getState().state
    initialState.players[0]!.occupationPlayed.push('C094_StableCleaner')
    session.loadState(initialState)
    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // 推进到 ToolboxImprovement prompt：
    // farm-expansion OR → 选 construct seq → room select confirm w/ rooms payload → OR done → ToolboxImprovement
    let safety = 30
    let reachedBuyMajor = false
    while (resp.interaction.stateId === 'wait' && safety-- > 0) {
      const opts = resp.interaction.request.options ?? []
      const promptKey = (resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
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
      if (promptKey === 'ui.interactionRoomSelect' && resp.interaction.stateId === 'wait' && resp.interaction.request.farm.farmType === 'room') {
        const tile = resp.interaction.request.farm.selectableTiles[0]!
        resp = session.commitSelectionChoice(0, { rooms: [tile] })
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

    resp = session.takeAnytimeAction(0, STABLE_CLEANER_ID)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const stable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId)
      .toBe('confirm-next-player')
  })

  it('什么都没造 → onEndTurn 不弹', () => {
    const session = setupPlayed()
    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    // grain-seeds 直接 gain 1 grain，不修房 / 围栏 / stable
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('confirm-next-player 使用 Stable Cleaner 后立即且仅一次提供 Toolbox', () => {
    const session = setupPlayed()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push('C094_StableCleaner')
    player.minorPlayed.push(POTTERS_YARD_ID)
    writeCardExtraData(player, POTTERS_YARD_ID, 'clayRemaining', 1)
    session.loadState(state)

    let resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId)
      .toBe('confirm-next-player')

    resp = session.takeAnytimeAction(0, STABLE_CLEANER_ID)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('farm-select')

    const firstStable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [firstStable] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(19)
    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('select-trigger')

    const toolboxFlag = resp.interaction.request.options?.find((option) => option.sourceCard === CARD_ID)
    expect(toolboxFlag).toBeDefined()
    resp = session.resolveChoice(0, toolboxFlag!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).not.toBe('ui.interactionToolboxImprovement')

    const pottersYard = resp.interaction.request.options?.find((option) => option.sourceCard === POTTERS_YARD_ID)
    expect(pottersYard).toBeDefined()
    resp = session.resolveChoice(0, pottersYard!.value)
    expect(resp.state.players[0]!.resources.clay).toBe(21)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).not.toBe('ui.interactionToolboxImprovement')

    const skipPottersYard = resp.interaction.request.options?.find((option) => option.value === '__skip__')
    expect(skipPottersYard).toBeDefined()
    resp = session.resolveChoice(0, skipPottersYard!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionToolboxImprovement')

    const skip = resp.interaction.request.options?.find((option) => option.value === '__skip__')
    expect(skip).toBeDefined()
    resp = session.resolveChoice(0, skip!.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId)
      .toBe('confirm-next-player')

    resp = session.takeAnytimeAction(0, STABLE_CLEANER_ID)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const secondStable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [secondStable] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles).toHaveLength(2)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId)
      .toBe('confirm-next-player')
  })

  it('空栈的回合前 Stable Cleaner 归入即将进行的 turn', () => {
    const session = setupPlayed()
    const state = session.getState().state
    const first = state.players[0]!
    const second = state.players[1]!
    first.minorPlayed = first.minorPlayed.filter((cardId) => cardId !== CARD_ID)
    second.minorPlayed.push(CARD_ID)
    second.occupationPlayed.push('C094_StableCleaner')
    second.resources = { ...second.resources, food: 5, wood: 20, clay: 20, reed: 20, stone: 20 }
    const previousTurnToken = recordActionSnapshot(second, 77)
    endTurnScope(second)
    writeCardExtraData(second, CARD_ID, 'windowOfferedTurnToken', previousTurnToken)
    session.loadState(state)

    let resp = session.takeAction(0, 'grain-seeds')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId)
      .toBe('confirm-next-player')
    resp = session.resolveChoice(0, 'confirm')
    expect(resp.state.currentPlayerIndex).toBe(1)

    resp = session.takeAnytimeAction(1, STABLE_CLEANER_ID)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const stable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(1, { stables: [stable] })
    expect(resp.ok).toBe(true)
    expect(isCardFlagged(resp.state.players[1]!, CARD_ID)).toBe(true)
    expect(resp.interaction.stateId).not.toBe('wait')

    resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionToolboxImprovement')
  })

  it('与 E52 同时 after construct 时仍显示并执行 Toolbox flag listener', () => {
    const session = setupPlayed()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CUBBYHOLE_ID)
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)

    let sawGroupedTrigger = false
    let safety = 30
    while (resp.interaction.stateId === 'wait' && safety-- > 0) {
      const promptKey = resp.interaction.promptKey
      if (resp.interaction.request.kind === 'select-trigger') {
        const opts = resp.interaction.request.options ?? []
        expect(opts.find(o => o.sourceCard === CARD_ID)).toBeDefined()
        expect(opts.find(o => o.sourceCard === CUBBYHOLE_ID)).toBeDefined()
        const toolbox = opts.find(o => o.sourceCard === CARD_ID)!
        expect(toolbox.disabled).not.toBe(true)
        resp = session.resolveChoice(0, toolbox.value)
        expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(true)
        sawGroupedTrigger = true
        break
      }
      if (promptKey === 'ui.interactionRoomSelect' && resp.interaction.request.farm.farmType === 'room') {
        const tile = resp.interaction.request.farm.selectableTiles[0]!
        resp = session.commitSelectionChoice(0, { rooms: [tile] })
        continue
      }
      const opts = resp.interaction.request.options ?? []
      const constructOption = opts.find(o => o.value === 'construct' || /construct/i.test(o.value))
      const doneOpt = opts.find(o => o.value === '__done__')
      const choice = constructOption ?? doneOpt ?? opts.find(o => o.value !== '__skip__') ?? opts[0]!
      resp = session.resolveChoice(0, choice.value)
    }

    expect(sawGroupedTrigger).toBe(true)
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
    B027_Toolbox_impl.effect!.onBuy!(state, player)

    expect(isCardFlagged(player, CARD_ID)).toBe(true)
  })

  it('B27 在手里 + 本回合只造 Wood Palisade + 调 onBuy → flag unset', () => {
    const session = setupPlayed()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = player.minorPlayed.filter(id => id !== CARD_ID)
    player.minorHand.push(CARD_ID)
    recordActionSnapshot(player, 1)
    player.fenceSegments = [{ edge: 'H-0-0', type: 'palisade' }]
    session.loadState(state)

    B027_Toolbox_impl.effect!.onBuy!(state, player)

    expect(isCardFlagged(player, CARD_ID)).toBe(false)
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

    B027_Toolbox_impl.effect!.onBuy!(state, player)

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
      const promptKey = (resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      // Engine farm prompt: confirm with the first selectable room tile so we
      // actually build (test asserts construct → setFlag flow).
      if (promptKey === 'ui.interactionRoomSelect' && resp.interaction.stateId === 'wait' && resp.interaction.request.farm.farmType === 'room') {
        const tile = resp.interaction.request.farm.selectableTiles[0]!
        resp = session.commitSelectionChoice(0, { rooms: [tile] })
        continue
      }
      if (resp.interaction.request.kind !== 'choice') break
      const opts = resp.interaction.request.options ?? []
      // 优先选 construct（如果有）以确保修房触发 setFlag；
      // 修房完成后 OR 会有 __done__，优先选它结束 OR 进入 B150/B27 prompt。
      const constructOption = opts.find(o => o.value === 'construct' || /construct/i.test(o.value))
      const doneOpt = opts.find(o => o.value === '__done__')
      const choice = constructOption ?? doneOpt ?? opts.find(o => o.value !== '__skip__') ?? opts[0]
      if (!choice) break
      resp = session.resolveChoice(0, choice.value)
    }

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
  })
})
