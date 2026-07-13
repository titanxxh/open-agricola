import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/M/M033_NightPasture'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const NIGHT_PASTURE = 'M033_NightPasture'

describe('reorganizeAction engine sub-flow integration', () => {
  const setupWorkPhase = (opts: { boar?: number } = {}) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = { ...player.resources, food: 5, boar: opts.boar ?? 0 }
    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1

    session.loadState(state)
    return session
  }

  it('collecting a boar yields choice with promptKey ui.interactionAnimalReorg (anytime trigger)', () => {
    const session = setupWorkPhase()
    const resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.promptKey).toBe('ui.interactionAnimalReorg')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    if (resp.interaction.request.kind !== 'animal-reorg') return
    expect(resp.interaction.request.zones.length).toBeGreaterThan(0)
  })

  it('active animal-reorg interaction zones include hosted Night Pasture metadata', () => {
    const session = setupWorkPhase()
    const state = session.getState().state
    const guest = state.players[0]!
    const owner = state.players[1]!
    owner.minorPlayed = [NIGHT_PASTURE]
    owner.cardStates = { [NIGHT_PASTURE]: { extraData: {} } }
    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (!sheepMarket) throw new Error('missing sheep market')
    sheepMarket.resources.sheep = 1
    session.loadState(state)

    const resp = session.takeAction(0, 'sheep-market')

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    const zoneId = `card:${NIGHT_PASTURE}:owner:${owner.id}:animalOwner:${guest.id}`
    expect(resp.interaction.request.zones.find((zone) => zone.id === zoneId)).toMatchObject({
      id: zoneId,
      cardId: NIGHT_PASTURE,
      ownerPlayerId: owner.id,
      animalOwnerPlayerId: guest.id,
      displaySource: 'borrowed-played-card',
    })
  })

  it('confirm + zones payload places boar on pasture and clears the pending', () => {
    const session = setupWorkPhase()
    session.takeAction(0, 'pig-market')

    const resp = session.resolveChoice(0, 'confirm', [
      { id: 'pasture-1', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.state.players[0]!.pastures[0]!.animalType).toBe('boar')
    expect(resp.state.players[0]!.pastures[0]!.animalCount).toBe(1)
  })

  it('logs animals discarded by reorganize after collection', () => {
    const session = setupWorkPhase()
    const state = session.getState().state
    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (!sheepMarket) throw new Error('missing sheep market')
    sheepMarket.resources.sheep = 3
    session.loadState(state)

    const pending = session.takeAction(0, 'sheep-market')
    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(pending.interaction.request.kind).toBe('animal-reorg')

    const resp = session.resolveChoice(0, 'confirm', {
      zones: [
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ],
    })

    expect(resp.state.players[0]!.resources.sheep).toBe(1)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId)
      .toBe('confirm-next-player')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.animalMoved',
        animals: { sheep: 1 },
      }),
      expect.objectContaining({
        type: 'farm.animalDiscarded',
        animals: { sheep: 2 },
        reason: 'noRoom',
      }),
    ]))
    const discardLog = resp.state.log.find((entry) => entry.key === 'log.reorganizeDiscard')
    expect(discardLog?.params).toMatchObject({
      player: resp.state.players[0]!.name,
      resources: { sheep: 2 },
    })
  })

  it('direct cancel is rejected and keeps animal reorg pending', () => {
    const session = setupWorkPhase()
    session.takeAction(0, 'pig-market')

    const resp = session.resolveChoice(0, 'cancel')
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('log.reorganizeFail')
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.promptKey).toBe('ui.interactionAnimalReorg')
  })

  it('anytime trigger does not include cancel option', () => {
    const session = setupWorkPhase()
    const resp = session.takeAction(0, 'pig-market')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    const hasCancel = (resp.interaction.request.options ?? []).some((o) => o.value === 'cancel')
    expect(hasCancel).toBe(false)
  })
})
