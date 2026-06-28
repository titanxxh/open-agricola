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

const actionDetailFor = (session: GameSession, action: string) =>
  session.state.log.find((entry) =>
    entry.key === 'log.actionDetail' &&
    entry.params?.action === `moor.specialActions.${action}`
  )

describe('Farmers of the Moor special actions', () => {
  it('sets up public special action cards for the two-player scanned cards', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })

    expect(session.state.farmersOfTheMoor?.specialActionCards).toEqual([
      expect.objectContaining({
        id: 'moor-special-1-2-terrain',
        actions: ['fell-trees', 'slash-and-burn', 'cut-peat'],
        location: { kind: 'market' },
      }),
      expect.objectContaining({
        id: 'moor-special-1-2-market-work',
        actions: ['horse-market', 'hiring-fair', 'black-market', 'illicit-work'],
        location: { kind: 'market' },
      }),
    ])
  })

  it('takes Cut Peat without placing a worker and moves the public card face-up', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
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
    expect(session.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved',
      actorPlayerId: player.id,
      sourceActionId: 'cut-peat',
      resources: { fuel: 3 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: player.id },
      reason: 'gain',
    }))
    expect(session.state.events.some((event) => event.type === 'worker.placed')).toBe(false)
    expect(actionDetailFor(session, 'cut-peat')).toEqual(expect.objectContaining({
      params: expect.objectContaining({
        detailParts: { gains: { fuel: 3 } },
      }),
    }))
  })

  it('resolves Fell Trees and Slash and Burn through terrain mutation rules', () => {
    const fellSession = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
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
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const slashPlayer = slashSession.state.players[0]!
    const slashCard = findCardFor(slashSession, 'slash-and-burn')
    const slashForest = slashPlayer.farmTerrain!.find((tile) => tile.kind === 'forest')!

    expect(slashSession.takeSpecialAction(0, slashCard.id, 'slash-and-burn', { tile: slashForest }).ok).toBe(true)
    expect(slashPlayer.fields).toContainEqual({ row: slashForest.row, col: slashForest.col, stacks: [] })
    expect(slashPlayer.farmTerrain!.some((tile) => tile.row === slashForest.row && tile.col === slashForest.col)).toBe(false)
    expect(slashSession.state.events).toContainEqual(expect.objectContaining({
      type: 'farm.fieldPlowed',
      actorPlayerId: slashPlayer.id,
      sourceActionId: 'slash-and-burn',
      fields: [{ playerId: slashPlayer.id, row: slashForest.row, col: slashForest.col }],
    }))
    expect(actionDetailFor(slashSession, 'slash-and-burn')).toEqual(expect.objectContaining({
      params: expect.objectContaining({
        detailParts: { effects: { plow: 1 } },
      }),
    }))
  })

  it('borrows an opponent face-up special action for 2 food and turns it face-down', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
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

  it('Horse Market costs 1 food in a two-player game and opens horse reorganization', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const player = session.state.players[0]!
    const card = findCardFor(session, 'horse-market')
    player.resources.food = 1

    const resp = session.takeSpecialAction(0, card.id, 'horse-market')

    expect(resp.ok).toBe(true)
    expect(player.resources.food).toBe(0)
    expect(player.resources.horse).toBe(1)
    expect(card.location).toEqual({ kind: 'playerFaceUp', playerId: player.id })
    expect(session.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid',
      actorPlayerId: player.id,
      sourceActionId: 'horse-market',
      resources: { food: 1 },
      paymentFor: 'bonus',
    }))
    expect(session.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved',
      actorPlayerId: player.id,
      sourceActionId: 'horse-market',
      resources: { horse: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: player.id },
      reason: 'gain',
    }))
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('animal-reorg')

    const placed = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'house', zoneType: 'house', animalType: 'horse', animalCount: 1 }],
    })

    expect(placed.state.players[0]!.houseAnimalType).toBe('horse')
    expect(placed.state.players[0]!.houseAnimalCount).toBe(1)
    expect(placed.state.players[0]!.resources.horse).toBe(1)
  })

  it('Horse Market allows horse cookery exchange before unaccommodated horse runs away', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const player = session.state.players[0]!
    const card = findCardFor(session, 'horse-market')
    player.resources.food = 1
    player.improvements.push('Major_Moor_HorseSlaughterhouse1')
    session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter(
      (id) => id !== 'Major_Moor_HorseSlaughterhouse1',
    )

    let resp = session.takeSpecialAction(0, card.id, 'horse-market')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    expect(resp.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')

    resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    const horseExchange = resp.interaction.options?.find((option) =>
      option.effectPreview?.kind === 'resourceExchange' &&
      option.effectPreview.resourcesPaid.horse === 1
    )
    expect(horseExchange).toBeDefined()

    resp = session.resolveChoice(0, horseExchange!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.resources.horse).toBe(0)
  })

  it('Black Market pays 1 fuel and opens a minor improvement purchase', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const player = session.state.players[0]!
    player.resources.fuel = 1
    player.resources.food = 0
    player.resources.wood = 1
    player.minorHand = ['E060_WorkingGloves', 'A037_Bucksaw']
    session.state.players[1]!.minorHand = ['__test_placeholder__']
    const card = findCardFor(session, 'black-market')

    let resp = session.takeSpecialAction(0, card.id, 'black-market')

    expect(resp.ok).toBe(true)
    expect(player.resources.fuel).toBe(0)
    expect(card.location).toEqual({ kind: 'playerFaceUp', playerId: player.id })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('choice')
    const option = resp.interaction.options?.find((entry) => entry.value === 'E060_WorkingGloves')
    expect(option).toBeDefined()

    resp = session.resolveChoice(0, option!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorHand).not.toContain('E060_WorkingGloves')
    expect(resp.state.players[0]!.minorPlayed).toContain('E060_WorkingGloves')
    expect(resp.state.players[0]!.resources.food).toBe(1)
  })

  it('Illicit Work pays 1 food and 1 fuel and opens a major improvement purchase', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const player = session.state.players[0]!
    player.resources.food = 1
    player.resources.fuel = 1
    player.resources.clay = 5
    player.minorHand = ['__test_placeholder__']
    session.state.players[1]!.minorHand = ['__test_placeholder__']
    const card = findCardFor(session, 'illicit-work')

    let resp = session.takeSpecialAction(0, card.id, 'illicit-work')

    expect(resp.ok).toBe(true)
    expect(player.resources.food).toBe(0)
    expect(player.resources.fuel).toBe(0)
    expect(card.location).toEqual({ kind: 'playerFaceUp', playerId: player.id })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('choice')
    const option = resp.interaction.options?.find((entry) => entry.value === 'major:Major_Fireplace1')
    expect(option).toBeDefined()

    resp = session.resolveChoice(0, option!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(3)
    expect(resp.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(resp.state.availableMajorImprovements).not.toContain('Major_Fireplace1')
  })

  it('requires an unplaced healthy worker and returns special action cards home at return-home', () => {
    const session = new GameSession(41, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
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
