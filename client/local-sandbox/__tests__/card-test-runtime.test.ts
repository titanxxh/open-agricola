import { expect, it } from 'vitest'
import { runBrowserCardTestScript } from '../card-test-runtime.ts'

it.each(['top-level', 'callback'])('reports card runtime failures from a %s Session', async scope => {
  const source = `
const CARD_ID = 'CUSTOM_RuntimeFailure'
const CARD_DEF = { cardType: 'occupation', meta: { id: CARD_ID, name: 'Runtime failure', desc: [], cost: {} } }
const CARD_IMPL = { listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
  handler: () => { throw new Error('actual-card-runtime-probe') }
}] }
`
  const commands = `
const session = createSession()
session.devPlayCard(0, 'CUSTOM_RuntimeFailure')
session.takeAction(0, 'forest')
`
  const tests = scope === 'top-level' ? commands + "test('callback completed',()=>{})"
    : `test('callback completed',()=>{${commands}})`
  const result = await runBrowserCardTestScript({ kind: 'run', id: 'runtime-failure', source, tests })
  expect(result.outcome).toEqual({ kind: 'failed', failures: [expect.objectContaining({
    name: 'Card runtime', error: expect.stringContaining('actual-card-runtime-probe'),
  })] })
})

it('adds a failed GameCore command only to its own test assertion failures', async () => {
  const source = `
const CARD_ID = 'CUSTOM_CommandDiagnostic'
const CARD_DEF = { cardType: 'minor', meta: { id: CARD_ID, name: 'Command diagnostic', desc: [] } }
const CARD_IMPL = {}
`
  const tests = `
test('expected rejection passes', () => {
  const response = createSession().performRoundEnd()
  expect(response.ok).to.equal(false)
  expect(response.error).to.equal('not all workers used')
})
test('forgot to finish work', () => {
  const response = createSession().performRoundEnd()
  expect(response.state.round).to.equal(2)
})
test('unrelated assertion', () => { expect(0).to.equal(1) })
`
  const result = await runBrowserCardTestScript({ kind: 'run', id: 'command-diagnostic', source, tests })
  expect(result.outcome).toEqual({ kind: 'failed', failures: [
    { name: 'forgot to finish work', error: expect.stringContaining('Last failed GameCore command: performRoundEnd: not all workers used') },
    { name: 'unrelated assertion', error: 'expected +0 to equal 1' },
  ] })
})

it('runs a native Card Source with action-space subscriptions (ADR 0052)', async () => {
  const { WOODPILE_SOURCE } = await import('../../../shared/custom-code/__tests__/native-card-fixture.ts')
  const tests = `
const played = (owner) => {
  const session = createSession()
  const state = session.getState().state
  state.actionSpaces.find(space => space.id === 'fishing').resources.food = 2
  for (const player of state.players) player.resources.wood = 0
  session.loadState(state)
  session.devPlayCard(owner, 'CUSTOM_WoodpileHook')
  return session
}
test('positive: using Fishing also gives 1 wood', () => {
  const session = played(0)
  const response = session.takeAction(0, 'fishing')
  expect(response.ok).to.equal(true)
  expect(response.state.players[0].resources.wood).to.equal(1)
  expect(response.state.players[0].resources.food).to.be.greaterThan(0)
})
test('negative: another space gives no wood', () => {
  const response = played(0).takeAction(0, 'day-laborer')
  expect(response.state.players[0].resources.wood).to.equal(0)
})
test('negative: the opponent owning the card gives the actor nothing', () => {
  const response = played(1).takeAction(0, 'fishing')
  expect(response.state.players[0].resources.wood).to.equal(0)
  expect(response.state.players[1].resources.wood).to.equal(0)
})
`
  const result = await runBrowserCardTestScript({ kind: 'run', id: 'native-woodpile', source: WOODPILE_SOURCE, tests })
  expect(result.outcome).toEqual({ kind: 'passed', count: 3 })
})
