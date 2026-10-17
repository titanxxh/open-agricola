// Helpers of ae-negative-45-basket-session.test.ts from the negative audit snapshot fafd4f51b.
import fs from '../audit-evidence-fs'
import { expect, it as nativeIt } from 'vitest'
import type { ActionChoiceOption } from '../../../../shared/contract/types'
import type { SessionResponse } from '../../../game/authoritative-session'
import type { GameSession } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'

export const CARD_ID = 'C095_BasketWeaver'
export const BASKET = 'Major_Basket'
export const FILLER = '__test_placeholder__'
export const sessions: GameSession[] = []
export const setup = ({ reed = 1, stone = 1, basketAvailable = true, paid = false } = {}) => {
  const session = createWorkSession({ seed: 9707, configure: (state) => {
      const owner = state.players[0]!
      owner.occupationHand = [CARD_ID, FILLER]
      owner.occupationPlayed = paid ? ['A125_Priest'] : []
      Object.assign(owner.resources, { wood: 0, clay: 0, food: paid ? 1 : 0, reed, stone })
      state.availableMajorImprovements = basketAvailable ? [BASKET] : ['Major_Fireplace1']
      if (!basketAvailable)
        state.players[1]!.improvements = [BASKET]
    } })
  sessions.push(session)
  return session
}
export const playBasketWeaver = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait')
      return response
    const option = optionsOf(response)?.find((entry) => entry.value === CARD_ID)
    expect(option).toBeDefined()
    response = session.resolveChoice(actorOf(response), option!.value)
  }
  return response
}
export function it(name: string, run: () => void) {
  nativeIt(name, () => {
    run()
    const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/45-capture'
    fs.mkdirSync(output, { recursive: true })
    fs.writeFileSync(`${output}/${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`, JSON.stringify(sessions.map(session => {
      const r = session.getState()
      return { players: r.state.players.map(p => ({ resources: p.resources, rooms: p.rooms, house: p.houseType, workers: p.workers, minorPlayed: p.minorPlayed, occupations: p.occupationPlayed, improvements: p.improvements, cardStates: p.cardStates, fences: p.fenceSegments })), majors: r.state.availableMajorImprovements, interaction: r.interaction, scores: r.scores, events: r.state.events, log: r.state.log }
    }), null, 2))
  })
}
export function optionsOf(r: SessionResponse): ActionChoiceOption[] {
  const i = r.interaction
  return i.stateId === 'wait' && 'options' in i.request ? i.request.options ?? [] : []
}
export function actorOf(r: SessionResponse) {
  if (r.interaction.stateId !== 'wait')
    throw new Error('Expected waiting native actor')
  return r.interaction.playerIndex
}
