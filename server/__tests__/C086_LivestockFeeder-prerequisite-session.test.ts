import { afterEach, describe, expect, it } from 'vitest'
import type { SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD_ID = 'C086_LivestockFeeder'
const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Card-local metadata fix. Session tests cover real occupation choices and payment.
// New two-player work game, fixed hands, empty farm, no prior card state or occupied spaces.
// Printed card: https://www.lookout-spiele.de/upload/en_agricolare_consuldirigens.html_GalleryImage_3.jpg
const setup = ({ priorOccupations, food }: { priorOccupations: number; food: number }) => {
  const session = createWorkSession({
    seed: 5086,
    options: { playerCount: 2 },
    configure: state => {
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        Object.assign(player.resources, { food: 0, grain: 0 })
      }
      const player = state.players[0]!
      player.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist'].slice(0, priorOccupations)
      player.occupationHand = [CARD_ID, 'A110_Roughcaster', 'A125_Priest']
      player.resources.food = food
    },
  })
  sessions.push(session)
  return session
}

const observable = (response: SessionResponse) => JSON.stringify({
  state: response.state, interaction: response.interaction, scores: response.scores,
})

describe('C086 Livestock Feeder printed play prerequisites', () => {
  it.each([
    { priorOccupations: 0, food: 0, remainingFood: 0, played: [CARD_ID] },
    { priorOccupations: 1, food: 2, remainingFood: 1, played: ['A116_WoodCutter', CARD_ID] },
    { priorOccupations: 2, food: 2, remainingFood: 1, played: ['A116_WoodCutter', 'B121_Geologist', CARD_ID] },
  ])('plays after $priorOccupations earlier occupations with the normal fee and one grain', ({ priorOccupations, food, remainingFood, played }) => {
    const session = setup({ priorOccupations, food })
    const opening = session.takeAction(0, 'lessons')
    expect(opening.ok, opening.error).toBe(true)
    expect(opening.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
    if (opening.interaction.stateId !== 'wait' || opening.interaction.request.kind !== 'choice') {
      throw new Error('Expected an occupation choice')
    }
    const option = opening.interaction.request.options.find(candidate => candidate.value === CARD_ID)
    expect(option, 'The printed card has no occupation-count prerequisite').toBeDefined()
    expect(option?.disabled).not.toBe(true)

    const response = session.resolveChoice(0, CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toEqual(played)
    expect(response.state.players[0]!.occupationHand).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: remainingFood, grain: 1 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === CARD_ID)).toHaveLength(1)
    expect(response.state.log.filter(entry => entry.key === 'log.playOccupation' && entry.params?.occupations === CARD_ID)).toHaveLength(1)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'grains')).toMatchObject({ quantity: 1, total: 1 })
  })

  it.each([1, 2])('still rejects an unaffordable occupation after %i earlier occupations', priorOccupations => {
    const session = setup({ priorOccupations, food: 0 })
    const before = observable(session.getState())
    expect(session.getActionAvailability(0).lessons).toBe(false)
    const rejected = session.takeAction(0, 'lessons')
    expect(rejected.ok).toBe(false)
    expect(observable(rejected)).toBe(before)
  })

  it('rejects a wrong actor and a repeated play without charging or granting another grain', () => {
    const session = setup({ priorOccupations: 1, food: 2 })
    const opening = session.takeAction(0, 'lessons')
    expect(opening.ok, opening.error).toBe(true)
    const before = observable(opening)
    const wrongActor = session.resolveChoice(1, CARD_ID)
    expect(wrongActor.ok).toBe(false)
    expect(observable(wrongActor)).toBe(before)

    const played = session.resolveChoice(0, CARD_ID)
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.resources).toMatchObject({ food: 1, grain: 1 })
    const after = observable(played)
    const repeated = session.resolveChoice(0, CARD_ID)
    expect(repeated.ok).toBe(false)
    expect(observable(repeated)).toBe(after)
  })
})
