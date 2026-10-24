import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, playImprovement, playOccupation, restoreSession } from './_helpers/card-play-lifecycle'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { frameForPerspective } from '../../replay-viewer/src/model'
import { buildFarmBoardProjection } from '../../client/app/farm-board-projection'
import { rehydrateStateForClient } from '../../client/services/rehydrate'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = () => {
  const session = createWorkSession({ seed: 1371, configure: state => {
    state.players.forEach(player => { player.resources.food = 100 })
    const player = state.players[0]!
    player.occupationHand = ['A110_Roughcaster', 'A116_WoodCutter']
    player.minorHand = ['E047_SyrupTap', 'D027_Retraining']
    player.resources.clay = 20
    player.resources.wood = 20
    player.resources.stone = 20
    player.resources.reed = 20
    state.actionSpaces.find(space => space.id === 'major-improvement')!.roundAvailable = 1
    state.actionSpaces.find(space => space.id === 'house-redevelopment')!.roundAvailable = 1
  } })
  sessions.push(session)
  return session
}

const ready = (session: GameSession): SessionResponse => {
  let response = session.getState()
  while (response.interaction.stateId === 'wait') {
    const request = response.interaction.request
    expect(['confirm-next-player', 'confirm-player-switch'], JSON.stringify(request)).toContain(request.kind)
    response = session.resolveChoice(request.kind === 'confirm-next-player' ? request.nextPlayerIndex : response.interaction.playerIndex, 'confirm')
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const take = (session: GameSession, space: string) => {
  const response = ready(session)
  const taken = session.takeAction(response.state.currentPlayerIndex, space)
  expect(taken.ok, taken.error).toBe(true)
  return taken
}

const firstThree = (session: GameSession) => {
  playOccupation(session, 'A110_Roughcaster')
  take(session, 'forest')
  ready(session)
  playImprovement(session, 'E047_SyrupTap', 'meeting-place')
  take(session, 'reed-bank')
  ready(session)
  let occupation = session.takeAction(0, 'lessons')
  expect(occupation.ok, occupation.error).toBe(true)
  if (occupation.state.players[0]!.occupationHand.includes('A116_WoodCutter')) {
    occupation = choose(session, occupation, 'A116_WoodCutter')
  }
  expect(occupation.state.players[0]!.occupationPlayed).toEqual(['A110_Roughcaster', 'A116_WoodCutter'])
  take(session, 'forest')
  ready(session)
}

const prefix = ['occupation:A110_Roughcaster', 'minor:E047_SyrupTap', 'occupation:A116_WoodCutter']

describe('Played Card Chronology in complete authoritative snapshots', () => {
  it('mixes real occupation, minor, occupation and major purchases and restores their order on undo', () => {
    const session = setup()
    firstThree(session)
    const purchased = playImprovement(session, 'Major_Fireplace1')
    expect(purchased.state.events.filter(event => event.type === 'card.played').map(event => event.cardId))
      .toEqual(['A110_Roughcaster', 'E047_SyrupTap', 'A116_WoodCutter', 'Major_Fireplace1'])
    for (const viewer of ['p1', 'p2', null]) {
      const payload = session.buildSyncPayload(purchased, viewer, 'viewer', undefined, true)
      expect(payload.state.players[0]).toHaveProperty('playedCardChronology', [...prefix, 'major:Major_Fireplace1'])
      const hydrated = rehydrateStateForClient(payload.state)
      expect(buildFarmBoardProjection({
        displayPlayer: hydrated.players[0], interaction: payload.interaction, selectionInteraction: null,
      }).playedCardDisplays.map(card => card.cardId)).toEqual([...prefix, 'major:Major_Fireplace1'])
    }
    const frame = serializeSessionSnapshot(session.state, session).frame
    expect(rehydrateState(frame).state.players[0]).not.toHaveProperty('playedCardChronology')
    for (const perspective of ['open', 'p1', 'p2'] as const) {
      expect(frameForPerspective(frame, perspective).players[0]?.playedCardChronology)
        .toEqual([...prefix, 'major:Major_Fireplace1'])
    }
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(session.buildSyncPayload(undone, 'p1').state.players[0])
      .toHaveProperty('playedCardChronology', prefix)
    expect(undone.state.availableMajorImprovements).toContain('Major_Fireplace1')
    const replayed = playImprovement(session, 'Major_Fireplace1')
    expect(session.buildSyncPayload(replayed, 'p2').state.players[0])
      .toHaveProperty('playedCardChronology', [...prefix, 'major:Major_Fireplace1'])
  })

  it('keeps the full chronology when purchase events leave the History Window and the session reconnects', () => {
    const session = setup()
    firstThree(session)
    playImprovement(session, 'Major_Fireplace1')
    for (let index = 0; index < 28; index++) {
      const response = ready(session)
      const available = session.getActionAvailability(response.state.currentPlayerIndex)
      const space = ['forest', 'reed-bank', 'fishing', 'day-laborer'].find(id => available[id])
      expect(space).toBeDefined()
      take(session, space!)
    }
    const payload = session.buildSyncPayload(session.getState(), 'p2', 'viewer', undefined, true)
    expect(payload.historyWindow?.nextCursor).toBeTruthy()
    expect(payload.state.events.some(event => event.type === 'card.played')).toBe(false)
    expect(payload.state.players[0]?.cardStatePresentation.A116_WoodCutter?.resourceStats?.used).toBeGreaterThan(0)
    expect(payload.state.players[0]).toHaveProperty('playedCardChronology', [...prefix, 'major:Major_Fireplace1'])
    const restored = restoreSession(session)
    sessions.push(restored)
    expect(restored.buildSyncPayload(restored.getState(), 'p2', 'viewer', undefined, true).state.players[0])
      .toHaveProperty('playedCardChronology', [...prefix, 'major:Major_Fireplace1'])
    expect(restored.state.players[0]).not.toHaveProperty('playedCardChronology')
  })

  it('appends an upgraded major and a returned major bought again after the upgrade', () => {
    const session = setup()
    firstThree(session)
    playImprovement(session, 'Major_Fireplace1')
    take(session, 'reed-bank')
    ready(session)
    playImprovement(session, 'D027_Retraining', 'meeting-place')
    take(session, 'forest')
    ready(session)
    let upgraded = playImprovement(session, 'Major_CookingHearth1')
    expect(upgraded.interaction.stateId).toBe('wait')
    if (upgraded.interaction.stateId !== 'wait') throw new Error('Expected upgrade payment')
    expect(upgraded.interaction.promptKey).toBe('prompt.selectPayment')
    const payment = upgraded.interaction.request.options?.find(option => JSON.stringify(option).includes('Major_Fireplace1'))
    expect(payment).toBeDefined()
    upgraded = choose(session, upgraded, payment!.value)
    expect(upgraded.state.players[0]!.improvements).toEqual(['Major_CookingHearth1'])
    expect(upgraded.state.availableMajorImprovements).toContain('Major_Fireplace1')
    expect(session.buildSyncPayload(upgraded, 'p2').state.players[0]?.playedCardChronology)
      .toEqual([...prefix, 'minor:D027_Retraining', 'major:Major_CookingHearth1'])
    take(session, 'reed-bank')
    ready(session)
    const rebought = playImprovement(session, 'Major_Fireplace1')
    expect(session.buildSyncPayload(rebought, 'p1').state.players[0]?.playedCardChronology)
      .toEqual([...prefix, 'minor:D027_Retraining', 'major:Major_CookingHearth1', 'major:Major_Fireplace1'])
  })

  it('appends a board exchange after cards played since the old major entered play and undoes the exchange', () => {
    const session = setup()
    firstThree(session)
    playImprovement(session, 'Major_Joinery')
    take(session, 'reed-bank')
    ready(session)
    playImprovement(session, 'D027_Retraining', 'meeting-place')
    take(session, 'forest')
    ready(session)
    let response = session.takeAction(0, 'house-redevelopment')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = choose(session, response, 'clay')
    }
    expect(response.state.players[0]!.houseType).toBe('clay')
    for (let step = 0; step < 8 && !response.state.events.some(event => event.type === 'card.swappedWithBoard'); step++) {
      if (response.interaction.stateId !== 'wait') throw new Error('Expected renovation exchange')
      const options = response.interaction.request.options ?? []
      const next = response.interaction.request.kind === 'select-trigger' ? 'D027_Retraining'
        : options.some(option => option.value.startsWith('action-improvement-')) ? '__skip__'
        : options.find(option => option.value !== '__skip__')?.value
      expect(next).toBeDefined()
      response = choose(session, response, next!)
    }
    const exchanged = response
    expect(exchanged.state.events.some(event => event.type === 'card.swappedWithBoard'
      && event.fromPlayerCardId === 'Major_Joinery' && event.toPlayerCardId === 'Major_Pottery')).toBe(true)
    expect(session.buildSyncPayload(exchanged, 'p2').state.players[0]?.playedCardChronology)
      .toEqual([...prefix, 'minor:D027_Retraining', 'major:Major_Pottery'])
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(session.buildSyncPayload(undone, 'p2').state.players[0]?.playedCardChronology)
      .toEqual([...prefix, 'major:Major_Joinery', 'minor:D027_Retraining'])
  })
})
