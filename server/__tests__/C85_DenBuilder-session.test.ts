import { describe, expect, it } from 'vitest'
import { type GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { playOccupation } from './_helpers/card-regression-session'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C085_DenBuilder'

describe('C085_DenBuilder session', () => {
  const setup = (options?: { houseType?: 'wood' | 'clay' | 'stone'; grain?: number; food?: number }) => {
    const session = createWorkSession({seed: 85, configure: state => {
      state.round = 8
      state.players.forEach(player => {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      })
      const player = state.players[0]!
      player.occupationHand = ['C085_DenBuilder']
      player.houseType = options?.houseType ?? 'clay'
      player.resources.grain = options?.grain ?? 2
      player.resources.food = options?.food ?? 5
    }})
    const bought = playOccupation(session, 'C085_DenBuilder')
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.state.players[0]!.occupationPlayed).toContain('C085_DenBuilder')
    confirmNextPlayer(session)
    expect(session.takeAction(1,'forest').ok).toBe(true)
    confirmNextPlayer(session)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  const rejectAnytime = (session: GameSession) => {
    const before = session.getState()
    const expected = JSON.stringify({player:before.state.players[0],interaction:before.interaction})
    const denied = session.takeAnytimeAction(0,'C85-den-builder-anytime')
    expect(denied.ok).toBe(false)
    expect(JSON.stringify({player:denied.state.players[0],interaction:denied.interaction})).toBe(expected)
  }

  it('available in clay house: pays grain+food and grants capacity without a physical room', () => {
    const session = setup({ houseType: 'clay', grain: 2, food: 5 })
    const state = session.getState().state
    const initialRooms = state.players[0]!.rooms

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'C85-den-builder-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.grain).toBe(1) // 2 - 1
    expect(updatedPlayer.resources.food).toBe(3)  // 5 - 2
    expect(updatedPlayer.rooms).toBe(initialRooms)
    expect(updatedPlayer.roomTiles).toHaveLength(2)
    expect(isCardFlagged(updatedPlayer, 'C085_DenBuilder')).toBe(true)
  })

  it.each(['clay','stone'] satisfies Array<'clay' | 'stone'>)('a paid %s-house card permits real growth but leaves two room tiles', houseType => {
    const session = setup({houseType,grain:2,food:5})
    enterActiveInteraction(session)
    const used = session.takeAnytimeAction(0,'C85-den-builder-anytime')
    expect(used.ok,used.error).toBe(true)
    expect(used.state.players[0]!.rooms).toBe(2)
    expect(used.state.players[0]!.roomTiles).toHaveLength(2)
    const plowed = session.commitSelectionChoice(0,{tile:{row:0,col:1}})
    expect(plowed.ok,plowed.error).toBe(true)
    confirmNextPlayer(session)
    expect(session.takeAction(1,'grain-seeds').ok).toBe(true)
    confirmNextPlayer(session)
    const grown = session.takeAction(0,'wish-children')
    expect(grown.ok,grown.error).toBe(true)
    expect(grown.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(3)
    expect(grown.state.players[0]!.rooms).toBe(2)
    expect(grown.state.players[0]!.roomTiles).toHaveLength(2)
    expect(grown.state.players[0]!.workers).toHaveLength(5)
    session.dispose()
  })

  it('NOT available in wood house', () => {
    const session = setup({ houseType: 'wood', grain: 2, food: 5 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
    rejectAnytime(session)
  })

  it('NOT available after flagged (one-time)', () => {
    const session = setup({ houseType: 'clay', grain: 5, food: 10 })

    enterActiveInteraction(session)

    const resp1 = session.takeAnytimeAction(0, 'C85-den-builder-anytime')
    expect(resp1.ok).toBe(true)

    // Should no longer be available
    const anytimeIds = resp1.interaction.anytimeActions.map((a) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
    rejectAnytime(session)
  })

  it('NOT available without enough grain', () => {
    const session = setup({ houseType: 'clay', grain: 0, food: 5 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
    rejectAnytime(session)
  })

  it('NOT available without enough food', () => {
    const session = setup({ houseType: 'clay', grain: 2, food: 1 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
    rejectAnytime(session)
  })
})
