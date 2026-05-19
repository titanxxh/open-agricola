import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

describe('reorganizeAction engine sub-flow integration', () => {
  const setupWorkPhase = (opts: { boar?: number } = {}) => {
    const session = new GameSession()
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
    const values = (resp.interaction.options ?? []).map((o) => o.value).sort()
    expect(values).toEqual(['cancel', 'confirm'])
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

  it('cancel dismisses reorg prompt and re-presents it (boar still unassigned)', () => {
    // cancel = player declines to reorganize *this time*, but boar remains in
    // player.resources and the engine re-triggers the animalReorg check
    // because getAnimalCount still exceeds getAssignedAnimalCount. The session
    // presents another ui.interactionAnimalReorg choice rather than completing.
    const session = setupWorkPhase()
    session.takeAction(0, 'pig-market')

    const resp = session.resolveChoice(0, 'cancel')
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.promptKey).toBe('ui.interactionAnimalReorg')
  })

  it('anytime trigger includes cancel option; non-anytime triggers do not', () => {
    // Verify the engine sub-flow exposes the correct options set per trigger.
    // We exercise the anytime path via pig-market collect (already confirmed above).
    // For the non-anytime guard we rely on the unit test in reorganize-engine.test.ts
    // (which directly calls reorganizeAction.execute with trigger='returning-home').
    const session = setupWorkPhase()
    const resp = session.takeAction(0, 'pig-market')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    const hasCancel = (resp.interaction.options ?? []).some((o) => o.value === 'cancel')
    expect(hasCancel).toBe(true)
  })
})
