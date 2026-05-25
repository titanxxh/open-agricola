import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/B/B32_Kettle'
import '../../shared/cards/C/C115_Sower'
import '../../shared/cards/D/D106_WhiskyDistiller'

const KETTLE = 'B32_Kettle'
const WHISKY = 'D106_WhiskyDistiller'
const WHISKY_ANYTIME_ID = 'D106-whisky-distiller-anytime'
const SOWER = 'C115_Sower'
const SOWER_ANYTIME_ID = 'C115-sower-anytime'

const setupExchangeReady = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
  const p0 = state.players[0]!
  p0.minorPlayed.push(KETTLE)
  p0.minorPlayed.push(WHISKY)
  p0.resources = { ...p0.resources, grain: 10, food: 0 }
  session.loadState(state)
  return session
}

describe('anytime nesting — sync card listener inside pending', () => {
  it('exchange pending → D106 → exchange resumes; resources accurate', () => {
    const session = setupExchangeReady()
    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    const exch = session.takeAnytimeAction(0, 'exchange')
    expect(exch.ok).toBe(true)
    expect(exch.interaction.anytimeActions.map((a) => a.id)).toContain(WHISKY_ANYTIME_ID)
    expect(exch.interaction.anytimeActions.map((a) => a.id)).not.toContain('exchange')

    const grainBefore = exch.state.players[0]!.resources.grain
    const whisky = session.takeAnytimeAction(0, WHISKY_ANYTIME_ID)
    expect(whisky.ok).toBe(true)
    expect(whisky.state.players[0]!.resources.grain).toBe(grainBefore - 1)
    expect((whisky.interaction as { promptKey?: string }).promptKey).toMatch(/^ui\.interactionExchange/)

    const done = session.resolveChoice(0, 'bulk:0=1')
    expect(done.ok).toBe(true)
    // Net: grain 10 - 1 (D106) - 1 (exchange) = 8; food 0 + 3 = 3
    expect(done.state.players[0]!.resources.grain).toBe(8)
    expect(done.state.players[0]!.resources.food).toBe(3)
  })

  it('animal-reorg sub-flow → D106 → animal-reorg resumes; cancel completes flow', () => {
    const session = setupExchangeReady()
    const p0 = session.getState().state.players[0]!
    p0.resources = { ...p0.resources, sheep: 3 }
    ;(session as unknown as { startReorgSubFlow: (i: number, t: string) => void })
      .startReorgSubFlow(0, 'anytime')

    const snapshot = session.getState()
    expect((snapshot.interaction as { promptKey?: string }).promptKey).toBe('ui.interactionAnimalReorg')

    const grainBefore = snapshot.state.players[0]!.resources.grain
    const whisky = session.takeAnytimeAction(0, WHISKY_ANYTIME_ID)
    expect(whisky.ok).toBe(true)
    expect(whisky.state.players[0]!.resources.grain).toBe(grainBefore - 1)
    expect((whisky.interaction as { promptKey?: string }).promptKey).toBe('ui.interactionAnimalReorg')

    const cancel = session.resolveChoice(0, 'cancel')
    expect(cancel.ok).toBe(true)
  })

  it('exchange pending → C115 xor anytime → sub-choice completes → exchange resumes', () => {
    const session = setupExchangeReady()
    const extraState = session.getState().state
    const p0 = extraState.players[0]!
    p0.minorPlayed.push(SOWER)
    if (!p0.cardStates[SOWER]) p0.cardStates[SOWER] = {}
    p0.cardStates[SOWER]!.stack = ['reed']
    session.loadState(extraState)

    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    expect(session.takeAnytimeAction(0, 'exchange').ok).toBe(true)

    const nested = session.takeAnytimeAction(0, SOWER_ANYTIME_ID)
    expect(nested.ok).toBe(true)
    expect((nested.interaction as { promptKey?: string }).promptKey)
      .not.toMatch(/^ui\.interactionExchange/)

    const subOptions = (nested.interaction as { options?: Array<{ value: string }> }).options ?? []
    const subDone = session.resolveChoice(0, subOptions[0]!.value)
    expect(subDone.ok).toBe(true)

    expect((subDone.interaction as { promptKey?: string }).promptKey)
      .toMatch(/^ui\.interactionExchange/)

    const finalDone = session.resolveChoice(0, 'bulk:0=1')
    expect(finalDone.ok).toBe(true)
  })

  it('does not attribute injected anytime exchange resources to the parent action log', () => {
    const session = setupExchangeReady()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources = { ...player.resources, wood: 5, reed: 2, grain: 10, food: 0 }
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    resp = session.resolveChoice(0, 'bulk:0=1')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected farm-expansion prompt')

    const stableOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.stables.name',
    )
    expect(stableOption).toBeDefined()

    resp = session.resolveChoice(0, stableOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected stable prompt')
    expect(resp.interaction.farm.farmType).toBe('stable')
    if (resp.interaction.farm.farmType !== 'stable') throw new Error('expected stable prompt')

    const stable = resp.interaction.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    expect(resp.ok).toBe(true)

    const actionDetail = resp.state.log.find((entry) =>
      entry.key === 'log.actionDetail' &&
      entry.params?.action === 'actions.farm-expansion.name',
    )
    expect(actionDetail).toBeDefined()
    const detailParts = actionDetail?.params?.detailParts as
      | {
        gains?: { food?: number }
        costs?: { grain?: number; wood?: number }
        effects?: { buildStables?: number }
      }
      | undefined

    expect(detailParts?.gains?.food ?? 0).toBe(0)
    expect(detailParts?.costs?.grain ?? 0).toBe(0)
    expect(detailParts?.costs?.wood).toBe(2)
    expect(detailParts?.effects?.buildStables).toBe(1)
  })
})
