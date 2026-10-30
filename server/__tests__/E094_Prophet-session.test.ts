import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/E/E092_FieldDoctor'
import '../../shared/cards/E/E093_Motivator'
import '../../shared/cards/E/E094_Prophet'
import '../../shared/cards/E/E095_Miller'
import '../../shared/cards/E/E097_Beneficiary'
import '../../shared/cards/E/E130_Overachiever'
import '../../shared/cards/E/E132_VeggieLover'
import '../../shared/cards/E/E135_Pickler'
import '../../shared/cards/E/E147_AnimalDriver'
import '../../shared/cards/E/E164_MountainPlowman'
import '../../shared/cards/E/E165_MasterHuntsman'
import '../../shared/cards/E/E166_Roastmaster'
import { afterEach, expect, describe } from 'vitest'
import { assertRejectedUnchanged, confirmNext } from './_helpers/negative-rule-audit'
import * as audit45Prophet from './_helpers/audit/ae-negative-45-prophet'

describe('ae-negative-45-prophet', () => {
  const { setupOccupation, playOccupation, sessions, it, optionsOf, requestOf, actorOf } = audit45Prophet
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('E094 Prophet parity', () => {
    const setup = () => setupOccupation('E094_Prophet', { resources: { clay: 2, reed: 1, wood: 4 } })
    it('E094 S1: playing immediately renovates a wood house to clay', () => {
      const response = playOccupation(setup(), 'E094_Prophet')
      expect(response.state.players[0]!.houseType).toBe('clay')
      expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
    })
    it('E094 S2: optional fencing after renovation may be declined', () => {
      const session = setup()
      let response = playOccupation(session, 'E094_Prophet')
      if (response.interaction.stateId === 'wait' && requestOf(response).kind === 'choice') {
        response = session.resolveChoice(actorOf(response), '__skip__')
      }
      expect(response.state.players[0]!.resources.wood).toBe(4)
      expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    })
    it('E094 N3 usual four wood fencing follows paid renovation and insufficient wood cannot build four fences', () => {
      for (const wood of [4, 3]) {
        const session = setup()
        session.state.players[0]!.resources.wood = wood
        session.loadState(session.state)
        let r = playOccupation(session, 'E094_Prophet')
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
          const o = optionsOf(r).find(o => o.value !== '__skip__')
          expect(o).toBeDefined()
          r = session.resolveChoice(actorOf(r), o!.value)
        }
        expect(r.interaction.stateId).toBe('wait')
        const fencePlan = { edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'], palisadeEdges: [] }
        if (wood === 4) {
          r = session.commitSelectionChoice(0, fencePlan)
          expect(r.ok, r.error).toBe(true)
          expect(r.state.players[0]!.fenceSegments).toHaveLength(4)
          expect(r.state.players[0]!.resources.wood).toBe(0)
        }
        else {
          assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, fencePlan))
          if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
            confirmNext(session, r)
            r = session.takeAction(1, 'grain-seeds')
          }
          else {
            const skip = optionsOf(r).find(o => o.value === '__skip__' || o.value === 'cancel')
            expect(skip, JSON.stringify(r.interaction)).toBeDefined()
            r = session.resolveChoice(0, skip!.value)
          }
          expect(r.ok, r.error).toBe(true)
          expect(r.state.players[0]!.fenceSegments).toHaveLength(0)
          expect(r.state.players[0]!.resources.wood).toBe(3)
        }
        expect(r.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
        expect(r.state.players[0]!.houseType).toBe('clay')
      }
    })
  })
})
