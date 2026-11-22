import { describe, expect, it } from 'vitest'
import {
  wmSession,
  wmId as id,
  wmOk,
  wmChoose,
  wmPayment,
  wmEndRound,
  wmConfirmations
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
