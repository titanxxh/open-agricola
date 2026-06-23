import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'

const findCardFor = (
  session: GameSession,
  actionId: string,
) => session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
  card.actions.includes(actionId as never),
)!

const confirmNext = (session: GameSession) => {
  const pending = session.getState().interaction
  expect(pending.stateId).toBe('wait')
  expect(pending.request.kind).toBe('confirm-next-player')
  return session.resolveChoice(pending.playerIndex, 'confirm')
}

describe('Farmers of the Moor special actions', () => {
  it('sets up public special action cards for the first implemented actions', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })

    expect(session.state.farmersOfTheMoor?.specialActionCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actions: ['cut-peat'], location: { kind: 'market' } }),
        expect.objectContaining({ actions: ['fell-trees'], location: { kind: 'market' } }),
        expect.objectContaining({ actions: ['slash-and-burn'], location: { kind: 'market' } }),
        expect.objectContaining({ actions: ['hiring-fair'], location: { kind: 'market' } }),
      ]),
    )
  })

  it('takes Cut Peat without placing a worker and moves the public card face-up', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const player = session.state.players[0]!
    const card = findCardFor(session, 'cut-peat')
    const moor = player.farmTerrain!.find((tile) => tile.kind === 'moor')!

    const resp = session.takeSpecialAction(0, card.id, 'cut-peat', { tile: moor })

    expect(resp.ok).toBe(true)
    expect(player.resources.fuel).toBe(3)
    expect(player.farmTerrain!.some((tile) => tile.row === moor.row && tile.col === moor.col)).toBe(false)
    expect(card.location).toEqual({ kind: 'playerFaceUp', playerId: player.id })
    expect(session.state.actionSpaces.flatMap((space) => space.takenBy)).toEqual([])
  })

  it('resolves Fell Trees and Slash and Burn through terrain mutation rules', () => {
    const fellSession = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const fellPlayer = fellSession.state.players[0]!
    const fellCard = findCardFor(fellSession, 'fell-trees')
    const forest = fellPlayer.farmTerrain!.find((tile) => tile.kind === 'forest')!

    expect(fellSession.takeSpecialAction(0, fellCard.id, 'fell-trees', { tile: forest }).ok).toBe(true)
    expect(fellPlayer.resources.wood).toBe(2)
    expect(fellPlayer.farmTerrain!.some((tile) => tile.row === forest.row && tile.col === forest.col)).toBe(false)

    const slashSession = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const slashPlayer = slashSession.state.players[0]!
    const slashCard = findCardFor(slashSession, 'slash-and-burn')
    const slashForest = slashPlayer.farmTerrain!.find((tile) => tile.kind === 'forest')!

    expect(slashSession.takeSpecialAction(0, slashCard.id, 'slash-and-burn', { tile: slashForest }).ok).toBe(true)
    expect(slashPlayer.fields).toContainEqual({ row: slashForest.row, col: slashForest.col, stacks: [] })
    expect(slashPlayer.farmTerrain!.some((tile) => tile.row === slashForest.row && tile.col === slashForest.col)).toBe(false)
  })

  it('borrows an opponent face-up special action for 2 food and turns it face-down', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const p1 = session.state.players[0]!
    const p2 = session.state.players[1]!
    const card = findCardFor(session, 'hiring-fair')

    expect(session.takeSpecialAction(0, card.id, 'hiring-fair').ok).toBe(true)
    expect(card.location).toEqual({ kind: 'playerFaceUp', playerId: p1.id })
    expect(session.takeSpecialAction(0, card.id, 'hiring-fair').ok).toBe(false)

    confirmNext(session)
    p2.resources.food = 2
    const resp = session.takeSpecialAction(1, card.id, 'hiring-fair')

    expect(resp.ok).toBe(true)
    expect(p2.resources.food).toBe(1)
    expect(card.location).toEqual({ kind: 'playerFaceDown', playerId: p2.id })
    confirmNext(session)
    expect(session.takeSpecialAction(0, card.id, 'hiring-fair').ok).toBe(false)
  })

  it('requires an unplaced healthy worker and returns special action cards home at return-home', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const p1 = session.state.players[0]!
    const p2 = session.state.players[1]!
    const card = findCardFor(session, 'hiring-fair')

    p1.sickWorkerIds = ['1', '2']
    expect(session.takeSpecialAction(0, card.id, 'hiring-fair').ok).toBe(false)

    card.location = { kind: 'playerFaceDown', playerId: p1.id }
    markAllWorkersUsed(session.state, p1)
    markAllWorkersUsed(session.state, p2)
    expect(session.performRoundEnd().ok).toBe(true)

    expect(card.location).toEqual({ kind: 'market' })
  })
})
