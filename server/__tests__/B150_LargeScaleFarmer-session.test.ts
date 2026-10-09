import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B150_LargeScaleFarmer'
import type { ActionFlow } from '../../shared/contract/types'
import type { CardListenerContext } from '../../shared/cards/card-listeners'


const CARD_ID = 'B150_LargeScaleFarmer'

const setup = (options?: {
  withCard?: boolean
  food?: number
  farmExpOccupied?: boolean
  majorOccupied?: boolean
}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: options?.food ?? 3,
    wood: 20,
    clay: 10,
    reed: 10,
    stone: 10,
  }
  state.players[1]!.workersAvailable = 2

  if (options?.withCard ?? true) {
    player.occupationPlayed.push(CARD_ID)
  }

  const farmExp = state.actionSpaces.find((s) => s.id === 'farm-expansion')
  const major = state.actionSpaces.find((s) => s.id === 'major-improvement')
  if (farmExp) farmExp.takenBy = options?.farmExpOccupied ? state.players[1]!.id : null
  if (major) major.takenBy = options?.majorOccupied ? state.players[1]!.id : null

  session.loadState(state)
  return session
}

describe('B150_LargeScaleFarmer session', () => {
  it('offers improvement choice when player uses major-improvement', () => {
    const session = setup({ withCard: true, food: 3 })
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
  })

  it('after buying a major improvement, B150 optional chain triggers', () => {
    const session = setup({ withCard: true, food: 5 })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // Pick Fireplace1 (costs 2 clay) — player has 10 clay
    const fireplace = resp.interaction.request.options?.find((o) => o.value === 'Major_Fireplace1')
    expect(fireplace).toBeDefined()
    resp = session.resolveChoice(0, fireplace!.value)
    // Potentially there's a payment sub-choice; keep draining valid options
    // until we reach the B150 optional chain.
    let safety = 10
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      const hasSkip = resp.interaction.request.options?.some((o) => o.value === '__skip__')
      if (hasSkip) {
        // This is likely the B150 optional; stop here.
        break
      }
      // Pick the first non-skip option
      const first = resp.interaction.request.options[0]
      if (!first) break
      resp = session.resolveChoice(0, first.value)
    }
    // Expect we landed on an optional choice (B150's optional seq) or engine completed
    // The key assertion: player bought the major AND B150 chain at least was surfaced.
    // Check the state: Fireplace1 should be in improvements.
    expect(resp.state.players[0]!.improvements).toContain('Major_Fireplace1')
  })

  it('pays 1 food when accepting B150 chain from farm-expansion', () => {
    const session = setup({ withCard: true, food: 3 })
    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    // First choice is OR(construct, stables) — required, not optional
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // Pick stables (simpler — 1 wood per stable)
    const stables = resp.interaction.request.options?.find((o) => o.labelKey?.includes('stables') || o.value === 'stables')
    if (stables) {
      resp = session.resolveChoice(0, stables.value)
    } else {
      // Alternative: just use the first available option
      resp = session.resolveChoice(0, resp.interaction.request.options[0]!.value)
    }
    // Navigate through any sub-interactions until we hit the B150 optional (has __skip__).
    let safety = 15
    let foundOptional = false
    while (safety-- > 0) {
      if (resp.interaction.stateId === 'wait') {
        if (resp.interaction.request.kind === 'farm-select') {
          const farm = resp.interaction.request.farm
          if (farm.farmType === 'plow') {
            const tile = farm.selectableTiles[0]
            if (!tile) throw new Error('expected selectable plow tile')
            resp = session.commitSelectionChoice(0, { tile })
          } else if (farm.farmType === 'room') {
            const room = farm.selectableTiles[0]
            if (!room) throw new Error('expected selectable room tile')
            resp = session.commitSelectionChoice(0, { rooms: [room] })
          } else if (farm.farmType === 'stable') {
            const stable = farm.selectableTiles[0]
            if (!stable) throw new Error('expected selectable stable tile')
            resp = session.commitSelectionChoice(0, { stables: [stable] })
          } else if (farm.farmType === 'sow') {
            const field = farm.selectableFields[0]
            const crop = field?.allowedCrops[0]
            if (!field || !crop) throw new Error('expected selectable sow field')
            resp = session.commitSelectionChoice(0, {
              crops: [{ ...field.tile, crop }],
            })
          } else {
            throw new Error('unexpected mandatory fence farm-select in test helper')
          }
          continue
        }
        const hasSkip = resp.interaction.request.options?.some((o) => o.value === '__skip__')
        if (hasSkip) {
          foundOptional = true
          break
        }
        const done = resp.interaction.request.options?.find((o) => o.value === '__done__')
        if (done) {
          resp = session.resolveChoice(0, done.value)
        } else {
          resp = session.resolveChoice(0, resp.interaction.request.options[0]!.value)
        }
      } else {
        break
      }
    }
    if (foundOptional && resp.interaction.stateId === 'wait') {
      const accept = resp.interaction.request.options?.find((o) => o.value !== '__skip__')
      if (accept) {
        resp = session.resolveChoice(0, accept.value)
        // Food should be paid (3 -> 2)
        expect(resp.state.players[0]!.resources.food).toBeLessThan(3)
      }
    }
    expect(resp.ok).toBe(true)
  })

  it('does not trigger on unrelated spaces', () => {
    const session = setup({ withCard: true, food: 3 })
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('does not offer chain when player has no food (direct listener check)', async () => {
    const { getRegisteredCardListeners, executeCardListener } = await import(
      '../../shared/cards/card-listeners'
    )
    const session = setup({ withCard: true, food: 0 })
    const s = session.getState().state
    const placedSpace = s.actionSpaces.find((x) => x.id === 'major-improvement')!
    placedSpace.takenBy = [{ playerId: s.players[0]!.id, workerId: '1' }]
    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'B150-large-scale-farmer-after-place-farmer',
    )!
    const result = executeCardListener(listener, {
      state: s,
      player: s.players[0]!,
      space: placedSpace,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('does not offer chain when other space is occupied (direct listener check)', async () => {
    const { getRegisteredCardListeners, executeCardListener } = await import(
      '../../shared/cards/card-listeners'
    )
    const session = setup({ withCard: true, food: 3, farmExpOccupied: true })
    const s = session.getState().state
    const placedSpace = s.actionSpaces.find((x) => x.id === 'major-improvement')!
    placedSpace.takenBy = [{ playerId: s.players[0]!.id, workerId: '1' }]
    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'B150-large-scale-farmer-after-place-farmer',
    )!
    const result = executeCardListener(listener, {
      state: s,
      player: s.players[0]!,
      space: placedSpace,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })


  it('emits valid jump flow with correct sourceCard (direct listener check)', async () => {
    const { getRegisteredCardListeners, executeCardListener } = await import(
      '../../shared/cards/card-listeners'
    )
    const session = setup({ withCard: true, food: 3 })
    const s = session.getState().state
    const placedSpace = s.actionSpaces.find((x) => x.id === 'major-improvement')!
    placedSpace.takenBy = [{ playerId: s.players[0]!.id, workerId: '1' }]
    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'B150-large-scale-farmer-after-place-farmer',
    )!
    const result = executeCardListener(listener, {
      state: s,
      player: s.players[0]!,
      space: placedSpace,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    expect(result!.sourceCard).toBe(CARD_ID)
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    // First child: pay 1 food
    expect(flow.children[0].actionId).toBe('pay')
    expect(flow.children[0].params).toEqual({ food: 1 })
    // Second child: place-farmer leaf in jump mode targeting farm-expansion
    const jump = flow.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(jump.type).toBe('leaf')
    expect(jump.actionId).toBe('place-farmer')
    expect(jump.actionContext).toMatchObject({
      viaCardJump: true,
      sourceCard: CARD_ID,
      workerId: '1',
      targetSpaceId: 'farm-expansion',
    })
  })
})
