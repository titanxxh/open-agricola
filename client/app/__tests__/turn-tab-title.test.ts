import { describe, expect, it } from 'vitest'
import { gameNeedsTurnTab, lobbyNeedsTurnTab, turnTabTitle } from '../use-turn-tab-title'

describe('turnTabTitle', () => {
  it('cycles the BGA frames and restores the base title', () => {
    expect(turnTabTitle('Open Agricola', true, false)).toBe('◢ Open Agricola')
    expect(turnTabTitle('◢ Open Agricola', true, false)).toBe('◣ Open Agricola')
    expect(turnTabTitle('◣ Open Agricola', true, false)).toBe('◤ Open Agricola')
    expect(turnTabTitle('◤ Open Agricola', true, false)).toBe('◥ Open Agricola')
    expect(turnTabTitle('◥ Open Agricola', true, false)).toBe('◢ Open Agricola')
    expect(turnTabTitle('◥ Open Agricola', false, false)).toBe('Open Agricola')
  })

  it('holds the first frame when motion is reduced', () => {
    expect(turnTabTitle('Open Agricola', true, true)).toBe('◢ Open Agricola')
    expect(turnTabTitle('◣ Open Agricola', true, true)).toBe('◢ Open Agricola')
  })
})

describe('turn tab seats', () => {
  const room = { hotseat: false, player_index: 0, waiting_player_indexes: [0, 1] }

  it('spins the lobby for any non-hotseat room where this seat is waiting', () => {
    expect(lobbyNeedsTurnTab([room])).toBe(true)
    expect(lobbyNeedsTurnTab([{ ...room, hotseat: true }])).toBe(false)
    expect(lobbyNeedsTurnTab([{ ...room, player_index: 2 }])).toBe(false)
  })

  it('spins the game tab only for this seat in a non-hotseat room', () => {
    expect(gameNeedsTurnTab(false, 1, [1])).toBe(true)
    expect(gameNeedsTurnTab(true, 1, [1])).toBe(false)
    expect(gameNeedsTurnTab(false, null, [0])).toBe(false)
    expect(gameNeedsTurnTab(false, 0, [])).toBe(false)
  })
})
