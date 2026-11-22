import { describe, it, expect } from 'vitest'
import {
  wmSession,
  wmId as id,
  wmOk,
  wmAction,
  wmChoose,
  wmRestore,
  wmEvent
} from './_helpers/classic-wm-session'
import { sessionOptions } from './_helpers/card-regression-session'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'
import { getLogicalFields } from '../../shared/cards/helpers/card-field'
import { } from '../../shared/domain/player'
import { } from '../../shared/cards/helpers/return-card'
import { } from '../../shared/cards/helpers/turn-token'

const startSow = (numbers: number[], setup: Parameters<typeof wmSession>[1]) =>
  wmSession(numbers, (state) => {
    state.roundActionOrder[0] = 'grain-utilization'
    setup?.(state)
  })

describe('WM advanced rules through four-player public commands', () => {
  it('Chemist transfers personal clay to a different building pile and gains exactly two food', () => {
    const session = wmSession([9], (state) => {
      state.players[0]!.resources.clay = 1
    })
    let r = wmOk(session.takeAction(0, 'forest'))
    r = wmAction(session, r, 'actions.clay-pit.name')
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 0, food: 2 })
    expect(r.state.actionSpaces.find((s) => s.id === 'clay-pit')!.resources.clay).toBe(2)
    wmEvent(r, 9)
    expect(wmOk(session.undoAction()).state.players[0]!.resources.clay).toBe(1)
  })
  it('Wood Worker puts food on a nonaccumulating space for its next user, including another player', () => {
    const session = wmSession([55])
    let r = wmAction(
      session,
      wmOk(session.takeAction(0, 'day-laborer')),
      'actions.return-to-space.name',
    )
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 1, food: 1 })
    expect(r.state.actionSpaces.find((s) => s.id === 'day-laborer')!.resources.food).toBe(1)
    session.state.actionSpaces.find((s) => s.id === 'day-laborer')!.takenBy = []
    session.state.currentPlayerIndex = 1
    session.loadState(session.state)
    r = wmOk(session.takeAction(1, 'day-laborer'))
    expect(r.state.players[1]!.resources.food).toBe(3)
    expect(r.state.actionSpaces.find((s) => s.id === 'day-laborer')!.resources.food).toBe(0)
  })
  it('Permaculturist sows used but non-field crop spaces, allows discard and preserves them through restore', () => {
    const session = startSow([40], (state) => {
      state.players[0]!.resources.grain = 1
    })
    let r = wmOk(session.takeAction(0, 'grain-utilization'))
    const sow = sessionOptions(r).find((o) => o.labelKey === 'actions.sow.name')
    if (sow) r = wmChoose(session, r, sow.value)
    r = wmOk(session.commitSelectionChoice(0, { crops: [{ row: 0, col: 4, crop: 'grain' }] }))
    expect(getLogicalFields(r.state.players[0]!)).toHaveLength(0)
    expect(getUsedFarmyardTileKeys(r.state.players[0]!)).toContain('0-4')
    const restored = wmRestore(session)
    const action = restored
      .getState()
      .interaction.anytimeActions.find((a) => a.sourceCard === id(40))!
    r = wmOk(restored.takeAnytimeAction(0, action.id))
    r = wmOk(restored.commitSelectionChoice(0, { positions: ['0-4'] }))
    expect(getUsedFarmyardTileKeys(r.state.players[0]!)).not.toContain('0-4')
    expect(r.state.players[0]!.resources.grain).toBe(0)
  })
})
