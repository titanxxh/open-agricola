import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { playImprovement } from './_helpers/card-play-lifecycle'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { getChoiceOptions } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'

const MONASTIC_VOWS = 'CNL017_MonasticVows'
const CAT_TONGUE = 'CWA014_CatTongue'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(card: string, configure?: (state: GameState) => void, cardZone: 'hand' | 'played' = 'hand') {
  const session = createWorkSession({ seed: 62, configure(state) {
    state.round = 5
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 0
      player.resources.begging = 0
    }
    configure?.(state)
    const owner = state.players[0]!
    if (cardZone === 'hand') owner.minorHand.unshift(card)
    else owner.minorPlayed.push(card)
  } })
  sessions.push(session)
  return session
}

const space = (state: GameState, id: string) => state.actionSpaces.find(candidate => candidate.id === id)!
const guestFacts = ({ state }: SessionResponse) => state.events.flatMap(event => (
  event.type === 'guest.granted' || event.type === 'guest.voided'
    ? [[event.type, event.cardId, event.guestId]]
    : []
))

function playToWorkEnd(
  session: GameSession,
  remainingTurns: readonly (readonly [number, string])[] = [[1, 'forest'], [0, 'reed-bank'], [1, 'clay-pit']],
) {
  const played = playImprovement(session, MONASTIC_VOWS, 'meeting-place')
  expect(played.state.players[0]!.minorHand).not.toContain(MONASTIC_VOWS)
  expect(played.state.players[0]!.minorPlayed).toContain(MONASTIC_VOWS)
  expect(played.state.events).toContainEqual(expect.objectContaining({
    type: 'card.played', cardId: MONASTIC_VOWS, payment: expect.objectContaining({ resources: {} }),
  }))
  let closing = confirmNextPlayer(session)
  expect(closing.ok, closing.error).toBe(true)
  for (const [index, target] of remainingTurns) {
    expect(closing.state.currentPlayerIndex).toBe(index)
    expect(getChoiceOptions(closing)).toEqual([])
    const placed = session.takeAction(index, target)
    expect(placed.ok, placed.error).toBe(true)
    closing = confirmNextPlayer(session)
    expect(closing.ok, closing.error).toBe(true)
  }
  return closing
}

function acceptMonasticVows(session: GameSession, response: SessionResponse) {
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
  const activation = getChoiceOptions(response).find(choice => choice.sourceCard === MONASTIC_VOWS)
  expect(activation, JSON.stringify(response.interaction)).toBeDefined()
  const granted = session.resolveChoice(0, activation!.value)
  expect(granted.ok, granted.error).toBe(true)
  return granted
}

describe('Monastic Vows', () => {
  it('grants food and begging at work end, then requires a Guest placement', () => {
    const session = setup(MONASTIC_VOWS, state => {
      space(state, 'fishing').resources.food = 4
    })
    const offer = playToWorkEnd(session)

    expect(offer.state.round).toBe(5)
    expect(offer.state.players[0]!.resources).toMatchObject({ food: 0, begging: 0 })
    const granted = acceptMonasticVows(session, offer)
    expect(granted.state.players[0]!.resources).toMatchObject({ food: 3, begging: 1 })
    expect(granted.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionPlaceFarmerExtra' })
    const targets = getChoiceOptions(granted).map(option => option.value)
    expect(targets).toContain('fishing')
    expect(targets).not.toContain('__skip__')
    expect(targets).not.toContain('forest')

    const placed = session.resolveChoice(0, 'fishing')
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.round).toBe(6)
    expect(placed.state.players[0]!.resources).toMatchObject({ food: 7, begging: 1 })
    expect(placed.state.players[0]!.guests).toEqual([])
    expect(space(placed.state, 'fishing').takenBy).toEqual([])
    expect(guestFacts(placed)).toEqual([['guest.granted', MONASTIC_VOWS, 'guest:1']])
    expect(placed.state.events).toContainEqual(expect.objectContaining({
      type: 'worker.placed', workerId: 'guest:1', spaceId: 'fishing', round: 5,
    }))
    expect(placed.state.events).toContainEqual(expect.objectContaining({
      type: 'actionSpace.useStarted', spaceId: 'fishing', newPlacement: true,
      personUse: { workerId: 'guest:1', placementOrdinal: 3 },
    }))
    expect(placed.state.events.filter(event =>
      event.round === 5 && (event.type === 'returnHome.started' || (event.type === 'worker.placed' && event.workerId === 'guest:1')),
    ).map(event => event.type)).toEqual(['worker.placed', 'returnHome.started'])
    expect(placed.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(2)
  })

  it('can decline work-end activation without gaining food, begging or a Guest', () => {
    const session = setup(MONASTIC_VOWS)
    const offer = playToWorkEnd(session)
    expect(getChoiceOptions(offer).map(option => option.value)).toContain('__skip__')

    const declined = session.resolveChoice(0, '__skip__')
    expect(declined.ok, declined.error).toBe(true)
    expect(declined.state.round).toBe(6)
    expect(declined.state.players[0]!.resources).toMatchObject({ food: 0, begging: 0 })
    expect(guestFacts(declined)).toEqual([])
  })

  it('gives the fixed reward and voids the Guest if no action space is available', () => {
    const session = setup(MONASTIC_VOWS, state => {
      const open = ['meeting-place', 'forest', 'reed-bank', 'clay-pit']
      for (const action of state.actionSpaces) {
        if (open.includes(action.id)) continue
        action.exclusiveUse = { playerId: 'p2', sourceCardId: 'B023_FinalScenario', untilRound: 6 }
      }
    })

    const ended = acceptMonasticVows(session, playToWorkEnd(session))
    expect(ended.state.round).toBe(6)
    expect(ended.interaction.stateId).toBe('idle')
    expect(ended.state.players[0]!.resources).toMatchObject({ food: 3, begging: 1 })
    expect(ended.state.players[0]!.guests).toEqual([])
    expect(guestFacts(ended)).toEqual([
      ['guest.granted', MONASTIC_VOWS, 'guest:1'], ['guest.voided', MONASTIC_VOWS, 'guest:1'],
    ])
  })

  it.each([MONASTIC_VOWS, 'E020_IronHoe'])('lets the owner start a shared work-end window with %s', first => {
    const ironHoe = 'E020_IronHoe'
    const session = setup(MONASTIC_VOWS, state => {
      state.round = 12
      const owner = state.players[0]!
      owner.minorPlayed = [ironHoe]
      setActiveWorkerCount(owner, 3)
      space(state, 'fishing').resources.food = 4
    })
    let response = playToWorkEnd(session, [[1, 'forest'], [0, 'grain-seeds'], [1, 'clay-pit'], [0, 'vegetable-seeds']])
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'select-trigger' } })
    expect(getChoiceOptions(response).map(option => option.sourceCard)).toEqual(expect.arrayContaining([MONASTIC_VOWS, ironHoe]))

    const order = first === MONASTIC_VOWS ? [MONASTIC_VOWS, ironHoe] : [ironHoe, MONASTIC_VOWS]
    for (const card of order) {
      while (response.interaction.stateId === 'wait' && response.interaction.request.kind !== 'farm-select'
        && response.interaction.promptKey !== 'ui.interactionPlaceFarmerExtra') {
        const activation = getChoiceOptions(response).find(option => option.sourceCard === card)
        expect(activation, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(0, activation!.value)
        expect(response.ok, response.error).toBe(true)
      }
      response = card === MONASTIC_VOWS
        ? session.resolveChoice(0, 'fishing')
        : session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.round).toBe(13)
    expect(response.state.players[0]!.fields).toEqual([{ row: 0, col: 0, stacks: [] }])
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, begging: 1 })
    expect(guestFacts(response)).toEqual([['guest.granted', MONASTIC_VOWS, 'guest:1']])
  })
})

function catTongueGame(configure?: (state: GameState) => void, cardZone: 'hand' | 'played' = 'played') {
  return setup(CAT_TONGUE, state => {
    state.round = 7
    const owner = state.players[0]!
    owner.roomTiles = [...owner.roomTiles, { row: 0, col: 0 }]
    owner.rooms = 3
    space(state, 'fishing').resources.food = 4
    configure?.(state)
  }, cardZone)
}

function growFamily(session: GameSession) {
  const grown = session.takeAction(0, 'wish-children')
  expect(grown.ok, grown.error).toBe(true)
  expect(grown.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(3)
  return grown
}

describe('Cat Tongue', () => {
  it('grants and immediately voids its Guest after Family Growth at harvest', () => {
    const bed = 'C024_BedintheGrainField'
    const session = setup(CAT_TONGUE, state => {
      state.round = 4
      const owner = state.players[0]!
      owner.rooms = 3
      owner.roomTiles.push({ row: 2, col: 0 })
      owner.minorPlayed = [bed]
      owner.cardStates[bed] = { extraData: { nextHarvestReady: true } }
      for (const player of state.players) {
        markAllWorkersUsed(state, player)
        player.resources.food = 20
      }
    }, 'played')
    const harvest = session.performRoundEnd()
    expect(harvest.ok, harvest.error).toBe(true)
    const acceptGrowth = getChoiceOptions(harvest).find(option => option.value !== '__skip__')
    expect(acceptGrowth).toBeDefined()
    const grown = session.resolveChoice(0, acceptGrowth!.value)
    expect(grown.ok, grown.error).toBe(true)
    expect(grown.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(3)
    expect(grown.state.players[0]!.guests).toEqual([])
    expect(getChoiceOptions(grown).some(option => option.labelParams?.guestId)).toBe(false)
    expect(space(grown.state, 'fishing').takenBy).toEqual([])
    expect(guestFacts(grown)).toEqual([
      ['guest.granted', CAT_TONGUE, 'guest:1'], ['guest.voided', CAT_TONGUE, 'guest:1'],
    ])
  })

  it('plays for one food and offers the Guest only on Fishing immediately after family growth', () => {
    const session = catTongueGame(state => { state.players[0]!.resources.food = 1 }, 'hand')
    const played = playImprovement(session, CAT_TONGUE, 'meeting-place')
    expect(played.state.players[0]!.minorHand).not.toContain(CAT_TONGUE)
    expect(played.state.players[0]!.minorPlayed).toEqual([CAT_TONGUE])
    expect(played.state.players[0]!.resources.food).toBe(0)
    expect(played.state.events).toContainEqual(expect.objectContaining({
      type: 'card.played', cardId: CAT_TONGUE, payment: expect.objectContaining({ resources: { food: 1 } }),
    }))
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(0)
    const grown = growFamily(session)

    expect(grown.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(grown.state.players[0]!.guests).toEqual([{
      id: 'guest:1', sourceCardId: CAT_TONGUE, round: 7,
      where: { kind: 'spaces', spaceIds: ['fishing'] },
    }])
    const dispatch = getChoiceOptions(grown).find(option => option.labelParams?.guestId === 'guest:1')
    expect(dispatch).toBeDefined()
    const target = session.resolveChoice(0, dispatch!.value)
    expect(target.ok, target.error).toBe(true)
    expect(getChoiceOptions(target).map(option => option.value)).toEqual(['fishing'])

    const placed = session.resolveChoice(0, 'fishing')
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.players[0]!.resources.food).toBe(4)
    expect(space(placed.state, 'fishing').takenBy).toEqual([{ playerId: 'p1', workerId: 'guest:1', guest: true }])
    expect(placed.state.events).toContainEqual(expect.objectContaining({
      type: 'actionSpace.useStarted', spaceId: 'fishing', newPlacement: true, round: 7,
      personUse: { workerId: 'guest:1', placementOrdinal: 3 },
    }))
    expect(guestFacts(placed)).toEqual([['guest.granted', CAT_TONGUE, 'guest:1']])
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
  })

  it('voids the offer immediately when Fishing is occupied', () => {
    const session = catTongueGame(state => {
      space(state, 'fishing').takenBy.push({ playerId: 'p2', workerId: '1' })
    })

    const grown = growFamily(session)
    expect(getChoiceOptions(grown).some(option => option.labelParams?.guestId)).toBe(false)
    expect(grown.state.players[0]!.guests).toEqual([])
    expect(grown.state.players[0]!.resources.food).toBe(0)
    expect(space(grown.state, 'fishing').resources.food).toBe(4)
    expect(guestFacts(grown)).toEqual([
      ['guest.granted', CAT_TONGUE, 'guest:1'], ['guest.voided', CAT_TONGUE, 'guest:1'],
    ])
  })

  it('restores the immediate offer, allows undo, and voids the Guest on decline before the next turn', () => {
    const original = catTongueGame()
    const grown = growFamily(original)
    const saved = serializeSessionSnapshot(original.state, original)
    const session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved))))
    sessions.push(session)
    expect(session.getState().interaction).toEqual(grown.interaction)
    const dispatch = getChoiceOptions(grown).find(option => option.labelParams?.guestId === 'guest:1')
    expect(dispatch).toBeDefined()
    expect(session.resolveChoice(0, dispatch!.value).ok).toBe(true)
    const undone = session.undoStep(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(getChoiceOptions(undone)).toEqual(getChoiceOptions(grown))
    const decline = getChoiceOptions(undone).find(option => option.labelKey === 'ui.interactionDecline')
    expect(decline).toBeDefined()

    const declined = session.resolveChoice(0, decline!.value)
    expect(declined.ok, declined.error).toBe(true)
    expect(declined.state.players[0]!.guests).toEqual([])
    expect(guestFacts(declined)).toEqual([
      ['guest.granted', CAT_TONGUE, 'guest:1'], ['guest.voided', CAT_TONGUE, 'guest:1'],
    ])
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    const next = confirmNextPlayer(session)
    expect(next.state.currentPlayerIndex).toBe(0)
    expect(next.interaction.stateId).toBe('idle')
    expect(next.state.players[0]!.guests).toEqual([])
  })

  it('grants no Guest after an ordinary work action', () => {
    const session = catTongueGame()
    const placed = session.takeAction(0, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    expect(guestFacts(placed)).toEqual([])
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
  })
})
