import { describe, expect, it } from 'vitest'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { sessionOptions, setupOccupationSession } from './_helpers/batch07-card-play'

import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A125_Priest'
import '../../shared/cards/A/A131_CraftTeacher'

describe('A131 Craft Teacher through Session', () => {
  it('plays two occupations for free after Joinery', () => {
    const session = setupOccupationSession({
      cardId: 'A131_CraftTeacher',
      playerCount: 3,
      played: ['A131_CraftTeacher'],
      hand: ['A116_WoodCutter', 'A125_Priest'],
    })
    Object.assign(session.state.players[0]!.resources, { wood: 2, stone: 2 })
    session.state.availableMajorImprovements = ['Major_Joinery']
    session.loadState(session.state)

    let response = session.takeAction(0, 'major-improvement')
    for (let guard = 0; guard < 4 && !response.state.players[0]!.improvements.includes('Major_Joinery'); guard += 1) {
      if (response.interaction.stateId !== 'wait') break
      const next = sessionOptions(response).find((entry) => entry.value === 'Major_Joinery')
        ?? sessionOptions(response).find((entry) => entry.value !== 'cancel')
      expect(next, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, next!.value)
    }
    response = resolveTriggerIfPresent(session, response, 'A131_CraftTeacher')
    if (response.interaction.stateId === 'wait') {
      const takeTwo = sessionOptions(response).filter((entry) => entry.value !== '__skip__').at(-1)!
      expect(takeTwo, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, takeTwo.value)
    }
    for (const occupationId of ['A116_WoodCutter', 'A125_Priest']) {
      for (let guard = 0; guard < 3 && response.interaction.stateId === 'wait'
        && !sessionOptions(response).some((entry) => entry.value === occupationId); guard += 1) {
        const enter = sessionOptions(response).find((entry) => entry.value !== '__skip__')
        expect(enter, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, enter!.value)
      }
      if (response.interaction.stateId === 'wait') {
        const card = sessionOptions(response).find((entry) => entry.value === occupationId)
        expect(card, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, card!.value)
      }
    }

    expect(response.state.players[0]!.occupationPlayed).toEqual(expect.arrayContaining([
      'A131_CraftTeacher', 'A116_WoodCutter', 'A125_Priest',
    ]))
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})
