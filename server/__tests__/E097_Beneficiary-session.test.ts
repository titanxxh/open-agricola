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
import * as audit45Beneficiary from './_helpers/audit/ae-negative-45-beneficiary'

describe('ae-negative-45-beneficiary', () => {
  const { setupOccupation, playOccupation, chooseSkip, sessions, it, optionsOf, actorOf } = audit45Beneficiary
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('E097 Beneficiary parity', () => {
    const setup = (occupations: number) => {
      const session = setupOccupation('E097_Beneficiary', { playerCount: 2, occupations, resources: { food: 3 } })
      session.state.players[0]!.occupationHand = ['E097_Beneficiary', 'C123_Freemason']
      session.loadState(session.state)
      return session
    }
    it('E097 S1: as the third occupation may play another occupation for one food', () => {
      const session = setup(2)
      let response = playOccupation(session, 'E097_Beneficiary')
      const before = response.state.players[0]!.resources.food
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait')
        return
      const occupation = optionsOf(response)?.find((option) => option.labelKey === 'actions.lessons.name')
      expect(occupation).toBeDefined()
      response = session.resolveChoice(0, occupation!.value)
      if (response.interaction.stateId === 'wait') {
        const freemason = optionsOf(response)?.find((option) => option.value === 'C123_Freemason')
        if (freemason)
          response = session.resolveChoice(0, freemason.value)
      }
      expect(response.state.players[0]!.occupationPlayed).toContain('C123_Freemason')
      expect(response.state.players[0]!.resources.food).toBe(before - 1)
    })
    it('E097 S2: the Beneficiary bonus may be declined', () => {
      const session = setup(2)
      const response = chooseSkip(session, playOccupation(session, 'E097_Beneficiary'), 'E097_Beneficiary')
      expect(response.state.players[0]!.occupationPlayed).toContain('E097_Beneficiary')
      expect(response.state.players[0]!.occupationPlayed).not.toContain('C123_Freemason')
    })
    it('E097 S3: as a non-third occupation it offers no bonus', () => {
      const response = playOccupation(setup(1), 'E097_Beneficiary')
      expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('E097_Beneficiary')
    })
    it('E097 N4 third occupation can play both extra occupation and paid minor exactly once', () => {
      const session = setup(2)
      session.state.players[0]!.minorHand = ['A056_Basket']
      session.state.players[0]!.resources.reed = 1
      session.loadState(session.state)
      let r = playOccupation(session, 'E097_Beneficiary')
      const occ = optionsOf(r).find(o => o.labelKey === 'actions.lessons.name')!
      r = session.resolveChoice(0, occ.value)
      if (r.state.players[0]!.occupationHand.includes('C123_Freemason'))
        r = session.resolveChoice(0, 'C123_Freemason')
      for (let n = 0; n < 6 && !r.state.players[0]!.minorPlayed.includes('A056_Basket'); n++) {
        const option = optionsOf(r)?.find(o => o.value === 'A056_Basket') ?? optionsOf(r)?.find(o => !['__skip__', '__done__', '__pass__'].includes(o.value))
        expect(option, JSON.stringify(r.interaction)).toBeDefined()
        r = session.resolveChoice(actorOf(r), option!.value)
        expect(r.ok, r.error).toBe(true)
      }
      expect(r.state.players[0]!.occupationPlayed).toHaveLength(4)
      expect(r.state.players[0]!.minorPlayed).toContain('A056_Basket')
      expect(r.state.players[0]!.resources).toMatchObject({ food: 1, reed: 0 })
    })
    it('E097 N5 third occupation may choose paid minor before extra occupation', () => {
      const session = setup(2)
      session.state.players[0]!.minorHand = ['A056_Basket']
      session.state.players[0]!.resources.reed = 1
      session.loadState(session.state)
      let r = playOccupation(session, 'E097_Beneficiary')
      const minor = optionsOf(r).find(o => JSON.stringify(o).includes('actions.improvement.name'))!
      expect(minor).toBeDefined()
      r = session.resolveChoice(actorOf(r), minor.value)
      for (let n = 0; n < 4 && !r.state.players[0]!.minorPlayed.includes('A056_Basket'); n++) {
        const o = optionsOf(r).find(o => o.value === 'A056_Basket') ?? optionsOf(r).find(o => !['__skip__', '__done__', '__pass__'].includes(o.value))
        expect(o, JSON.stringify(r.interaction)).toBeDefined()
        r = session.resolveChoice(actorOf(r), o!.value)
        expect(r.ok, r.error).toBe(true)
      }
      for (let n = 0; n < 4 && !r.state.players[0]!.occupationPlayed.includes('C123_Freemason'); n++) {
        const o = optionsOf(r).find(o => o.value === 'C123_Freemason') ?? optionsOf(r).find(o => !['__skip__', '__done__', '__pass__'].includes(o.value))
        expect(o, JSON.stringify(r.interaction)).toBeDefined()
        r = session.resolveChoice(actorOf(r), o!.value)
        expect(r.ok, r.error).toBe(true)
      }
      expect(r.state.players[0]!.occupationPlayed).toHaveLength(4)
      expect(r.state.players[0]!.minorPlayed).toContain('A056_Basket')
      expect(r.state.players[0]!.resources).toMatchObject({ food: 1, reed: 0 })
    })
  })
})
