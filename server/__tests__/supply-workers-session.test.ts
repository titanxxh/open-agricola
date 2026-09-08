import type { ActionRegistry } from '../../shared/engine/registry'
import { payAction } from '../../shared/actions/effects/pay'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { ActionFlow, GameState } from '../../shared/contract/types'
import { getRoundPlacementDetails } from '../../shared/cards/helpers/round-placement'
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { pushToCardStack, getCardStack } from '../../shared/cards/helpers/card-state'
import { familySize, inactiveWorkersInSupply, setActiveWorkerCount, setWorkersAtHome, workersAtHome } from '../../shared/domain/player'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { chooseSupplyWorkerTurn, takeNormalWorkerTurn } from './_helpers/supply-worker-turn'

const GUEST_ROOM = 'E022_GuestRoom'
const TELEGRAM = 'A022_Telegram'

const setup = (family = 2, secondSource = false, configure?: (state: GameState) => void) => {
  const session = new GameSession(828, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.round = 5
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources.food = 20
    player.resources.wood = 0
  })
  const player = state.players[0]!
  setActiveWorkerCount(player, family)
  player.minorPlayed = [GUEST_ROOM]
  pushToCardStack(player, GUEST_ROOM, ['food', 'food'])
  if (secondSource) {
    player.minorPlayed.push(TELEGRAM)
    player.cardStates[TELEGRAM] = { extraData: { triggerRound: 5 } }
  }
  state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
  configure?.(state)
  session.loadState(state)
  return session
}

describe('supply worker identity through Session', () => {
  it('locks the supply person before placement and preserves the normal family and rotation', () => {
    const session = setup()
    const workerId = inactiveWorkersInSupply(session.state.players[0]!)[0]!.id
    const pending = chooseSupplyWorkerTurn(session, GUEST_ROOM)
    const player = pending.state.players[0]!
    expect(player.workers.find((worker) => worker.id === workerId)?.supplyUse?.status).toBe('pending')
    expect(inactiveWorkersInSupply(player)).toHaveLength(2)
    expect(familySize(player)).toBe(2)
    expect(getCardStack(player, GUEST_ROOM)).toHaveLength(1)
    const response = session.resolveChoice(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual({ playerId: player.id, workerId })
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(workersAtHome(response.state, response.state.players[0]!)).toHaveLength(2)
    expect(response.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'worker.placed', workerId, spaceId: 'forest' }),
    ]))
    const next = confirmNextPlayer(session)
    expect(next.ok, next.error).toBe(true)
    expect(next.state.currentPlayerIndex).toBe(1)
  })

  it('does not reuse the last supply person for a competing card', () => {
    const session = setup(4, true)
    const workerId = inactiveWorkersInSupply(session.state.players[0]!)[0]!.id
    chooseSupplyWorkerTurn(session, GUEST_ROOM)
    const response = session.resolveChoice(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(0)
    expect(familySize(response.state.players[0]!)).toBe(4)
    expect(response.state.players[0]!.workers.find((worker) => worker.id === workerId)?.supplyUse?.sourceCard).toBe(GUEST_ROOM)
    expect(response.state.players[0]!.cardStates[TELEGRAM]?.flagged).not.toBe(true)
  })

  it('rejects an invalid target without changing the lock and restores payment with undo', () => {
    const session = setup()
    const pending = chooseSupplyWorkerTurn(session, GUEST_ROOM)
    const before = JSON.stringify(pending.state.players[0])
    const rejected = session.resolveChoice(0, '__missing_space__')
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.state.players[0])).toBe(before)
    expect(rejected.interaction).toEqual(pending.interaction)
    const restored = session.undoAction()
    expect(restored.ok, restored.error).toBe(true)
    expect(getCardStack(restored.state.players[0]!, GUEST_ROOM)).toHaveLength(2)
    expect(inactiveWorkersInSupply(restored.state.players[0]!)).toHaveLength(3)
  })

  it('retains the chosen person and single payment through a pending snapshot', () => {
    const session = setup()
    chooseSupplyWorkerTurn(session, GUEST_ROOM)
    const workerId = session.state.players[0]!.workers.find((worker) => worker.supplyUse)?.id
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    const response = restored.resolveChoice(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual({ playerId: response.state.players[0]!.id, workerId })
    expect(getCardStack(response.state.players[0]!, GUEST_ROOM)).toHaveLength(1)
    expect(familySize(response.state.players[0]!)).toBe(2)
  })
})

const chooseCard = (session: GameSession, cardId: string) => {
  let response = session.getState()
  for (let step = 0; step < 4 && response.interaction.stateId === 'wait'; step++) {
    const option = response.interaction.request.options?.find((entry) => entry.value === cardId)
      ?? response.interaction.request.options?.find((entry) => entry.value.startsWith('action-improvement-'))
    if (!option) break
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

describe('supply worker combinations through Session', () => {
  it.each([TELEGRAM, 'D022_WorkPermit'])('arbitrates the last supply person and restores both opportunities after undo, chosen=%s', (source) => {
    const session = setup(4, false, (state) => {
      state.round = 6
      state.players[0]!.minorPlayed = [TELEGRAM, 'D022_WorkPermit']
      state.players[0]!.cardStates = {
        [TELEGRAM]: { extraData: { triggerRound: 6 } },
        D022_WorkPermit: { extraData: { targetRound: 6 } },
      }
    })
    const menu = session.getState()
    expect(menu.interaction.stateId).toBe('wait')
    if (menu.interaction.stateId !== 'wait') return
    expect(menu.interaction.request.options?.map((option) => option.sourceCard))
      .toEqual(expect.arrayContaining([TELEGRAM, 'D022_WorkPermit']))
    chooseSupplyWorkerTurn(session, source)
    const placed = session.resolveChoice(0, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    expect(inactiveWorkersInSupply(placed.state.players[0]!)).toHaveLength(0)
    expect(placed.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual({ playerId: placed.state.players[0]!.id, workerId: '5' })
    const undone = session.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(inactiveWorkersInSupply(undone.state.players[0]!)).toHaveLength(1)
    expect(undone.interaction.stateId).toBe('wait')
    if (undone.interaction.stateId !== 'wait') return
    expect(undone.interaction.request.options?.map((option) => option.sourceCard))
      .toEqual(expect.arrayContaining([TELEGRAM, 'D022_WorkPermit']))
    chooseSupplyWorkerTurn(session, source)
    expect(session.resolveChoice(0, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(confirmNextPlayer(session).interaction.stateId).toBe('idle')
  })

  it('recalls and places the same temporary person again without spending another card food', () => {
    const session = setup(2, false, (state) => {
      const player = state.players[0]!
      player.minorHand = ['E003_TeaTime']
      player.resources.grain = 1
      player.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]
      state.roundActionOrder[0] = 'grain-utilization'
    })
    chooseSupplyWorkerTurn(session, GUEST_ROOM)
    let response = session.resolveChoice(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const sow = response.interaction.request.options?.find((option) => option.labelKey === 'actions.sow.name')
      expect(sow, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(0, sow!.value)
    }
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    response = chooseCard(session, 'E003_TeaTime')
    expect(response.state.players[1]!.minorHand).toContain('E003_TeaTime')
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toEqual([])
    expect(response.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse?.status).toBe('temporary')
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(2)
    expect(getCardStack(response.state.players[0]!, GUEST_ROOM)).toHaveLength(1)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(0, 'reed-bank').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    const replaced = session.takeAction(0, 'day-laborer')
    expect(replaced.ok, replaced.error).toBe(true)
    expect(replaced.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy)
      .toContainEqual({ playerId: replaced.state.players[0]!.id, workerId: '3' })
    expect(getCardStack(replaced.state.players[0]!, GUEST_ROOM)).toHaveLength(1)
    expect(getRoundPlacementDetails(replaced.state.players[0]!).filter((entry) => entry.workerId === '3')).toHaveLength(2)
    const returned = confirmNextPlayer(session)
    expect(returned.ok, returned.error).toBe(true)
    expect(returned.state.round).toBe(6)
    expect(inactiveWorkersInSupply(returned.state.players[0]!)).toHaveLength(3)
  })

  it.each([true, false])('releases a due person before Quarry growth with Heart of Stone played first=%s', (first) => {
    const session = setup(4, false, (state) => {
      const player = state.players[0]!
      player.minorPlayed = first
        ? ['C021_HeartofStone', 'D022_WorkPermit']
        : ['D022_WorkPermit', 'C021_HeartofStone']
      player.cardStates = { D022_WorkPermit: { extraData: { targetRound: 6, reservedWorkerId: '5' } } }
      player.workers.find((worker) => worker.id === '5')!.supplyUse = {
        sourceCard: 'D022_WorkPermit', disposition: 'return-to-supply', status: 'reserved',
      }
      player.rooms = 5
      player.roomTiles = Array.from({ length: 5 }, (_, col) => ({ row: 2, col }))
      state.roundActionOrder[5] = 'western-quarry'
      state.players.forEach((entry) => setWorkersAtHome(state, entry, 0))
    })
    expect(inactiveWorkersInSupply(session.state.players[0]!)).toHaveLength(0)
    const due = session.performRoundEnd()
    expect(due.ok, due.error).toBe(true)
    expect(due.state.round).toBe(6)
    expect(due.interaction.stateId).toBe('wait')
    expect(due.interaction.sourceCard).toBe('C021_HeartofStone')
    expect(inactiveWorkersInSupply(due.state.players[0]!)).toHaveLength(1)
    const accept = due.interaction.request?.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    const grown = session.resolveChoice(0, accept!.value)
    expect(grown.ok, grown.error).toBe(true)
    expect(familySize(grown.state.players[0]!)).toBe(5)
    expect(grown.state.players[0]!.workers.find((worker) => worker.id === '5'))
      .toMatchObject({ isActive: true, isNewborn: true })
    expect(inactiveWorkersInSupply(grown.state.players[0]!)).toHaveLength(0)
    expect(grown.interaction.stateId).toBe('idle')
  })

  it('releases a due Work Permit person before ordinary family growth consumes the last token', () => {
    const session = setup(4, false, (state) => {
      const player = state.players[0]!
      player.minorPlayed = ['D022_WorkPermit']
      player.cardStates = { D022_WorkPermit: { extraData: { targetRound: 6, reservedWorkerId: '5' } } }
      player.workers.find((worker) => worker.id === '5')!.supplyUse = {
        sourceCard: 'D022_WorkPermit', disposition: 'return-to-supply', status: 'reserved',
      }
      player.rooms = 5
      player.roomTiles = Array.from({ length: 5 }, (_, col) => ({ row: 2, col }))
      state.roundActionOrder[0] = 'wish-children'
      state.players.forEach((entry) => setWorkersAtHome(state, entry, 0))
    })
    expect(inactiveWorkersInSupply(session.state.players[0]!)).toHaveLength(0)
    const due = session.performRoundEnd()
    expect(due.ok, due.error).toBe(true)
    expect(due.state.round).toBe(6)
    expect(inactiveWorkersInSupply(due.state.players[0]!)).toHaveLength(1)
    const grown = takeNormalWorkerTurn(session, 'wish-children')
    expect(grown.ok, grown.error).toBe(true)
    expect(familySize(grown.state.players[0]!)).toBe(5)
    expect(grown.state.players[0]!.workers.find((worker) => worker.id === '5'))
      .toMatchObject({ isActive: true, isNewborn: true })
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).interaction.stateId).toBe('idle')
  })

  it.each(['grow', 'no-room', 'no-food', 'removed'] as const)('returns the exact token before Storks Nest, outcome=%s', (outcome) => {
    const session = setup(4, false, (state) => {
      const player = state.players[0]!
      player.minorPlayed.push('D010_StorksNest')
      player.rooms = outcome === 'no-room' ? 4 : 5
      player.roomTiles = Array.from({ length: player.rooms }, (_, col) => ({ row: 2, col }))
      if (outcome === 'no-food') player.resources.food = 0
      setWorkersAtHome(state, player, 0)
      setWorkersAtHome(state, state.players[1]!, 0)
      if (outcome === 'removed') {
        player.minorPlayed = ['B022_WalkingBoots', 'D010_StorksNest']
        player.workers.find((worker) => worker.id === '5')!.supplyUse = {
          sourceCard: 'B022_WalkingBoots', disposition: 'remove-from-game', status: 'temporary', returnRound: 5,
        }
        state.actionSpaces.find((space) => space.id === 'forest')!.takenBy.push({ playerId: player.id, workerId: '5' })
      }
    })
    if (outcome !== 'removed') {
      chooseSupplyWorkerTurn(session, GUEST_ROOM)
      expect(session.resolveChoice(0, 'forest').ok).toBe(true)
    }
    let response = outcome === 'removed' ? session.performRoundEnd() : confirmNextPlayer(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.workers.find((worker) => worker.id === '5')?.supplyUse).toBeUndefined()
    if (outcome === 'grow') {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') return
      const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
      expect(accept, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(0, accept!.value)
      expect(response.ok, response.error).toBe(true)
      expect(familySize(response.state.players[0]!)).toBe(5)
      expect(response.state.players[0]!.workers.find((worker) => worker.id === '5')?.isActive).toBe(true)
      expect(response.state.players[0]!.resources.food).toBe(19)
    } else {
      expect(familySize(response.state.players[0]!)).toBe(4)
      expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'D010_StorksNest', JSON.stringify(response.interaction)).toBe(true)
      expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(outcome === 'removed' ? 0 : 1)
    }
  })
})

describe('temporary people at harvest and scoring', () => {
  it('preserves global occupied spaces for Seed Researcher, Turnip Farmer, and Food Distributor', () => {
    const session = setup(2, false, (state) => {
      const player = state.players[0]!
      player.occupationPlayed = ['C097_SeedResearcher', 'A141_TurnipFarmer', 'C155_FoodDistributor']
      player.cardStates.C155_FoodDistributor = { extraData: { purchaseRound: 5 } }
      state.roundActionOrder[0] = 'vegetable-seeds'
      for (const [spaceId, owner, workerId] of [
        ['forest', 0, '1'], ['clay-pit', 0, '2'], ['day-laborer', 1, '1'], ['vegetable-seeds', 1, '2'],
      ] as const) {
        state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{ playerId: state.players[owner]!.id, workerId }]
      }
    })
    chooseSupplyWorkerTurn(session, GUEST_ROOM)
    expect(session.resolveChoice(0, 'grain-seeds').ok).toBe(true)
    const returning = confirmNextPlayer(session)
    expect(returning.ok, returning.error).toBe(true)
    expect(returning.interaction.sourceCard).toBe('C097_SeedResearcher')
    const foodOnly = returning.interaction.request?.options?.find((option) => option.labelKey !== 'ui.interactionSeedResearcher')
    expect(foodOnly).toBeDefined()
    const completed = session.resolveChoice(0, foodOnly!.value)
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.state.round).toBe(6)
    expect(completed.state.players[0]!.resources).toMatchObject({ food: 23, grain: 1, vegetable: 1 })
  })

  it('does not reopen a stage-one action for Minstrel after returning its temporary person', () => {
    const session = setup(2, false, (state) => {
      const player = state.players[0]!
      player.occupationPlayed = ['A151_Minstrel']
      player.resources.grain = 2
      player.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }, { row: 0, col: 1, crop: null, remaining: 0 }]
      state.roundActionOrder.splice(0, 4, 'sheep-market', 'grain-utilization', 'fencing', 'major-improvement')
      for (const [spaceId, owner, workerId] of [
        ['major-improvement', 0, '1'], ['fencing', 0, '2'], ['sheep-market', 1, '1'], ['day-laborer', 1, '2'],
      ] as const) {
        state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{ playerId: state.players[owner]!.id, workerId }]
      }
    })
    chooseSupplyWorkerTurn(session, GUEST_ROOM)
    let response = session.resolveChoice(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    const sow = response.interaction.request?.options?.find((option) => option.labelKey === 'actions.sow.name')
    if (sow) response = session.resolveChoice(0, sow.value)
    expect(response.ok, response.error).toBe(true)
    expect(session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] }).ok).toBe(true)
    const completed = confirmNextPlayer(session)
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.state.round).toBe(6)
    expect(completed.state.players[0]!.resources.grain).toBe(1)
    expect(completed.state.players[0]!.fields[1]!.crop).toBeNull()
  })

  it('does not treat Lessons as vacant for Night-School Student or Bohemian after a temporary return', () => {
    const session = setup(2, false, (state) => {
      const player = state.players[0]!
      player.occupationPlayed = ['A152_NightSchoolStudent', 'A157_Bohemian']
      player.occupationHand = ['A100_Curator', 'A092_AdoptiveParents', '__test_placeholder__']
      for (const [spaceId, owner, workerId] of [
        ['forest', 0, '1'], ['clay-pit', 0, '2'], ['day-laborer', 1, '1'], ['reed-bank', 1, '2'],
      ] as const) {
        state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{ playerId: state.players[owner]!.id, workerId }]
      }
    })
    chooseSupplyWorkerTurn(session, GUEST_ROOM)
    expect(session.resolveChoice(0, 'lessons').ok).toBe(true)
    const played = session.resolveChoice(0, 'A100_Curator')
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.occupationPlayed).toContain('A100_Curator')
    const food = played.state.players[0]!.resources.food
    const completed = confirmNextPlayer(session)
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.state.round).toBe(6)
    expect(completed.state.players[0]!.resources.food).toBe(food)
    expect(completed.state.players[0]!.occupationHand).toContain('A092_AdoptiveParents')
  })

  it.each(['live', 'snapshot'])('preserves a temporary Fishing return for Swimming Class and Curator, mode=%s', (mode) => {
    const session = setup(3, false, (state) => {
      const player = state.players[0]!
      player.minorPlayed.push('A035_SwimmingClass')
      player.occupationPlayed = ['A100_Curator']
      player.rooms = 3
      player.roomTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }]
      player.workers.find((worker) => worker.id === '3')!.isNewborn = true
      const placements = [
        ['forest', 0, '1'], ['clay-pit', 0, '2'], ['wish-children', 0, '3'],
        ['day-laborer', 1, '1'], ['reed-bank', 1, '2'],
      ] as const
      for (const [spaceId, owner, workerId] of placements) {
        const space = state.actionSpaces.find((entry) => entry.id === spaceId)!
        space.takenBy = [{ playerId: state.players[owner]!.id, workerId }]
        space.resources = { ...space.resources, wood: 0, clay: 0, reed: 0, food: 0 }
      }
      state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 4
    })
    chooseSupplyWorkerTurn(session, GUEST_ROOM)
    expect(session.resolveChoice(0, 'fishing').ok).toBe(true)
    const returning = confirmNextPlayer(session)
    expect(returning.ok, returning.error).toBe(true)
    expect(returning.state.players[0]!.cardStates.A035_SwimmingClass?.counters?.bonusVp).toBe(2)
    expect(returning.interaction.stateId).toBe('wait')
    expect(returning.interaction.sourceCard).toBe('A100_Curator')
    expect(returning.state.actionSpaces.find((space) => space.id === 'fishing')!.takenBy).toEqual([])
    expect(inactiveWorkersInSupply(returning.state.players[0]!)).toHaveLength(2)
    const resumed = mode === 'snapshot'
      ? new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
      : session
    const accept = resumed.getState().interaction.request?.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    const completed = resumed.resolveChoice(0, accept!.value)
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.state.round).toBe(6)
    expect(completed.state.players[0]!.resources.food).toBe(23)
    expect(completed.state.players[0]!.cardStates.A100_Curator?.counters?.bonusVp).toBe(1)
    expect(completed.state.players[0]!.cardStates.A035_SwimmingClass?.counters?.bonusVp).toBe(2)
  })

  it.each([7, 14])('does not add a family member, feeding cost, or person score in round %i', (round) => {
    const session = setup(2, false, (state) => {
      state.round = round
      state.players.forEach((player) => setWorkersAtHome(state, player, 0))
    })
    chooseSupplyWorkerTurn(session, GUEST_ROOM)
    const placed = session.resolveChoice(0, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    expect(familySize(placed.state.players[0]!)).toBe(2)
    expect(placed.state.players[0]!.rooms).toBe(2)
    expect(placed.scores[0]!.categories.find((category) => category.key === 'farmers')).toMatchObject({ quantity: 2, total: 6 })
    let returned = confirmNextPlayer(session)
    for (let step = 0; step < 10 && returned.state.round === round && !returned.state.gameOver && returned.interaction.stateId === 'wait'; step++) {
      expect(returned.interaction.request.options?.some((option) => option.value === '__skip__'), JSON.stringify(returned.interaction)).toBe(true)
      returned = session.resolveChoice(returned.interaction.playerIndex, '__skip__')
      expect(returned.ok, returned.error).toBe(true)
    }
    expect(returned.ok, returned.error).toBe(true)
    expect(returned.state.players[0]!.resources.food).toBe(16)
    expect(returned.state.players[0]!.resources.begging).toBe(0)
    expect(familySize(returned.state.players[0]!)).toBe(2)
    expect(inactiveWorkersInSupply(returned.state.players[0]!)).toHaveLength(3)
    expect(returned.scores[0]!.categories.find((category) => category.key === 'farmers')).toMatchObject({ quantity: 2, total: 6 })
    if (round === 14) expect(returned.state.gameOver).toBe(true)
    else expect(returned.state.round).toBe(8)
  })
})

const setupRuleFlow = (flow: ActionFlow, food = 0) => {
  const session = setup(2, false, (state) => { state.players[0]!.resources.food = food })
  const registry = (session as unknown as { registry: ActionRegistry }).registry
  registry.register({ ...payAction, id: '__supply_pay__' })
  const action = { ...registry.get('forest')!, flow, canBeExecutedByPlayer: () => true }
  registry.register(action)
  Object.assign(session.state.actionSpaces.find((space) => space.id === 'forest')!, action)
  return session
}

const supplyPay = (cost: { food?: number; reed?: number }): ActionFlow => ({
  type: 'leaf', actionId: '__supply_pay__', params: { cost },
})

describe('supply placement uses existing before and recovery boundaries', () => {
  it('keeps an accepted placement with no legal target blocked until explicit undo', () => {
    const session = setup(2, false, (state) => {
      const playerId = state.players[1]!.id
      state.actionSpaces.forEach((space) => {
        if (space.id === 'forest') space.takenBy = [{ playerId, workerId: '1' }]
        else if (space.id !== 'farm-expansion') {
          space.blockedBy = [{ playerId, workerId: '1', sourceSpaceId: 'forest' }]
        }
      })
    })
    const menu = session.getState()
    expect(menu.interaction.stateId).toBe('wait')
    if (menu.interaction.stateId !== 'wait') return
    const use = menu.interaction.request.options?.find((option) => option.sourceCard === GUEST_ROOM)
    expect(use?.disabled).not.toBe(true)
    expect(use).toBeDefined()
    const blocked = session.resolveChoice(0, use!.value)
    expect(blocked.ok, blocked.error).toBe(true)
    expect(blocked.interaction.request?.kind, JSON.stringify(blocked.interaction)).toBe('engine-blocked')
    expect(getCardStack(blocked.state.players[0]!, GUEST_ROOM)).toHaveLength(1)
    expect(blocked.state.players[0]!.cardStates[GUEST_ROOM]?.flagged).toBe(true)
    expect(blocked.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse?.status).toBe('pending')
    expect(blocked.state.events.filter((event) => event.type === 'worker.placed')).toHaveLength(0)
    expect(blocked.state.currentPlayerIndex).toBe(0)
    expect(blocked.state.round).toBe(5)
    const undone = session.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(getCardStack(undone.state.players[0]!, GUEST_ROOM)).toHaveLength(2)
    expect(undone.state.players[0]!.cardStates[GUEST_ROOM]?.flagged).not.toBe(true)
    expect(inactiveWorkersInSupply(undone.state.players[0]!)).toHaveLength(3)
    expect(undone.interaction.stateId).toBe('wait')
  })

  it.each([1, 2])('runs an enabling before once, with mandatory food cost %i', (food) => {
    const session = setupRuleFlow({ type: 'seq', children: [supplyPay({ food })] })
    const cardId = '__supply_before__'
    session.state.players[0]!.occupationPlayed = [cardId]
    session.withCtx(() => requireActiveCardRegistry('supply before regression').registerListener({
      id: cardId, cardIds: [cardId], actions: ['__supply_pay__'], phases: ['before'], mandatory: true,
      handler: () => ({ sourceCard: cardId, flow: { type: 'leaf', actionId: 'gain', params: { food: 1 } } }),
    }))
    chooseSupplyWorkerTurn(session, GUEST_ROOM)
    const checkpoint = JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })
    session.getActionAvailability(0)
    session.getActionAvailability(0)
    expect(JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })).toBe(checkpoint)
    const response = session.resolveChoice(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(food === 1 ? 0 : 1)
    expect(response.interaction.request?.kind === 'engine-blocked').toBe(food === 2)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual({ playerId: response.state.players[0]!.id, workerId: '3' })
    expect(response.state.events.filter((event) => event.type === 'resource.moved' && event.resources.food === 1)).toHaveLength(1)
    expect(getCardStack(response.state.players[0]!, GUEST_ROOM)).toHaveLength(1)
    expect(response.state.players[0]!.stats?.placedFarmers).toBe(1)
    const undone = session.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.food).toBe(0)
    expect(getCardStack(undone.state.players[0]!, GUEST_ROOM)).toHaveLength(2)
    expect(inactiveWorkersInSupply(undone.state.players[0]!)).toHaveLength(3)
  })

  it.each(['reed', 'wood'] as const)('keeps the same temporary person across an anytime detour, buying %s', (resource) => {
    const session = setupRuleFlow({ type: 'seq', children: [supplyPay({ food: 1 }), supplyPay({ reed: 1 })] }, 2)
    session.state.players[0]!.occupationPlayed = ['A102_Grocer']
    session.state.players[0]!.cardStates.A102_Grocer = { stack: [resource] }
    chooseSupplyWorkerTurn(session, GUEST_ROOM)
    const pending = session.resolveChoice(0, 'forest')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
    const detour = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(detour.ok, detour.error).toBe(true)
    expect(detour.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
    const continued = session.resolveChoice(0, 'continue')
    expect(continued.ok, continued.error).toBe(true)
    expect(continued.interaction.request?.kind === 'engine-blocked').toBe(resource === 'wood')
    expect(getCardStack(continued.state.players[0]!, GUEST_ROOM)).toHaveLength(1)
    expect(continued.state.events.filter((event) => event.type === 'worker.placed' && event.workerId === '3')).toHaveLength(1)
    expect(continued.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse?.status).toBe('temporary')
    const undone = session.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.food).toBe(2)
    expect(getCardStack(undone.state.players[0]!, GUEST_ROOM)).toHaveLength(2)
    expect(inactiveWorkersInSupply(undone.state.players[0]!)).toHaveLength(3)
  })
})

describe('person action turn context', () => {
  it.each(['normal', 'supply'])('keeps the end-turn person trigger for a %s choice', (kind) => {
    const session = setup()
    const cardId = '__supply_turn_observer__'
    session.state.players[0]!.occupationPlayed = [cardId]
    session.withCtx(() => requireActiveCardRegistry('supply turn context').setEffect({
      id: cardId,
      onEndTurn: (_state, player, context) => {
        player.cardStates[cardId] = { extraData: { triggerActionId: context?.triggerActionId } }
      },
    }))
    if (kind === 'supply') chooseSupplyWorkerTurn(session, GUEST_ROOM)
    const response = kind === 'supply' ? session.resolveChoice(0, 'forest') : takeNormalWorkerTurn(session, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[cardId]?.extraData?.triggerActionId).toBe('place-farmer')
    expect(response.state.players[0]!.stats?.placedFarmers).toBe(1)
  })
})
