import { chooseSupplyWorkerTurn } from './_helpers/supply-worker-turn'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed, setWorkersAtHome, inactiveWorkersInSupply } from '../../shared/domain/player'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import '../../shared/cards/A/A081_InterimStorage'
import '../../shared/cards/A/A022_Telegram'
import '../../shared/cards/D/D134_OysterEater'
import '../../shared/cards/C/C051_FishingNet'
import '../../shared/cards/E/E140_Carter'
import '../../shared/cards/B/B096_TreeFarmJoiner'
import '../../shared/cards/B/B004_WoodPile'
import '../../shared/cards/D/D051_Archway'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const tracked = (session: GameSession) => { sessions.push(session); return session }
const drainConfirm = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 6 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.request.kind === 'confirm-next-player') response = confirmNextPlayer(session)
    else if (response.interaction.request.kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
    else break
  }
  return response
}

describe('source-owned retained obligations through authoritative commands', () => {
  it('lets the original owner use a scheduled supply worker after the card leaves and returns it without growing the family', () => {
    const session = tracked(createWorkSession({ seed: 7022, configure: state => {
      state.round = 5
      state.players.forEach(player => { player.resources.food = 30; setWorkersAtHome(state, player, 0) })
      state.players[0]!.resources.food = 0
      state.players[0]!.cardStates.A022_Telegram = { extraData: { triggerRound: 6 } }
      state.players[1]!.minorHand = ['A022_Telegram']
    } }))
    expect(session.performRoundEnd().ok).toBe(true)
    const pending = chooseSupplyWorkerTurn(session, 'A022_Telegram')
    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait') return
    expect(pending.interaction.playerIndex).toBe(0)
    let response = session.resolveChoice(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    response = drainConfirm(session, response)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[1]!.resources.food).toBe(30)
    expect(response.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(2)
    expect(response.state.events.some(event => event.type === 'worker.placed' && event.viaCardId === 'A022_Telegram')).toBe(true)
    const ending = session.getState().state
    ending.players.forEach(player => { player.resources.food = 30; markAllWorkersUsed(ending, player) })
    session.loadState(ending)
    response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(7)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(3)
  })
  it('consumes an original-owner turn skip without reviving the standing trigger and expires it after its actual round', () => {
    const session = tracked(createWorkSession({ seed: 7134, configure: state => {
      state.round = 5
      state.currentPlayerIndex = 1
      state.players[0]!.cardStates.D134_OysterEater = { extraData: { skipNextPlacement: 2, skipRound: 5 } }
      state.players[1]!.occupationHand = ['D134_OysterEater']
      state.players.forEach(player => { player.resources.food = 30 })
    } }))
    const response = drainConfirm(session, session.takeAction(1, 'day-laborer'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.currentPlayerIndex).toBe(1)
    expect(response.state.players[0]!.cardStates.D134_OysterEater?.extraData?.skipNextPlacement).toBe(1)
    const later = session.getState().state
    later.round = 6
    later.currentPlayerIndex = 1
    later.actionSpaces.forEach(space => { space.takenBy = [] })
    session.loadState(later)
    const next = drainConfirm(session, session.takeAction(1, 'forest'))
    expect(next.ok, next.error).toBe(true)
    expect(next.state.currentPlayerIndex).toBe(0)
    expect(next.state.players[0]!.cardStates.D134_OysterEater?.extraData?.skipNextPlacement).toBe(1)
  })
  it('returns stored goods to their original owner after the card moves to the other player', () => {
    const session = tracked(createWorkSession({ seed: 7081, configure: state => {
      state.round = 6
      state.players.forEach(player => { player.resources.food = 30; player.resources.wood = 0; markAllWorkersUsed(state, player) })
      state.players[0]!.cardStates.A081_InterimStorage = { counters: { wood: 2 } }
      state.players[1]!.minorPlayed = ['A081_InterimStorage']
    } }))
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(7)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.state.players[1]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates.A081_InterimStorage?.counters?.wood).toBe(0)
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === 'A081_InterimStorage' && event.to.kind === 'player' && event.to.playerId === response.state.players[0]!.id && event.resources.wood === 2)).toBe(true)
  })
  it('keeps only the already activated collection window after the occupation leaves its owner', () => {
    const session = tracked(createWorkSession({ seed: 7140, configure: state => {
      state.round = 2
      state.players[0]!.cardStates.E140_Carter = { extraData: { triggerRound: 2 } }
      state.players[1]!.occupationHand = ['E140_Carter']
      state.players.forEach(player => { player.resources.food = 0; player.resources.wood = 0 })
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 2
    } }))
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'forest'), 'E140_Carter')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 2 })
    expect(response.state.players[1]!.resources.food).toBe(0)
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === 'E140_Carter' && event.resources.food === 2)).toBe(true)
    const later = session.getState().state
    later.round = 3
    later.currentPlayerIndex = 0
    later.actionSpaces.forEach(space => { space.takenBy = [] })
    later.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 1
    session.loadState(later)
    expect(session.takeAction(0, 'forest').state.players[0]!.resources.food).toBe(2)
  })
  it('resolves the promised deposit after source removal without reviving the standing fishing toll', () => {
    const session = tracked(createWorkSession({ seed: 7051, configure: state => {
      state.round = 5
      state.currentPlayerIndex = 1
      state.players[0]!.minorPlayed = ['C051_FishingNet']
      state.players.forEach(player => { player.resources.food = 10 })
      state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
    } }))
    const first = resolveTriggerIfPresent(session, session.takeAction(1, 'fishing'), 'C051_FishingNet')
    expect(first.ok, first.error).toBe(true)
    expect(first.state.players[0]!.resources.food).toBe(11)
    const moved = session.getState().state
    moved.players[0]!.minorPlayed = []
    moved.players[1]!.minorHand = ['C051_FishingNet']
    moved.currentPlayerIndex = 1
    moved.actionSpaces.find(space => space.id === 'fishing')!.takenBy = []
    moved.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 1
    session.loadState(moved)
    const second = session.takeAction(1, 'fishing')
    expect(second.ok, second.error).toBe(true)
    expect(second.state.players[0]!.resources.food).toBe(11)
    const done = session.getState().state
    done.players.forEach(player => markAllWorkersUsed(done, player))
    session.loadState(done)
    const returned = session.performRoundEnd()
    expect(returned.ok, returned.error).toBe(true)
    expect(returned.state.round).toBe(6)
    expect(returned.state.actionSpaces.find(space => space.id === 'fishing')!.resources.food).toBe(3)
    expect(returned.state.players[0]!.cardStates.C051_FishingNet?.extraData?.pendingDeposits).toBe(0)
  })
  it('keeps two real fishing activations as two deposits in the same round', () => {
    const session = tracked(createWorkSession({ seed: 7251, configure: state => {
      state.round = 5
      state.currentPlayerIndex = 1
      state.players[0]!.minorPlayed = ['C051_FishingNet']
      state.players.forEach(player => { player.resources.food = 20 })
      state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
    } }))
    const first = resolveTriggerIfPresent(session, session.takeAction(1, 'fishing'), 'C051_FishingNet')
    expect(first.ok, first.error).toBe(true)
    const again = session.getState().state
    again.currentPlayerIndex = 1
    again.actionSpaces.find(space => space.id === 'fishing')!.takenBy = []
    again.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 1
    session.loadState(again)
    const second = resolveTriggerIfPresent(session, session.takeAction(1, 'fishing'), 'C051_FishingNet')
    expect(second.ok, second.error).toBe(true)
    expect(second.state.players[0]!.resources.food).toBe(22)
    expect(second.state.players[0]!.cardStates.C051_FishingNet?.extraData).toMatchObject({ pendingDeposits: 2, depositEpisode: 2 })
    const done = session.getState().state
    done.players.forEach(player => markAllWorkersUsed(done, player))
    session.loadState(done)
    const returned = session.performRoundEnd()
    expect(returned.ok, returned.error).toBe(true)
    expect(returned.state.round).toBe(6)
    expect(returned.state.actionSpaces.find(space => space.id === 'fishing')!.resources.food).toBe(5)
    expect(returned.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'C051_FishingNet' && event.to.kind === 'actionSpace' && event.to.spaceId === 'fishing' && event.resources.food === 2)).toHaveLength(2)
    expect(returned.state.players[0]!.cardStates.C051_FishingNet?.extraData?.timedRuleReceipts).toContain('return-food-to-fishing:5:2')
  })
  it('offers the scheduled receive continuation to the original owner when the occupation is elsewhere', () => {
    const session = tracked(createWorkSession({ seed: 7096, configure: state => {
      state.round = 6
      state.players.forEach(player => { player.resources.food = 30; player.resources.wood = 0; markAllWorkersUsed(state, player) })
      state.players[0]!.minorHand = ['B004_WoodPile']
      state.players[1]!.occupationHand = ['B096_TreeFarmJoiner']
      state.futureMeeples = [{ id: 'retained-wood', playerId: state.players[0]!.id, cardId: 'B096_TreeFarmJoiner', round: 7, resources: { wood: 1 } }]
    } }))
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[1]!.resources.wood).toBe(0)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.playerIndex).toBe(0)
    const beforeRead = JSON.stringify(serializeSessionSnapshot(session.state, session))
    expect(session.getState().interaction).toEqual(response.interaction)
    expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(beforeRead)
    const restored = tracked(new GameSession(rehydrateState(JSON.parse(beforeRead))))
    response = restored.getState()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const offered = response.interaction.request.options ?? []
    const use = offered.find(option => option.value !== '__skip__')
    expect(use).toBeDefined()
    response = restored.resolveChoice(0, use!.value)
    if (response.interaction.stateId === 'wait') response = restored.resolveChoice(0, 'B004_WoodPile')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).not.toContain('B004_WoodPile')
    expect(response.state.players[1]!.minorHand).toContain('B004_WoodPile')
    expect(response.state.players[0]!.cardStates.B096_TreeFarmJoiner?.extraData?.timedRuleReceipts).toContain('after-scheduled-wood:7')
  })
  it('lets the opponent who actually occupied a public action card move their own worker at return home', () => {
    const session = tracked(createWorkSession({ seed: 7151, configure: state => {
      state.round = 5
      state.currentPlayerIndex = 1
      state.players[0]!.minorPlayed = ['D051_Archway']
      state.players.forEach(player => { player.resources.food = 30 })
    } }))
    let response = session.takeAction(1, 'D051_Archway')
    expect(response.ok, response.error).toBe(true)
    const before = response.state.players[1]!.resources.food
    const state = session.getState().state
    state.players.forEach(player => markAllWorkersUsed(state, player))
    session.loadState(state)
    response = drainConfirm(session, session.performRoundEnd())
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.playerIndex).toBe(1)
    const use = response.interaction.request.options?.find(option => option.value !== '__skip__')
    expect(use).toBeDefined()
    response = session.resolveChoice(1, use!.value)
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(1, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.food).toBe(before + 2)
    expect(response.state.players[0]!.resources.food).toBe(30)
  })
})
