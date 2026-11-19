import { describe, expect, it } from 'vitest'
import {
  wmSession,
  wmId as id,
  wmOk,
  wmChoose,
  wmAction,
  wmPayment,
  wmEndRound,
  wmConfirmations,
  wmRestore,
} from './_helpers/classic-wm-session'
import { playMinor, sessionOptions } from './_helpers/card-regression-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import type { GameState } from '../../shared/contract/types'

const sheepPasture = (state: GameState, sheep = 2) => {
  const p = state.players[0]!
  p.resources.sheep = sheep
  p.pastures = [
    {
      id: 'pasture-1',
      tiles: [
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      animalType: 'sheep',
      animalCount: sheep,
      stableCount: 0,
    },
  ]
  p.fenceSegments = ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3'].map((edge) => ({
    edge,
    type: 'fence',
    source: { kind: 'own', ownerPlayerId: p.id },
  }))
}

describe('WM animal ownership and crop markers in four-player sessions', () => {
  it('Animal Nursery rejects moving or omitting a stored animal in a public reorganization command', () => {
    const session = wmSession([57], (state) => {
      state.roundActionOrder[0] = 'sheep-market'
      const owner = state.players[0]!
      owner.resources.sheep = 1
      owner.cardStates[id(57)] = { extraData: { fixedAnimals: { sheep: 1 } } }
    })
    const r = wmOk(session.takeAction(0, 'sheep-market'))
    if (r.interaction.stateId !== 'wait' || r.interaction.request.kind !== 'animal-reorg')
      throw new Error(`Expected reorganization: ${JSON.stringify(r.interaction)}`)
    const zones = r.interaction.request.zones
    const moved = zones.map((zone) =>
      zone.cardId === id(57)
        ? { ...zone, animalCount: 0, animalCounts: {}, animalType: null }
        : zone,
    )
    for (const attempted of [moved, zones.filter((zone) => zone.cardId !== id(57))]) {
      const rejected = session.resolveChoice(0, 'confirm', { zones: attempted })
      expect(rejected.ok).toBe(false)
      expect(rejected.state.players[0]!.resources.sheep).toBe(r.state.players[0]!.resources.sheep)
      expect(rejected.state.players[0]!.cardStates[id(57)]!.extraData!.fixedAnimals).toEqual({
        sheep: 1,
      })
    }
    expect(
      wmOk(session.resolveChoice(0, 'confirm', { zones })).state.players[0]!.resources.sheep,
    ).toBe(2)
  })
  it('Animal Nursery can store a real newborn and keeps it fixed after restore', () => {
    let session = wmSession([57], (state) => sheepPasture(state))
    let r = wmConfirmations(session, wmEndRound(session, 4))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
      r = wmConfirmations(
        session,
        wmOk(session.resolveChoice(0, 'confirm', { zones: r.interaction.request.zones })),
      )
    r = wmAction(session, r, 'actions.store-on-card.name')
    expect(r.state.players[0]!.resources.sheep).toBe(3)
    expect(r.state.players[0]!.cardStates[id(57)]!.extraData!.fixedAnimals).toMatchObject({
      sheep: 1,
    })
    session = wmRestore(session)
    const zones = session.withCtx(() =>
      computeAnimalZones(session.state.players[0]!, session.state),
    )
    expect(zones.find((z) => z.cardId === id(57))).toMatchObject({
      minimumAnimalCounts: { sheep: 1 },
      capacity: 1,
    })
  })
  it('Ram keeps one sheep on the card and feeds it in addition to the two family members', () => {
    const session = wmSession(
      [102],
      (state) => {
        state.players[0]!.resources.sheep = 1
        state.players[0]!.houseAnimals = { sheep: 1 }
      },
      false,
    )
    let r = wmPayment(session, playMinor(session, id(102)))
    expect(r.state.players[0]!.resources.sheep).toBe(1)
    expect(r.state.players[0]!.cardStates[id(102)]!.extraData!.fixedAnimals).toEqual({ sheep: 1 })
    r = wmConfirmations(session, wmEndRound(session, 4))
    expect(r.state.players[0]!.resources.food).toBe(35)
    expect(r.state.players[0]!.resources.sheep).toBe(1)
  })
  it('Apple Tree keeps its planted wood through harvest and pays food instead', () => {
    const session = wmSession(
      [58],
      (state) => {
        state.players[0]!.resources.wood = 1
        state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
      },
      false,
    )
    let r = wmPayment(session, playMinor(session, id(58)))
    if (!r.state.players[0]!.fields[0]!.stacks.length)
      r = wmOk(session.commitSelectionChoice(0, { positions: ['0-1'] }))
    r = wmConfirmations(session, wmEndRound(session, 4))
    expect(r.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'wood', remaining: 1 }])
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 0, food: 37 })
  })
  it('Donkey displaces animals from its pasture and the reorganization cannot put them back', () => {
    const session = wmSession([74], (state) => sheepPasture(state, 1), false)
    let r = wmPayment(session, playMinor(session, id(74)))
    if (sessionOptions(r).some((o) => o.value === 'pasture-1'))
      r = wmChoose(session, r, 'pasture-1')
    const zones = session.withCtx(() =>
      computeAnimalZones(session.state.players[0]!, session.state),
    )
    expect(zones.find((z) => z.zoneType === 'pasture')?.blocked).toBe(true)
    expect(
      r.interaction.stateId === 'wait' && r.interaction.request.kind,
      JSON.stringify(r.interaction),
    ).toBe('animal-reorg')
  })
})
