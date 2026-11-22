import { describe, expect, it } from 'vitest'
import { collectCardStatePresentation } from '../../shared/cards/card-state-presentation'
import { playOccupation, sessionOptions } from './_helpers/card-regression-session'
import { wmSession, wmId as id, wmOk, wmChoose, wmPayment, wmRestore } from './_helpers/classic-wm-session'

describe('WM public markers and printed-board placement in four-player sessions', () => {
  it('shows stock and crop layers while keeping private hand identities and internal cursors hidden', () => {
    const session = wmSession([22, 35, 53], state => {
      const player = state.players[0]!
      player.cardStates[id(22)] = { stack: ['clay', 'vegetable', 'reed'] }
      player.cardStates[id(35)] = { extraData: { actionSpaceAttachments: [{ spaceId: 'forest', resources: { wood: 2 } }] } }
      player.cardStates[id(53)] = { counters: { cards: 1 }, privateData: { cards: ['unrevealed-hand-card'] } }
    })
    const facts = session.withCtx(() => collectCardStatePresentation(session.state.players[0]!))
    expect(facts[id(22)]?.stack).toEqual(['clay', 'vegetable', 'reed'])
    expect(facts[id(35)]?.actionSpaceAttachments).toEqual([{ spaceId: 'forest', resources: { wood: 2 } }])
    expect(facts[id(53)]?.counters).toEqual({ cards: 1 })
    expect(JSON.stringify(facts)).not.toMatch(/secret|unrevealed-hand-card|turnToken|internalCursor/)
    const restored = wmRestore(session)
    expect(restored.withCtx(() => collectCardStatePresentation(restored.state.players[0]!))).toEqual(facts)
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
