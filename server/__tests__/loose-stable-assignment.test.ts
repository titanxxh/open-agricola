import { describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, getChoiceOptions, undoRuleSnapshot } from './_helpers/session-assertions'
import { computeAnimalZones, enforceAnimalCapacity } from '../../shared/domain/animal-zones'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getEmptyUnfencedStableCountForCards } from '../../shared/domain/stables'
import { A038_WoolBlankets_impl } from '../../shared/cards/A/A038_WoolBlankets'

// Count-bearing holder repair uses real two-player animal acquisition and
// confirmation. Capacity-only assertions do not verify persistent assignment.
const evidence = createScenarioEvidence(import.meta.url)
function succeeded(response: SessionResponse) {
  expect(response.ok, response.error).toBe(true)
  return response
}
function setup(card: string, sheep: number, secondStable = false) {
  return evidence.track(createWorkSession({ seed: 4242, configure(state) {
    state.round = 14
    for (const player of state.players) Object.assign(player.resources, { food: 40, sheep: 0 })
    const player = state.players[0]!
    player.minorPlayed = card === 'E012_AnimalBedding' ? [card] : []
    player.occupationPlayed = card === 'C089_StableMaster' ? [card] : []
    player.roomTiles = [{ row: 2, col: 0 }, { row: 1, col: 0 }]
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]
    player.stableTiles = [{ row: 0, col: 1 }]
    if (secondStable) player.stableTiles.push({ row: 0, col: 2 })
    player.stableAnimals = {}
    player.houseAnimals = {}
    player.pastures = []
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = sheep
  } }))
}
function recover(session: GameSession) {
  const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  return { saved, session: evidence.track(new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved))))) }
}
function assignment(response: SessionResponse, stableCount: number) {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') throw new Error('Expected animal reorganization')
  return response.interaction.request.zones.map(zone => ({ ...zone,
    animalType: zone.id === 'stable:0-1' || zone.id === 'house:2-0' ? 'sheep' : null,
    animalCount: zone.id === 'stable:0-1' ? stableCount : zone.id === 'house:2-0' ? 1 : 0,
  }))
}
describe('Loose Stable Animal Holder assignments', () => {
  it.each([
    ['E012_AnimalBedding', 3, 2, 2],
    ['E012_AnimalBedding', 2, 1, 2],
    ['C089_StableMaster', 4, 3, 3],
    ['', 2, 1, 1],
  ])('persists %s with inventory %i after one confirmation and handoff', (card, sheep, stableCount, capacity) => {
    const session = setup(card, sheep)
    const pending = succeeded(session.takeAction(0, 'sheep-market'))
    const accepted = succeeded(session.resolveChoice(0, 'confirm', { zones: assignment(pending, stableCount) }))
    expect(accepted.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const next = confirmNext(session, accepted)
    for (const response of [accepted, next, session.getState()]) {
      expect(response.state.players[0]!.resources.sheep).toBe(sheep)
      expect(response.state.players[0]!.stableAnimals).toEqual({ '0-1': { animalType: 'sheep', animalCount: stableCount } })
    }
    const zones = session.withCtx(() => computeAnimalZones(session.state.players[0]!, session.state))
    expect(zones.find(zone => zone.id === 'stable:0-1')).toMatchObject({ capacity, animalCount: stableCount })
    expect(zones.reduce((count, zone) => count + (zone.animalCount ?? 0), 0)).toBe(sheep)
    expect(next.interaction.stateId).toBe('idle')
    expect(next.state.currentPlayerIndex).toBe(1)
  })

  it('rejects C089 over-capacity and invalid-owner input before and after recovery, then accepts one legal allocation', () => {
    let session = setup('C089_StableMaster', 4, true)
    succeeded(session.takeAction(0, 'sheep-market'))
    for (const restored of [false, true]) {
      if (restored) session = recover(session).session
      const pending = session.getState()
      for (const [zoneId, count] of [['stable:0-1', 4], ['stable:0-2', 2]] as const) {
        const zones = assignment(pending, 3).map(zone => zone.id === zoneId ? { ...zone, animalCount: count, animalType: 'sheep' } : zone)
        assertRejectedUnchanged(session, () => session.resolveChoice(0, 'confirm', { zones }))
        assertRejectedUnchanged(session, () => session.resolveChoice(0, 'confirm', { zones }))
      }
      assertRejectedUnchanged(session, () => session.resolveChoice(1, 'confirm', { zones: assignment(pending, 3) }))
    }
    const accepted = succeeded(session.resolveChoice(0, 'confirm', { zones: assignment(session.getState(), 3) }))
    expect(accepted.state.players[0]!.stableAnimals).toEqual({ '0-1': { animalType: 'sheep', animalCount: 3 } })
    expect(accepted.state.players[0]!.stableTiles).toHaveLength(2)
    expect(session.withCtx(() => serializeSessionSnapshot(session.state, session)).frame.players[0]!.stableAnimalZones).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'stable:0-1', capacity: 3, animalCount: 3 }),
      expect.objectContaining({ id: 'stable:0-2', capacity: 1, animalCount: 0 }),
    ]))
    confirmNext(session, accepted)
  })

  it('restores exact pending and action snapshots after allocating three animals, then retries once', () => {
    const session = setup('C089_StableMaster', 4)
    const before = undoRuleSnapshot(session.getState())
    const pending = succeeded(session.takeAction(0, 'sheep-market'))
    const pendingState = captureStateWithHistory(pending.state)
    succeeded(session.resolveChoice(0, 'confirm', { zones: assignment(pending, 3) }))
    const step = succeeded(session.undoStep())
    expect(step.state.players).toEqual(pendingState.players)
    expect(step.interaction).toEqual(pending.interaction)
    succeeded(session.resolveChoice(0, 'confirm', { zones: assignment(step, 3) }))
    assertUndoRestored(before, session.undoAction())
    const retry = succeeded(session.takeAction(0, 'sheep-market'))
    const accepted = succeeded(session.resolveChoice(0, 'confirm', { zones: assignment(retry, 3) }))
    expect(accepted.state.players[0]!.resources.sheep).toBe(4)
    expect(accepted.state.players[0]!.stableAnimals['0-1']?.animalCount).toBe(3)
  })

  it('preserves two assigned plus one incoming sheep through private-cursor recovery and rejection', () => {
    const session = setup('C089_StableMaster', 1)
    // Prepare an already settled holder before a separate real acquisition.
    const state = session.getState().state
    state.players[0]!.resources.sheep = 2
    state.players[0]!.stableAnimals = { '0-1': { animalType: 'sheep', animalCount: 2 } }
    session.loadState(state)
    const pending = succeeded(session.takeAction(0, 'sheep-market'))
    expect(pending.state.players[0]!.stableAnimals['0-1']?.animalCount).toBe(2)
    const { saved, session: restored } = recover(session)
    expect(restored.getState().interaction).toEqual(pending.interaction)
    const zones = assignment(restored.getState(), 3).map(zone => zone.zoneType === 'house' ? { ...zone, animalType: null, animalCount: 0 } : zone)
    assertRejectedUnchanged(restored, () => restored.resolveChoice(0, 'confirm', { zones: zones.map(zone => zone.id === 'stable:0-1' ? { ...zone, animalCount: 4 } : zone) }))
    const accepted = succeeded(restored.resolveChoice(0, 'confirm', { zones }))
    expect(accepted.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(accepted.state.players[0]!.stableAnimals['0-1']).toEqual({ animalType: 'sheep', animalCount: 3 })
    expect(saved.state.players[0]!.stableAnimals['0-1']?.animalCount).toBe(2)
  })

  it('cooks one animal at a time after settled recovery, retains partial assignments and removes the last entry', () => {
    const session = setup('C089_StableMaster', 3)
    const pending = succeeded(session.takeAction(0, 'sheep-market'))
    const zones = assignment(pending, 3).map(zone => zone.zoneType === 'house' ? { ...zone, animalType: null, animalCount: 0 } : zone)
    succeeded(session.resolveChoice(0, 'confirm', { zones }))
    const state = session.getState().state
    state.players[0]!.improvements = ['Major_Fireplace1']
    session.loadState(state)
    const { saved, session: restored } = recover(session)
    const originalFood = restored.state.players[0]!.resources.food
    for (const count of [2, 1, 0]) {
      const menu = succeeded(restored.takeAnytimeAction(0, 'exchange'))
      const cooking = getChoiceOptions(menu).find(option => option.effectPreview?.kind === 'resourceExchange' && (option.effectPreview.resourcesPaid?.sheep ?? 0) > 0)!
      expect(cooking).toBeDefined()
      const cooked = succeeded(restored.resolveChoice(0, `bulk:${cooking.value.split(':')[1]}=1`))
      expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: count, food: originalFood + 2 * (3 - count) })
      expect(cooked.state.players[0]!.stableAnimals).toEqual(count ? { '0-1': { animalType: 'sheep', animalCount: count } } : {})
      expect(cooked.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 1 }])
      expect(restored.withCtx(() => computeAnimalZones(restored.state.players[0]!, restored.state)).find(zone => zone.id === 'stable:0-1')?.animalCount).toBe(count)
      expect(restored.withCtx(() => getEmptyUnfencedStableCountForCards(restored.state.players[0]!))).toBe(count === 0 ? 1 : 0)
      const whistle = restored.withCtx(() => getCardEffect('E083_ShepherdsWhistle')!.onEndHarvestFeedingPhase!(restored.state, restored.state.players[0]!))
      expect(whistle?.type).toBe(count === 0 ? 'leaf' : 'seq')
    }
    expect(saved.state.players[0]!.stableAnimals['0-1']?.animalCount).toBe(3)
  })

  it.each([['E012_AnimalBedding', 2], ['C089_StableMaster', 3]] as const)('public enforcement preserves %s quantities when capacity is unchanged', (card, count) => {
    const session = setup(card, count)
    const pending = succeeded(session.takeAction(0, 'sheep-market'))
    const zones = assignment(pending, count).map(zone => zone.zoneType === 'house' ? { ...zone, animalType: null, animalCount: 0 } : zone)
    succeeded(session.resolveChoice(0, 'confirm', { zones }))
    // This explicit mutating helper is an auxiliary rebalance/discard API,
    // not the live Session's capacity-loss interaction path.
    session.withCtx(() => enforceAnimalCapacity(session.state.players[0]!, session.state))
    expect(session.state.players[0]!.resources.sheep).toBe(count)
    expect(session.state.players[0]!.stableAnimals['0-1']?.animalCount).toBe(count)
  })

  it('counts occupied cattle space once, deduplicates species and includes stable quantities in a five-sheep prerequisite', () => {
    const session = setup('C089_StableMaster', 0, true)
    const player = session.state.players[0]!
    session.withCtx(() => {
      for (const count of [1, 3]) {
        player.stableAnimals = { '0-1': { animalType: 'cattle', animalCount: count } }
        expect(getCardEffect('C134_CowPrince')!.computeBonusScore!(session.state, player, { categories: [] })).toBe(1)
      }
      player.stableAnimals = { '0-1': { animalType: 'sheep', animalCount: 3 }, '0-2': { animalType: 'sheep', animalCount: 1 } }
      expect(getCardEffect('D029_MuckRake')!.computeBonusScore!(session.state, player, { categories: [] })).toBe(1)
      player.houseAnimals = { '2-0': 'sheep' }
      expect(A038_WoolBlankets_impl.prerequisiteCheck!(player, session.state)).toBe(true)
      player.stableAnimals['0-1']!.animalCount = 2
      expect(A038_WoolBlankets_impl.prerequisiteCheck!(player, session.state)).toBe(false)
    })
  })

  it.each([false, true])('capacity loss keeps displaced inventory pending until explicit placement or discard (discard: %s)', discard => {
    const session = setup('C089_StableMaster', 0)
    // No card-removal action exists for C089: prepare the loss at the public
    // load boundary, then drive the ordinary post-action capacity check.
    const state = session.getState().state
    state.players[0]!.occupationPlayed = []
    state.players[0]!.stableAnimals = { '0-1': { animalType: 'sheep', animalCount: 3 } }
    state.players[0]!.resources.sheep = 3
    if (!discard) {
      state.players[0]!.pastures = [{ id: 'spare', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 }]
      state.players[0]!.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: state.players[0]!.id } }))
    }
    session.loadState(state)
    const pending = succeeded(session.takeAction(0, 'grain-seeds'))
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    expect(pending.state.players[0]!.resources.sheep).toBe(3)
    expect(pending.state.players[0]!.stableAnimals['0-1']?.animalCount).toBe(3)
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'animal-reorg') throw new Error('Expected displaced animals')
    const zones = pending.interaction.request.zones.map(zone => ({ ...zone,
      animalType: zone.zoneType === 'stable' || zone.id === 'spare' ? 'sheep' : null,
      animalCount: zone.zoneType === 'stable' ? 1 : zone.id === 'spare' ? 2 : 0,
    }))
    const accepted = succeeded(session.resolveChoice(0, 'confirm', { zones }))
    expect(accepted.state.players[0]!.resources.sheep).toBe(discard ? 1 : 3)
    expect(accepted.state.players[0]!.stableAnimals['0-1']?.animalCount).toBe(1)
    expect(accepted.state.log.some(entry => entry.key === 'log.reorganizeDiscard')).toBe(discard)
    expect(accepted.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })
})
