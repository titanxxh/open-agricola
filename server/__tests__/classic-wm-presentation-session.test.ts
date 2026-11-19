import { describe, expect, it } from 'vitest'
import { collectCardStatePresentation } from '../../shared/cards/card-state-presentation'
import { getClassicAdjacentSpaceIds } from '../../shared/cards/helpers/classic-board-topology'
import { playOccupation, sessionOptions } from './_helpers/card-regression-session'
import { wmSession, wmId as id, wmOk, wmChoose, wmAction, wmPayment, wmRestore, wmBonus } from './_helpers/classic-wm-session'

describe('WM public markers and printed-board placement in four-player sessions', () => {
  it('shows stock and crop layers while keeping private hand identities and internal cursors hidden', () => {
    const session = wmSession([18, 22, 35, 53, 57, 68, 96], state => {
      const player = state.players[0]!
      player.cardStates[id(18)] = { counters: { wood: 2, clay: 1 }, extraData: { internalCursor: 'secret' } }
      player.cardStates[id(22)] = { stack: ['clay', 'vegetable', 'reed'] }
      player.cardStates[id(35)] = { extraData: { actionSpaceAttachments: [{ spaceId: 'forest', resources: { wood: 2 } }] } }
      player.cardStates[id(53)] = { counters: { cards: 1 }, privateData: { cards: ['unrevealed-hand-card'] } }
      player.cardStates[id(57)] = { extraData: { fixedAnimals: { sheep: 1, boar: 1 } } }
      player.cardStates[id(68)] = { counters: { bonusVp: 2 }, extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] } }
      player.cardStates[id(96)] = { counters: { food: 3 }, extraData: { turnToken: 900 } }
    })
    const facts = session.withCtx(() => collectCardStatePresentation(session.state.players[0]!))
    expect(facts[id(18)]).toMatchObject({ counters: { wood: 2, clay: 1 } })
    expect(facts[id(22)]?.stack).toEqual(['clay', 'vegetable', 'reed'])
    expect(facts[id(35)]?.actionSpaceAttachments).toEqual([{ spaceId: 'forest', resources: { wood: 2 } }])
    expect(facts[id(53)]?.counters).toEqual({ cards: 1 })
    expect(facts[id(57)]?.animalMarkers).toEqual([{ animal: 'sheep', count: 1 }, { animal: 'boar', count: 1 }])
    expect(facts[id(68)]?.cropLayers).toEqual([{ stack: { kind: 'grain', remaining: 2 }, slotIndex: 0, top: true }])
    expect(facts[id(96)]?.counters).toEqual({ food: 3 })
    expect(JSON.stringify(facts)).not.toMatch(/secret|unrevealed-hand-card|turnToken|internalCursor/)
    const restored = wmRestore(session)
    expect(restored.withCtx(() => collectCardStatePresentation(restored.state.players[0]!))).toEqual(facts)
  })

  it.each(['reed-bank', 'day-laborer', 'vegetable-seeds'])('Fish Hook may take one food after using the printed neighbour %s', space => {
    const session = wmSession([80], state => {
      state.round = 4
      state.roundActionOrder[3] = 'vegetable-seeds'
      state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 3
    })
    let response = wmOk(session.takeAction(0, space))
    response = wmAction(session, response, 'actions.collect.name')
    expect(response.state.players[0]!.resources.food).toBe(space === 'day-laborer' ? 3 : 1)
    expect(response.state.actionSpaces.find(s => s.id === 'fishing')!.resources.food).toBe(2)
  })

  it('Fish Hook can be declined and the printed round-four neighbour must first be revealed', () => {
    const session = wmSession([80], state => {
      state.roundActionOrder[3] = 'vegetable-seeds'
      state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 2
    })
    expect(getClassicAdjacentSpaceIds(session.state, 'fishing')).not.toContain('vegetable-seeds')
    const response = wmChoose(session, wmOk(session.takeAction(0, 'reed-bank')), '__skip__')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find(s => s.id === 'fishing')!.resources.food).toBe(2)
  })

  it('Attic marks only the newly built room, charges its wood, and loses that point when the room is removed', () => {
    const session = wmSession([60, 75], state => {
      Object.assign(state.players[0]!.resources, { wood: 7, reed: 2 })
      state.roundActionOrder[0] = 'fencing'
    })
    let response = wmOk(session.takeAction(0, 'farm-expansion'))
    if (sessionOptions(response).some(o => o.labelKey === 'actions.construct.name')) response = wmAction(session, response, 'actions.construct.name')
    response = wmPayment(session, wmOk(session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })))
    if (sessionOptions(response).some(o => o.value !== '__skip__')) response = wmChoose(session, response, sessionOptions(response).find(o => !o.disabled && o.value !== '__skip__')!.value)
    response = wmOk(session.commitSelectionChoice(0, { positions: ['0-0'] }))
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(wmBonus(response, 60)).toBe(1)
    expect(session.withCtx(() => collectCardStatePresentation(session.state.players[0]!))[id(60)]?.farmTerrainMarkers)
      .toEqual([{ row: 0, col: 0, kind: 'wood' }])
    session.state.currentPlayerIndex = 0
    session.loadState(session.state)
    response = wmOk(session.takeAction(0, 'fencing'))
    if (sessionOptions(response).some(o => o.value !== '__skip__')) response = wmChoose(session, response, sessionOptions(response).find(o => !o.disabled && o.value !== '__skip__')!.value)
    response = wmOk(session.commitSelectionChoice(0, { positions: ['0-0'] }))
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(wmBonus(response, 60)).toBe(0)
  })

  it.each([7, 8])('Amazon grants an animal on odd late rounds only (round %i)', round => {
    const session = wmSession([1], state => { state.round = round })
    let response = wmOk(session.takeAction(0, 'fishing'))
    if (round === 7) {
      const sheep = sessionOptions(response).find(o => o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesGained?.sheep === 1)
      expect(sheep).toBeDefined()
      response = wmChoose(session, response, sheep!.value)
    }
    expect(response.state.players[0]!.resources.sheep).toBe(round === 7 ? 1 : 0)
  })

  it('Bread Carrier schedules exactly the remaining rounds when an oven already exists', () => {
    const session = wmSession([8], state => {
      state.round = 12
      state.players[1]!.improvements = ['Major_ClayOven']
    }, false)
    const response = wmPayment(session, playOccupation(session, id(8)))
    expect(response.state.futureMeeples.filter(entry => entry.cardId === id(8)).map(entry => entry.round)).toEqual([13, 14])
  })
})
