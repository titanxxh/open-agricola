import { afterEach, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import type { GameSession } from '../game/authoritative-session'

const sessions: GameSession[] = [], cardId = 'CUSTOM_DevBuyFlow'
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
function setup(flow: string) {
  const source = `const CARD_ID='${cardId}';const CARD_DEF=MinorImprovement({id:CARD_ID,name:'Dev buy flow'});const CARD_IMPL={effect:{id:CARD_ID,onBuy:()=>(${flow})}}`
  const compiled = validateAndCompileCustomCode(source, cardId)
  if (!compiled.valid) throw new Error(compiled.errors.join('; '))
  const session = createWorkSession({ seed: 42, customCards: [{ cardType: 'minor', cardJson: { id: cardId, name: 'Dev buy flow', deck: 'CUSTOM', number: 0, desc: [] },
    compiledCode: compiled.compiledCode, codeManifest: compiled.manifest }] })
  sessions.push(session); return session
}
it('settles the onBuy flow of a card played with the public dev command', () => {
  const session = setup('gainLeaf(CARD_ID,{food:2})'), before = session.getState().state.players[0]!.resources.food
  const result = session.devPlayCard(0, cardId)
  expect(result.ok).toBe(true)
  expect(result.state.players).toHaveLength(2)
  expect(result.state.players[0]!.resources.food).toBe(before + 2)
  expect(result.state.players[0]!.minorPlayed).toContain(cardId)
  expect(result.state.currentPlayerIndex).toBe(0)
  expect(result.state.log).toContainEqual(expect.objectContaining({ key: 'log.cardEffectGain', params: expect.objectContaining({ gain: { food: 2 }, cardId }) }))
  expect(result.scores).toBeDefined()
})
it('keeps a dev onBuy choice on its owner and settles the chosen reward through the engine', () => {
  const session = setup("{type:'xor',children:[gainLeaf(CARD_ID,{food:2}),gainLeaf(CARD_ID,{wood:1})]}")
  const before = session.getState().state.players[1]!.resources.food
  const opened = session.devPlayCard(1, cardId)
  expect(opened.ok).toBe(true)
  expect(opened.interaction.stateId).toBe('wait')
  if (opened.interaction.stateId !== 'wait' || opened.interaction.request.kind !== 'choice') throw new Error('Expected card reward choice')
  expect(opened.interaction.playerIndex).toBe(1)
  const chosen = opened.interaction.request.options[0]
  if (!chosen) throw new Error('Missing gain choice')
  const result = session.resolveChoice(1, chosen.value)
  expect(result.ok).toBe(true)
  expect(result.state.players[1]!.resources.food).toBe(before + 2)
  expect(result.state.currentPlayerIndex).toBe(0)
  expect(result.scores).toBeDefined()
})
