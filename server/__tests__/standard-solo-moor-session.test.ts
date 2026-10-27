import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import type { GameState, ProtectedObservation } from '../../shared/contract/types'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { payLeaf } from '../../shared/cards/helpers/pay-gain-node'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions, undoRuleSnapshot, assertUndoRestored } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { moorSoloPreparationAction } from '../../shared/actions/effects/internal/moor-solo-preparation'
import { frameForPerspective } from '../../replay-viewer/src/model'

const evidence = createScenarioEvidence(import.meta.url)
const T = 'moor-special-1-2-terrain'
const H = 'moor-special-1-5-6-wood-hire'
const work = (food = 4, round = 5, configure?: (state: GameState) => void, customCards?: CustomCardData[]) => {
  const session = createWorkSession({ seed: 14100, customCards, options: { playerCount: 1, enableFarmersOfTheMoor: true, deckIds: ['A'] }, configure: state => {
    state.round = round
    const player = state.players[0]!
    for (const key of Object.keys(player.resources)) Reflect.set(player.resources, key, 0)
    player.resources.food = food
    player.rooms = 2
    player.houseType = 'wood'
    player.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.houseAnimals = {}
    player.improvements = []
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.farmTerrain = [{ row: 0, col: 0, kind: 'forest' }, { row: 2, col: 0, kind: 'moor' }, { row: 2, col: 1, kind: 'moor' }]
    state.farmersOfTheMoor!.soloRetentionPaid = false
    let order = 1
    for (const card of state.farmersOfTheMoor!.specialActionCards) card.location = card.id === T
      ? { kind: 'solo-current' } : { kind: 'solo-draw', order: card.id === H ? 0 : order++ }
    configure?.(state)
  } })
  evidence.track(session)
  return session
}
const restore = (session: GameSession, customCards?: CustomCardData[]) => {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))), customCards)
  evidence.track(restored)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  return restored
}

describe('standard solo Moor supply', () => {
  it('reports protected disclosure for replacement, while keeping or restoring known faces reports none', () => {
    const session = work()
    const observations: ProtectedObservation[] = []
    const state = session.state
    state.pendingUndoBoundary = false
    const context = { state, player: state.players[0]!, space: state.actionSpaces[0]!, actionHooks: undefined,
      reportProtectedObservation: (observation: ProtectedObservation) => observations.push(observation) }
    expect(moorSoloPreparationAction.resolveChoice!(context, 'keep')).toEqual({ type: 'ok' })
    expect(observations).toEqual([])
    expect(state.pendingUndoBoundary).toBe(false)
    expect(moorSoloPreparationAction.resolveChoice!(context, 'replace')).toEqual({ type: 'ok' })
    expect(observations).toEqual([{ kind: 'hidden-information', recipientPlayerIds: ['p1'] }])
    expect(state.pendingUndoBoundary).toBe(true)
    expect(state.farmersOfTheMoor!.specialActionCards.find(card => card.location.kind === 'solo-current')!.id).toBe(H)
    state.farmersOfTheMoor!.specialActionCards.forEach((card, order) => { card.location = { kind: 'solo-discard', order } })
    state.pendingUndoBoundary = false
    observations.length = 0
    expect(moorSoloPreparationAction.execute!(context)).toEqual({ type: 'ok' })
    expect(observations).toEqual([])
    expect(state.pendingUndoBoundary).toBe(false)
    expect(state.farmersOfTheMoor!.specialActionCards.find(card => card.location.kind === 'solo-current')!.id).toBe('moor-special-1-4-wood-horse')
  })

  it.each([1, 2])('sets the first Moor round and side board for %i participants', playerCount => {
    const session = createOpeningSession({ seed: 7, options: { playerCount, enableFarmersOfTheMoor: true, deckIds: ['A'] },
      expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } } })
    evidence.track(session)
    const response = session.getState()
    expect(response.state.roundActionOrder[0]).toBe('major-improvement')
    expect(response.state.actionSpaces.some(space => space.id === 'moor-infirmary')).toBe(true)
    const cards = response.state.farmersOfTheMoor!.specialActionCards
    if (playerCount === 2) {
      expect(cards.every(card => card.location.kind === 'market')).toBe(true)
      return
    }
    expect(cards).toHaveLength(10)
    expect(new Set(cards.map(card => card.id)).size).toBe(10)
    expect(cards.filter(card => card.location.kind === 'solo-current')).toHaveLength(1)
    expect(cards.filter(card => card.location.kind === 'solo-draw')).toHaveLength(9)
    const visible = session.buildSyncPayload(response, 'p1').state.farmersOfTheMoor!
    expect(visible.specialActionCards).toHaveLength(1)
    expect(visible.soloSupply).toMatchObject({ drawCount: 9, retentionPaid: false })
    const draw = cards.filter(card => card.location.kind === 'solo-draw').sort((a, b) =>
      (a.location.kind === 'solo-draw' ? a.location.order : 0) - (b.location.kind === 'solo-draw' ? b.location.order : 0))
    expect(visible.soloSupply?.nextCardActions).toEqual(draw[0]!.actions)
    const frame = serializeSessionSnapshot(session.state, session).frame
    for (const card of draw) {
      expect(JSON.stringify(session.buildSyncPayload(response, null))).not.toContain(card.id)
      expect(JSON.stringify(frameForPerspective(frame, 'p1'))).not.toContain(card.id)
    }
    expect(frameForPerspective(frame, 'open').farmersOfTheMoor!.specialActionCards).toHaveLength(10)
  })

  it('retains one real use for two food, then discards the second without drawing again', () => {
    const session = work()
    let response = session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 0 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, fuel: 3 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice', moorSolo: { window: 'retention', currentCardId: T } } })
    response = session.resolveChoice(0, 'retain')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.farmersOfTheMoor!.soloRetentionPaid).toBe(true)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
    confirmNext(session, response)
    response = session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 1 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, fuel: 6 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === T)!.location.kind).toBe('solo-discard')
    confirmNext(session, response)
    assertRejectedUnchanged(session, () => session.takeSpecialAction(0, T, 'hiring-fair'))
    assertRejectedUnchanged(session, () => session.takeSpecialAction(0, H, 'hiring-fair'))
    expect(response.state.farmersOfTheMoor!.specialActionCards.filter(card => card.location.kind === 'solo-draw')).toHaveLength(9)
  })

  it('restores the unused-card preparation choice and prevents undo across its new disclosure', () => {
    const original = work()
    confirmNext(original, original.takeAction(0, 'grain-seeds'))
    let response = confirmNext(original, original.takeAction(0, 'day-laborer'))
    expect(response.state.round).toBe(6)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice', moorSolo: { window: 'preparation', currentCardId: T } } })
    const session = restore(original)
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'invalid'))
    response = session.resolveChoice(0, 'replace')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === H)!.location.kind).toBe('solo-current')
    const old = response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === T)!
    expect(old.location).toMatchObject({ kind: 'solo-draw', order: 9 })
    assertRejectedUnchanged(session, () => session.undoStep())
    assertRejectedUnchanged(session, () => session.undoAction())
    const recovered = restore(session)
    assertRejectedUnchanged(recovered, () => recovered.undoAction())
    expect(recovered.getState().interaction.stateId).toBe('idle')
  })

  it('can pay with its primary food, but an after reward cannot fund retention', () => {
    const earned = work(1, 5, state => {
      state.farmersOfTheMoor!.specialActionCards.find(card => card.id === T)!.location = { kind: 'solo-draw', order: 9 }
      state.farmersOfTheMoor!.specialActionCards.find(card => card.id === H)!.location = { kind: 'solo-current' }
    })
    let response = earned.takeSpecialAction(0, H, 'hiring-fair')
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(getChoiceOptions(response).find(option => option.value === 'retain')?.disabled).toBe(false)
    response = earned.resolveChoice(0, 'retain')
    expect(response.state.players[0]!.resources.food).toBe(0)

    const session = work(1, 5, state => { state.players[0]!.minorPlayed = ['__test_after_food__'] })
    session.withCtx(() => requireActiveCardRegistry('moor-retention-after-food').registerListener({
      id: '__test_after_food__', cardIds: ['__test_after_food__'], actions: ['moor-action'], phases: ['after'], mandatory: true,
      handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: '__test_after_food__' } }),
    }))
    response = session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 0 } })
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, fuel: 3 })
    expect(getChoiceOptions(response).find(option => option.value === 'retain')?.disabled).toBe(true)
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'retain'))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'retain'))
    response = session.resolveChoice(0, 'discard')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.farmersOfTheMoor!.soloRetentionPaid).toBe(false)
  })

  it('refreshes affordability after a legal exchange and preserves the paid continuation on recovery', () => {
    let session = work(0, 5, state => {
      state.players[0]!.resources.vegetable = 1
      state.players[0]!.improvements = ['Major_Fireplace1']
    })
    let response = session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 0 } })
    expect(getChoiceOptions(response).find(option => option.value === 'retain')?.disabled).toBe(true)
    response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    const grain = getChoiceOptions(response).find(option => option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.vegetable === 1 && option.effectPreview.resourcesGained?.food === 2)
    expect(grain, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, `bulk:${grain!.value.split(':')[1]}=1`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, vegetable: 0, fuel: 3 })
    expect(response.interaction).toMatchObject({ request: { moorSolo: { window: 'retention' } } })
    expect(getChoiceOptions(response).find(option => option.value === 'retain')?.disabled).toBe(false)
    session = restore(session)
    response = session.resolveChoice(0, 'retain')
    expect(response.state.players[0]!.resources.food).toBe(0)
    const restored = restore(session)
    expect(restored.state.farmersOfTheMoor!.soloRetentionPaid).toBe(true)
    expect(restored.state.players[0]!.resources).toMatchObject({ fuel: 3, food: 0, vegetable: 0 })
    expect(restored.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
    assertRejectedUnchanged(restored, () => restored.resolveChoice(0, 'retain'))
  })

  it('undoes an undisclosed known-card action and its fee as one action', () => {
    let session = work()
    const before = undoRuleSnapshot(session.getState())
    expect(session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 0 } }).ok).toBe(true)
    session = restore(session)
    const response = session.resolveChoice(0, 'retain')
    expect(response.ok, response.error).toBe(true)
    assertUndoRestored(before, session.undoAction())
    expect(session.state.farmersOfTheMoor!.soloRetentionPaid).toBe(false)
    expect(session.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === T)!.location).toEqual({ kind: 'solo-current' })
  })

  it('restores a real before choice and can undo its known-card body before paying retention', () => {
    let session = work(4, 5, state => {
      state.players[0]!.minorPlayed = ['M112_PeatAshFertilizer']
      state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
    })
    let response = session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 0 } })
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'M112_PeatAshFertilizer' })
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    session = restore(session)
    const choice = getChoiceOptions(response).find(option => option.value !== '__skip__' && !option.disabled)!
    response = session.resolveChoice(0, choice.value)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.resources.fuel).toBe(3)
    expect(response.interaction).toMatchObject({ request: { moorSolo: { window: 'retention' } } })
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'M112_PeatAshFertilizer' })
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    response = session.resolveChoice(0, choice.value)
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, 'retain')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, fuel: 3 })
    session = restore(session)
    response = confirmNext(session, session.getState())
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
  })

  it('keeps the last unused current card without offering a replacement by itself', () => {
    const session = work(4, 5, state => {
      let order = 0
      for (const card of state.farmersOfTheMoor!.specialActionCards) card.location = card.id === T
        ? { kind: 'solo-current' } : { kind: 'solo-discard', order: order++ }
    })
    confirmNext(session, session.takeAction(0, 'grain-seeds'))
    const response = confirmNext(session, session.takeAction(0, 'day-laborer'))
    expect(response.state.round).toBe(6)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === T)!.location).toEqual({ kind: 'solo-current' })
    expect(response.state.farmersOfTheMoor!.specialActionCards.filter(card => card.location.kind === 'solo-discard')).toHaveLength(9)
  })

  it('uses the last hidden card before reusing the latest discard only at a later preparation', () => {
    const session = work(4, 5, state => {
      let order = 0
      for (const card of state.farmersOfTheMoor!.specialActionCards) card.location = card.id === T
        ? { kind: 'solo-draw', order: 0 } : { kind: 'solo-discard', order: order++ }
    })
    confirmNext(session, session.takeAction(0, 'grain-seeds'))
    let response = confirmNext(session, session.takeAction(0, 'day-laborer'))
    expect(response.state.round).toBe(6)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.location.kind === 'solo-current')?.id).toBe(T)
    response = session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 0 } })
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, 'discard')
    confirmNext(session, response)
    expect(session.state.farmersOfTheMoor!.specialActionCards.some(card => card.location.kind === 'solo-current')).toBe(false)
    confirmNext(session, session.takeAction(0, 'grain-seeds'))
    response = confirmNext(session, session.takeAction(0, 'day-laborer'))
    expect(response.state.round).toBe(7)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.location.kind === 'solo-current')?.id).toBe(T)
    expect(response.state.farmersOfTheMoor!.specialActionCards.filter(card => card.location.kind === 'solo-discard')).toHaveLength(9)
  })

  it('carries a paid but unused current card into the next round with fresh retention eligibility', () => {
    const session = work()
    let response = session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 0 } })
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, 'retain')
    confirmNext(session, response)
    confirmNext(session, session.takeAction(0, 'grain-seeds'))
    response = confirmNext(session, session.takeAction(0, 'day-laborer'))
    expect(response.state.round).toBe(6)
    expect(response.state.farmersOfTheMoor!.soloRetentionPaid).toBe(false)
    expect(response.state.players[0]!.resources.food).toBe(4)
    response = session.resolveChoice(0, 'keep')
    expect(response.ok, response.error).toBe(true)
    response = session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 1 } })
    expect(response.state.players[0]!.resources.fuel).toBe(6)
    expect(getChoiceOptions(response).find(option => option.value === 'retain')?.disabled).toBe(false)
    response = session.resolveChoice(0, 'retain')
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('feeds before heating, restricts sick workers, and recovers them through Infirmary', () => {
    const session = work(6, 4)
    confirmNext(session, session.takeAction(0, 'grain-seeds'))
    let response = session.takeAction(0, 'farmland')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    expect(response.state.events.some(event => event.type === 'harvest.started')).toBe(false)
    response = confirmNext(session, response)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'heating') response = session.resolveChoice(0, 'confirm', { fuelUsed: 0 })
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, fuel: 0, begging: 0 })
    expect(response.state.players[0]!.sickWorkerIds?.toSorted()).toEqual(['1', '2'])
    response = session.resolveChoice(0, 'keep')
    expect(response.ok, response.error).toBe(true)
    assertRejectedUnchanged(session, () => session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 0 } }))
    assertRejectedUnchanged(session, () => session.takeAction(0, 'forest'))
    confirmNext(session, session.takeAction(0, 'moor-infirmary'))
    response = confirmNext(session, session.takeAction(0, 'moor-infirmary'))
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.sickWorkerIds ?? []).toEqual([])
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('needs a healthy unplaced person for an ordinary special action without consuming that person', () => {
    const session = work(4, 5, state => { state.players[0]!.sickWorkerIds = ['1'] })
    let response = session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 0 } })
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, 'retain')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, fuel: 3 })
    expect(response.state.events.filter(event => event.type === 'worker.placed')).toHaveLength(0)
    confirmNext(session, response)
    response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.takenBy).toEqual([{ playerId: 'p1', workerId: '2' }])
    confirmNext(session, response)
    assertRejectedUnchanged(session, () => session.takeSpecialAction(0, T, 'cut-peat', { tile: { row: 2, col: 1 } }))
  })

  it('masks lower pile order equally for players, observers and seat replay projections', () => {
    const first = work()
    const second = work(4, 5, state => {
      const hidden = state.farmersOfTheMoor!.specialActionCards.filter(card => card.location.kind === 'solo-draw' && card.location.order > 0)
      const orders = hidden.map(card => card.location.kind === 'solo-draw' ? card.location.order : 0).toReversed()
      hidden.forEach((card, index) => { card.location = { kind: 'solo-draw', order: orders[index]! } })
    })
    for (const viewer of ['p1', null]) expect(first.buildSyncPayload(first.getState(), viewer)).toEqual(second.buildSyncPayload(second.getState(), viewer))
    const firstFrame = serializeSessionSnapshot(first.state, first).frame
    const secondFrame = serializeSessionSnapshot(second.state, second).frame
    expect(frameForPerspective(firstFrame, 'p1')).toEqual(frameForPerspective(secondFrame, 'p1'))
    expect(firstFrame.farmersOfTheMoor).not.toEqual(secondFrame.farmersOfTheMoor)
    const changedTop = work(4, 5, state => {
      const cards = state.farmersOfTheMoor!.specialActionCards
      cards.find(card => card.id === H)!.location = { kind: 'solo-draw', order: 1 }
      cards.find(card => card.id === 'moor-special-1-5-6-market-work')!.location = { kind: 'solo-draw', order: 0 }
    })
    const projected = changedTop.buildSyncPayload(changedTop.getState(), 'p1')
    expect(projected.state.farmersOfTheMoor!.soloSupply!.nextCardActions).toEqual(['black-market', 'illicit-work'])
    projected.state.farmersOfTheMoor!.soloSupply!.nextCardActions = ['fell-trees', 'hiring-fair']
    expect(projected).toEqual(first.buildSyncPayload(first.getState(), 'p1'))
  })

  it.each([true, false])('settles the improvement and retention before the shared after window, plow first=%s', plowFirst => {
    const X = 'moor-special-1-5-6-market-work'
    const almanac = 'E018_SeedAlmanac'
    const machine = 'M060_SowingMachine'
    let session = work(3, 8, state => {
      const p = state.players[0]!
      state.farmersOfTheMoor!.specialActionCards.find(card => card.id === T)!.location = { kind: 'solo-draw', order: 9 }
      state.farmersOfTheMoor!.specialActionCards.find(card => card.id === X)!.location = { kind: 'solo-current' }
      p.minorPlayed = [almanac, machine]
      p.occupationPlayed = ['A085_Homekeeper', 'A087_Conservator', 'A092_AdoptiveParents', 'A088_HedgeKeeper']
      p.minorHand = ['A032_Manger']
      Object.assign(p.resources, { horse: 2, grain: 2, fuel: 1, wood: 2 })
      p.fields = [{ row: 0, col: 1, stacks: [] }]
      p.pastures = [{ id: 'horses', size: 2, tiles: [{ row: 1, col: 3 }, { row: 1, col: 4 }], stables: 0, animalType: 'horse', animalCount: 2 }]
    })
    let response = session.takeSpecialAction(0, X, 'black-market')
    if (!response.state.players[0]!.minorPlayed.includes('A032_Manger')) {
      expect(getChoiceOptions(response).some(option => option.value === 'A032_Manger')).toBe(true)
      response = session.resolveChoice(0, 'A032_Manger')
    }
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 0, wood: 0, food: 3 })
    expect(response.interaction).toMatchObject({ request: { kind: 'choice', moorSolo: { window: 'retention' } } })
    expect(response.state.events.some(event => event.type === 'farm.fieldPlowed' || event.type === 'farm.sown')).toBe(false)
    session = restore(session)
    response = session.resolveChoice(0, 'retain')
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.interaction).toMatchObject({ request: { kind: 'select-trigger' } })
    session = restore(session)
    expect(getChoiceOptions(response).filter(option => option.sourceCard).map(option => option.sourceCard).toSorted()).toEqual([almanac, machine].toSorted())
    const accept = (source: string) => {
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
        const choice = getChoiceOptions(response).find(option => option.sourceCard === source)
        expect(choice).toBeDefined()
        response = session.resolveChoice(0, choice!.value)
        session = restore(session)
      }
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
        expect(response.interaction.sourceCard).toBe(source)
        const choices = getChoiceOptions(response).filter(option => option.value !== '__skip__' && !option.disabled)
        expect(choices).toHaveLength(1)
        response = session.resolveChoice(0, choices[0]!.value)
      }
    }
    if (plowFirst) {
      accept(almanac)
      response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
      accept(machine)
      response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }, { row: 0, col: 2, crop: 'grain' }] })
    } else {
      accept(machine)
      response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
      accept(almanac)
      response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: plowFirst ? 0 : 1 })
    expect(response.state.players[0]!.fields).toEqual([
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 2, stacks: plowFirst ? [{ kind: 'grain', remaining: 3 }] : [] },
    ])
    expect(response.scores![0]!.categories.find(category => category.key === 'fields')).toMatchObject({ quantity: 2, total: 1 })
    const fee = response.state.events.find(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')!
    const reactions = response.state.events.filter(event => (event.type === 'farm.fieldPlowed' || event.type === 'farm.sown') && [almanac, machine].includes(event.sourceCardId ?? ''))
    expect(reactions.map(event => event.sourceCardId)).toEqual(plowFirst ? [almanac, machine] : [machine, almanac])
    expect(reactions.every(event => event.seq > fee.seq)).toBe(true)
  })

  it('finishes animal handling before retention and restores that mandatory decision', () => {
    const A = 'moor-special-1-5-6-horse'
    let session = work(2, 8, state => {
      state.farmersOfTheMoor!.specialActionCards.find(card => card.id === T)!.location = { kind: 'solo-draw', order: 9 }
      state.farmersOfTheMoor!.specialActionCards.find(card => card.id === A)!.location = { kind: 'solo-current' }
      state.players[0]!.resources.horse = 1
      state.players[0]!.houseAnimals = { '2-3': 'horse' }
    })
    let response = session.takeSpecialAction(0, A, 'horse-market')
    expect(response.interaction).toMatchObject({ request: { kind: 'animal-reorg' } })
    expect(response.state.farmersOfTheMoor!.soloRetentionPaid).toBe(false)
    session = restore(session)
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'confirm', { zones: [{ id: 'house:2-3', zoneType: 'house', animalType: 'horse', animalCount: 100 }] }))
    response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'house:2-3', zoneType: 'house', animalType: 'horse', animalCount: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.horse).toBe(1)
    expect(response.interaction).toMatchObject({ request: { moorSolo: { window: 'retention' } } })
    response = session.resolveChoice(0, 'retain')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
  })

  it('does not reset the round retention entitlement when returning home before harvest', () => {
    const probe = '__test_hold_harvest__'
    const session = work(6, 4, state => {
      state.farmersOfTheMoor!.soloRetentionPaid = true
      state.players[0]!.minorPlayed = [probe]
    })
    session.withCtx(() => requireActiveCardRegistry('moor-return-home-retention').setEffect({
      id: probe, onStartHarvest: () => ({ type: 'leaf', actionId: 'gain', optional: true, params: { reed: 1 }, sourceCard: probe }),
    }))
    confirmNext(session, session.takeAction(0, 'grain-seeds'))
    const response = confirmNext(session, session.takeAction(0, 'day-laborer'))
    expect(response.state.round).toBe(4)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: probe })
    expect(response.state.farmersOfTheMoor!.soloRetentionPaid).toBe(true)
  })

  it('completes mandatory onBuy work and its intermediate reaction before retention', () => {
    const card = 'CUSTOM_MoorSowThenPay'
    const X = 'moor-special-1-5-6-market-work'
    const customCards: CustomCardData[] = [
      { cardType: 'minor', cardJson: { id: card, name: 'Sow then pay', deck: 'CUSTOM', number: 0, desc: [], cost: {} } },
      { cardType: 'minor', cardJson: { id: 'CUSTOM_MoorAlternative', name: 'Alternative', deck: 'CUSTOM', number: 1, desc: [], cost: {} } },
    ]
    let session = work(2, 8, state => {
      state.farmersOfTheMoor!.specialActionCards.find(card => card.id === T)!.location = { kind: 'solo-draw', order: 9 }
      state.farmersOfTheMoor!.specialActionCards.find(card => card.id === X)!.location = { kind: 'solo-current' }
      const player = state.players[0]!
      player.minorPlayed = ['E079_FieldSpade']
      player.minorHand = [card, 'CUSTOM_MoorAlternative']
      player.fields = [{ row: 0, col: 1, stacks: [] }]
      Object.assign(player.resources, { fuel: 1, grain: 1, stone: 0 })
    }, customCards)
    const installOnBuy = (target: GameSession) => target.withCtx(() => requireActiveCardRegistry('moor-onBuy-retention').setEffect({
      id: card, onBuy: () => ({ type: 'seq', children: [
        { type: 'leaf', actionId: 'sow', sourceCard: card }, payLeaf({ cardId: card, cost: { stone: 1 } }),
      ] }),
    }))
    installOnBuy(session)
    let response = session.takeSpecialAction(0, X, 'black-market')
    expect(getChoiceOptions(response).map(option => option.value)).toContain(card)
    session = restore(session, customCards)
    installOnBuy(session)
    response = session.resolveChoice(0, card)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
    expect(response.state.farmersOfTheMoor!.soloRetentionPaid).toBe(false)
    const recovered = restore(session, customCards)
    response = recovered.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, grain: 0, fuel: 0, food: 2 })
    expect(response.interaction).toMatchObject({ request: { moorSolo: { window: 'retention' } } })
    response = recovered.resolveChoice(0, 'retain')
    expect(response.state.players[0]!.resources.food).toBe(0)
    const gain = response.state.events.find(event => event.type === 'resource.moved' && event.sourceCardId === 'E079_FieldSpade')!
    const pay = response.state.events.find(event => event.type === 'resource.paid' && event.sourceCardId === card && event.resources.stone === 1)!
    const retention = response.state.events.find(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')!
    expect(gain).toBeDefined()
    expect(pay).toBeDefined()
    expect(gain.seq).toBeLessThan(pay.seq)
    expect(pay.seq).toBeLessThan(retention.seq)
  })
})
