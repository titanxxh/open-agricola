// Helpers of ae-negative-45-furnisher-session.test.ts from the negative audit snapshot fafd4f51b.
import fs from '../audit-evidence-fs'
import { it as nativeIt } from 'vitest'
import '../../../../shared/cards/B/B003_Moonshine'
import '../../../../shared/cards/D/D056_FatstockStretcher'
import '../../../../shared/cards/D/D062_BeerTap'
import '../../../../shared/cards/D/D096_Furnisher'
import type { ActionChoiceOption, ChoiceDescriptionPreview } from '../../../../shared/contract/types'
import { GameSession, type SessionResponse } from '../../../game/authoritative-session'

export const improvementCount = (description?: ChoiceDescriptionPreview): number => !description ? 0 : description.kind === 'action'
  ? description.effectPreview?.kind === 'rule' ? improvementCount(description.effectPreview.description) : description.labelKey === 'actions.improvement.name' ? 1 : 0
  : description.kind === 'conditional' ? improvementCount(description.body) : description.parts.reduce((sum, part) => sum + improvementCount(part), 0)
export const sessions: GameSession[] = []
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
