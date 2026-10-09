import { test, expect, type Page } from '@playwright/test'

// Browser-local workshop sandbox (VITE_SANDBOX_EXECUTOR=browser). The engine
// and custom card code run entirely in a browser Worker — no server round-trips.
//
// Custom-card execution equivalence with the server isolated-vm executor is
// pinned by server/__tests__/local-sandbox-parity.test.ts; runaway-card timeout
// recovery is pinned by client/local-sandbox/__tests__/local-transport.test.ts.
// This spec covers what only a real browser proves: local boot with zero server
// calls, dev-panel dispatch through the worker, and IndexedDB resume on reload.

const CONFIG = {
  // A custom card with source forces the worker to compile (typescript) and
  // register it — a real-browser proof that new Function works.
  cards: [{
    cardType: 'minor',
    cardJson: { id: 'CUSTOM_E2ECard', name: 'E2E Card', deck: 'CUSTOM', number: 0, desc: ['E2E'] },
    source: [
      "const CARD_ID = 'CUSTOM_E2ECard'",
      "const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'E2E Card' })",
      'const CARD_IMPL = { effect: { id: CARD_ID, onReturnHome: () => gainLeaf(CARD_ID, { food: 1 }) } }',
    ].join('\n'),
    artUrl: null,
  }],
  playerCount: 2,
  seed: 42,
}

const seedAndOpen = async (page: Page, config = CONFIG): Promise<string[]> => {
  const gameApiCalls: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/api/game/')) gameApiCalls.push(req.url())
  })
  // devMode + player=p1 → the dev auth shortcut sets user.id to 'p1', so the
  // owner-scoped stash key must match (GameContainerApi uses user?.id ?? 'anon').
  await page.addInitScript((config) => {
    sessionStorage.setItem('open-agricola-local-sandbox-config', JSON.stringify({ owner: 'p1', config }))
  }, config)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1&localSandbox=1')
  await expect(page.locator('.action-board, [class*="ActionBoard"]').first())
    .toBeVisible({ timeout: 30_000 })
  return gameApiCalls
}

const addWoodToPlayerA = async (page: Page, amount: number) => {
  await page.locator('.dev-field', { hasText: '资源类型' }).getByRole('combobox').selectOption('wood')
  await page.locator('.dev-field', { hasText: '数量' }).getByRole('spinbutton').fill(String(amount))
  await page.getByRole('button', { name: '增加资源' }).click()
}

test.describe('browser-local sandbox', () => {
  test.skip(process.env.VITE_SANDBOX_EXECUTOR !== 'browser', 'run with VITE_SANDBOX_EXECUTOR=browser')

  test('boots locally with zero server calls and both seats visible', async ({ page }) => {
    const gameApiCalls = await seedAndOpen(page)
    // Debug viewer renders every seat — a single player drives all of them.
    await expect(page.locator('.farm-header', { hasText: '玩家 1' }).first()).toBeVisible()
    await expect(page.locator('.farm-header', { hasText: '玩家 2' }).first()).toBeVisible()
    expect(gameApiCalls, `unexpected server calls: ${gameApiCalls.join(', ')}`).toEqual([])
  })

  test('dev panel dispatches through the worker and IndexedDB resumes after reload', async ({ page }) => {
    await seedAndOpen(page)
    const playerAHeader = page.locator('.farm-header', { hasText: '玩家 1' }).first()

    // devSetResources through the local worker (adds to the first player's wood: 0 -> 88).
    await addWoodToPlayerA(page, 88)
    await expect(playerAHeader).toContainText('88')

    // Let the debounced saver flush to IndexedDB, then reload the same tab.
    await page.waitForTimeout(800)
    page.once('dialog', (d) => { void d.accept() }) // "continue previous game?"
    await page.reload()

    // The board comes back from the persisted snapshot with the wood intact.
    await expect(page.locator('.action-board, [class*="ActionBoard"]').first())
      .toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.farm-header', { hasText: '玩家 1' }).first()).toContainText('88')
  })

  test('renders admitted Workshop flow labels and completes its choice', async ({ page }) => {
    const config=structuredClone(CONFIG),errors:string[]=[]
    page.on('pageerror',error=>errors.push(error.message))
    config.cards[0]!.source=[
      "const CARD_ID='CUSTOM_E2ECard'",
      "const CARD_DEF=MinorImprovement({id:CARD_ID,name:'E2E Card'})",
      "const CARD_IMPL={listeners:[{actions:['collect'],phases:['after'],mandatory:true,handler:()=>({flow:{type:'xor',promptKey:'ui.interactionFlowSelect',children:[{type:'leaf',actionId:'gain',sourceCard:CARD_ID,params:{food:1},choiceLabelKey:'ui.interactionUseAbility',choiceLabelParams:{},effectPreview:{kind:'text',text:'Labeled Workshop branch'}},{type:'leaf',actionId:'gain',sourceCard:CARD_ID,params:{wood:1},choiceLabelKey:'actions.gain.name'}]}})}]}",
    ].join('\n')
    const calls=await seedAndOpen(page,config)
    await page.locator('.dev-field',{hasText:'卡牌 ID'}).getByRole('textbox').fill('CUSTOM_E2ECard')
    await page.getByRole('button',{name:'打出卡牌',exact:true}).click()
    await page.locator('[data-action-id="forest"] button').first().click()
    const option=page.getByRole('button',{name:/Labeled Workshop branch/})
    await expect(option).toContainText('使用能力');await option.click()
    await expect(option).toHaveCount(0);expect(errors).toEqual([]);expect(calls).toEqual([])
  })
  test('renders distinct merged Workshop choices and settles the selected reward once', async ({ page }) => {
    const config=structuredClone(CONFIG),errors:string[]=[]
    page.on('pageerror',error=>errors.push(error.message))
    config.cards[0]!.source=[
      "const CARD_ID='CUSTOM_E2ECard'",
      "const CARD_DEF=MinorImprovement({id:CARD_ID,name:'E2E Card'})",
      "const CARD_IMPL={effect:{resolveChoice:(_s,_p,v)=>v==='y'?gainLeaf(CARD_ID,{stone:2}):undefined},listeners:[{actions:['collect'],phases:['after'],mandatory:true,handler:()=>({flow:{type:'leaf',actionId:'emit-choice',sourceCard:CARD_ID,params:{requiresExplicitChoice:true,options:[{value:'base',labelKey:'ui.interactionUseAbility'}]}}})},{actions:['emit-choice'],phases:['computeArgs'],handler:()=>({extraOptions:[{value:'x',labelKey:'ui.interactionFlowDone'}]})},{actions:['emit-choice'],phases:['computeArgs'],handler:()=>({extraOptions:[{value:'y',labelKey:'actions.gain.name'}]})}]}",
    ].join('\n')
    const calls=await seedAndOpen(page,config)
    await page.locator('.dev-field',{hasText:'卡牌 ID'}).getByRole('textbox').fill('CUSTOM_E2ECard')
    await page.getByRole('button',{name:'打出卡牌',exact:true}).click()
    await page.locator('[data-action-id="forest"] button').first().click()
    const choices=page.locator('.interaction-bar')
    await expect(choices.getByRole('button',{name:'使用能力',exact:true})).toHaveCount(1)
    await expect(choices.getByRole('button',{name:'完成',exact:true})).toHaveCount(1)
    const gain=choices.getByRole('button',{name:'获得',exact:true})
    await expect(gain).toHaveCount(1);await gain.click();await expect(gain).toHaveCount(0)
    expect(errors).toEqual([]);expect(calls).toEqual([])
  })
  test('renders an admitted nested Workshop preview and completes its choice', async ({ page }) => {
    const config = structuredClone(CONFIG)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    config.cards[0]!.source = [
      "const CARD_ID='CUSTOM_E2ECard'",
      "const CARD_DEF=MinorImprovement({id:CARD_ID,name:'E2E Card'})",
      `const CARD_IMPL={listeners:[{actions:['collect'],phases:['after'],mandatory:true,handler:()=>({flow:{type:'leaf',actionId:'emit-choice',params:{requiresExplicitChoice:true,options:[{value:'yes',labelKey:'ui.yes',descriptionPreview:{kind:'group',separator:' / ',parts:[{kind:'action',labelKey:'ui.yes',showLabel:false,effectPreview:{kind:'futureSchedule',entries:[{round:2,resources:{food:1}}]}},{kind:'action',labelKey:'ui.yes',showLabel:false,effectPreview:{kind:'text',text:'Workshop preview'}}]}},{value:'no',labelKey:'ui.no'}]}}})}],effect:{resolveChoice:(_s,_p,choice)=>choice==='yes'?gainLeaf(CARD_ID,{food:1}):undefined}}`,
    ].join('\n')
    const calls = await seedAndOpen(page, config)
    await page.locator('.dev-field', { hasText: '卡牌 ID' }).getByRole('textbox').fill('CUSTOM_E2ECard')
    await page.getByRole('button', { name: '打出卡牌', exact: true }).click()
    await page.locator('[data-action-id="forest"] button').first().click()
    await expect(page.locator('.interaction-future-schedule')).toBeVisible()
    await expect(page.locator('.interaction-future-schedule')).toContainText('第 2 回合')
    await page.getByRole('button').filter({ has: page.locator('.interaction-future-schedule') }).click()
    await expect(page.locator('.interaction-future-schedule')).toHaveCount(0)
    expect(errors).toEqual([])
    expect(calls).toEqual([])
  })
})
