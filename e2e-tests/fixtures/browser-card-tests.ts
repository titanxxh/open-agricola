export const cardId = 'CUSTOM_BrowserTests'

export const source = `
const CARD_ID = '${cardId}'
const CARD_DEF = { cardType: 'occupation', meta: {
  id: CARD_ID, name: 'Browser Boots', deck: 'CUSTOM', number: 0,
  desc: ['After using Forest, gain 1 additional wood.'], cost: {}, vp: 0, implemented: true,
} }
const CARD_IMPL = { listeners: [{
  cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
  handler: context => {
    if (context.space?.id !== 'forest') return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}] }
`

const preparation = `
function prepared() {
  const session = createSession()
  const state = session.getState().state
  const player = state.players[0]
  player.resources = { ...helpers.emptyResources }
  state.currentPlayerIndex = 0
  state.round = 1
  state.actionSpaces.find(space => space.id === 'forest').resources.wood = 3
  expect(session.devPlayCard(0, '${cardId}').ok).to.equal(true)
  return { session, state, player }
}
`

export const passingTests = preparation + `
test('Forest gains exactly 4 wood and clears the space', () => {
  const { session } = prepared()
  const result = session.takeAction(0, 'forest')
  expect(result.ok, result.error).to.equal(true)
  expect(result.state.players[0].resources.wood).to.equal(4)
  expect(result.state.actionSpaces.find(space => space.id === 'forest').resources.wood).to.equal(0)
})
test('Fishing does not trigger the wood bonus', () => {
  const { session, state } = prepared()
  state.actionSpaces.find(space => space.id === 'fishing').resources.food = 2
  const result = session.takeAction(0, 'fishing')
  expect(result.ok, result.error).to.equal(true)
  expect(result.state.players[0].resources.wood).to.equal(0)
  expect(result.state.players[0].resources.food).to.equal(2)
})
test('A new Session has no previous reward', () => {
  const { player } = prepared()
  expect(player.resources.wood).to.equal(0)
})
`

export const choiceSource = source.slice(0, source.indexOf('const CARD_IMPL')) + `
const CARD_IMPL = {
  effect: { resolveChoice: (_state, _player, choice) => {
    if (choice === 'one' || choice === 'two') return gainLeaf(CARD_ID, { grain: choice === 'two' ? 2 : 1 })
  } },
  listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], handler: context => {
    if (context.space?.id !== 'forest') return
    return { sourceCard: CARD_ID, flow: { type: 'leaf', actionId: 'emit-choice', sourceCard: CARD_ID,
      params: { options: [{ value: 'one', labelKey: 'Take 1 grain' }, { value: 'two', labelKey: 'Take 2 grain' }],
        promptKey: 'Pick a reward' } } }
  } }],
}
`

export const choiceTests = preparation + `
test('A pending choice grants only the selected reward', () => {
  const { session } = prepared()
  const pending = session.takeAction(0, 'forest')
  expect(pending.ok, pending.error).to.equal(true)
  expect(pending.state.players[0].resources.grain).to.equal(0)
  expect(pending.interaction.request.kind).to.equal('choice')
  expect(pending.interaction.request.options.map(option => option.value)).to.deep.equal(['one', 'two'])
  const chosen = session.resolveChoice(0, 'two')
  expect(chosen.ok, chosen.error).to.equal(true)
  expect(chosen.state.players[0].resources.grain).to.equal(2)
})
`

export const infiniteTests = `test('Runaway test', () => { while (true) {} })`

export const handshakeTests = `
Function('return globalThis')().postMessage({ kind: 'ready' })
test('A forged ready cannot turn a failed assertion green', () => {
  expect(5).to.equal(4)
})
`

export const isolationTests = (url: string) => `
test('Real worker global has an opaque origin', () => {
  const real = Function('return globalThis')()
  expect(real.origin).to.equal('null')
  expect(real.document).to.equal(undefined)
  expect(real.parent).to.equal(undefined)
  expect(real.localStorage).to.equal(undefined)
  expect(real.Worker).to.equal(undefined)
  expect(real.SharedWorker).to.equal(undefined)
})
test('Opaque worker cannot open origin storage', async () => {
  const real = Function('return globalThis')()
  let blocked = false
  try {
    const request = real.indexedDB.open('browser-card-test-parent-secret')
    await new Promise((resolve, reject) => { request.onsuccess = resolve; request.onerror = reject })
  } catch { blocked = true }
  expect(blocked).to.equal(true)
})
test('CSP blocks a real credentialed network attempt', async () => {
  const real = Function('return globalThis')()
  expect(typeof real.fetch).to.equal('function')
  let blocked = false
  try { await real.fetch(${JSON.stringify(url)}, { mode: 'no-cors', credentials: 'include' }) }
  catch { blocked = true }
  expect(blocked).to.equal(true)
})
test('CSP blocks importScripts', () => {
  let blocked = false
  try { Function('return globalThis')().importScripts(${JSON.stringify(url)}) }
  catch { blocked = true }
  expect(blocked).to.equal(true)
})
`
