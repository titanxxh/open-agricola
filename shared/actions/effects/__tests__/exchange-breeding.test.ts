import { installOfficialCardRegistry } from '../../../cards/__tests__/card-environment'

installOfficialCardRegistry()

import { describe, expect, it } from 'vitest'
import '../../../cards/register-all'
import { createInitialState } from '../../../session/state-bootstrap'
import { anytimeExchangeAction, canAffordTrade, getFeedExchangeCatalog, getMaxTradeTimes } from '../exchange'
import type { Trade } from '../../../contract/types'
import { BASE_ANIMAL_KEYS } from '../../../contract/animals'
import type { DraftGameEvent } from '../../../contract/events'

describe('breeding exchange rule applies to direct and query paths', () => {
  it.each(['sheep', 'boar', 'cattle', 'horse'] as const)('rejects direct %s cooking consistently without mutation', animal => {
    const state = createInitialState(1158, { playerCount: 2, enableFarmersOfTheMoor: animal === 'horse' })
    state.roundPhase = 'breeding'
    const player = state.players[0]!
    player.resources[animal] = 3
    const trade: Trade = { from: { [animal]: 1 }, to: { food: 2 } }
    const events: DraftGameEvent[] = []
    const context = { state, player, space: state.actionSpaces[0]!, actionContext: { directTrade: trade },
      eventSink: { emit: (event: DraftGameEvent) => { events.push(event) }, emitMany: (batch: DraftGameEvent[]) => { events.push(...batch) } },
    }
    const before = { ...player.resources }
    expect(canAffordTrade(player, trade, 1, state)).toBe(false)
    expect(getMaxTradeTimes(player, trade, state)).toBe(0)
    expect(anytimeExchangeAction.previewEffect?.(context)).toEqual({ kind: 'exchangeCatalog', choices: [] })
    expect(anytimeExchangeAction.canBeExecutedByPlayer(state, player, { actionContext: context.actionContext })).toBe(false)
    expect(anytimeExchangeAction.execute(context)).toEqual({ type: 'fail', errorKey: 'log.actionNoExchange' })
    expect(player.resources).toEqual(before)
    expect(events).toEqual([])
  })

  it('removes cooking from the feed catalog while preserving stable recipe identities', () => {
    const state = createInitialState(1158, { playerCount: 2 })
    const player = state.players[0]!
    player.improvements = ['Major_Fireplace1']
    player.resources.sheep = 3
    player.resources.vegetable = 1
    const before = getFeedExchangeCatalog(player, state)
    const vegetable = before.find(entry => entry.sourceId === 'Major_Fireplace1' && entry.from.vegetable === 1)
    expect(vegetable).toBeDefined()
    state.roundPhase = 'breeding'
    const catalog = getFeedExchangeCatalog(player, state)
    expect(catalog.some(entry => (entry.to.food ?? 0) > 0 && BASE_ANIMAL_KEYS.some(animal => (entry.from[animal] ?? 0) > 0))).toBe(false)
    expect(catalog.find(entry => entry.sourceId === 'Major_Fireplace1' && entry.from.vegetable === 1)).toEqual(vegetable)
    state.roundPhase = 'feeding'
    expect(getFeedExchangeCatalog(player, state)).toEqual(before)
  })

  it('blocks mixed animal-to-food recipes but permits animal-to-resource and crop-to-food recipes', () => {
    const state = createInitialState(1158, { playerCount: 2 })
    state.roundPhase = 'breeding'
    const player = state.players[0]!
    Object.assign(player.resources, { sheep: 2, grain: 2 })
    expect(canAffordTrade(player, { from: { sheep: 1, grain: 1 }, to: { food: 1, stone: 1 } }, 1, state)).toBe(false)
    expect(canAffordTrade(player, { from: { sheep: 1 }, to: { stone: 1 } }, 1, state)).toBe(true)
    expect(canAffordTrade(player, { from: { grain: 1 }, to: { food: 1 } }, 1, state)).toBe(true)
  })
})
