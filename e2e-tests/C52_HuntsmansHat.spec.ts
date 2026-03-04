import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

const OUTPUT_DIR = path.resolve(process.cwd(), 'output')
const API_BASE = process.env.BACKEND_URL ?? 'http://localhost:5175'
const FRONTEND_BASE = process.env.FRONTEND_URL ?? 'http://localhost:5173'
const CARD_ID = 'C52_HuntsmansHat'

test.use({ viewport: { width: 1920, height: 1080 } })

const saveState = (name: string, state: unknown) => {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const filePath = path.join(OUTPUT_DIR, name)
  writeFileSync(filePath, JSON.stringify(state, null, 2))
  return filePath
}

const postJson = async (request: any, url: string, body?: unknown) => {
  const resp = await request.post(url, body ? { data: body } : undefined)
  const json = await resp.json()
  return json
}

const getJson = async (request: any, url: string) => {
  const resp = await request.get(url)
  const json = await resp.json()
  return json
}

test('C52_HuntsmansHat pig-market grants food per boar', async ({ page, request }) => {
  const newResp = await postJson(request, `${API_BASE}/api/game/new`)
  saveState('c52-huntsmans-hat-r9-01-new.json', newResp.state)
  await page.goto(`${FRONTEND_BASE}/?player=p1`)
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'c52-huntsmans-hat-r9-01-new.png'),
    fullPage: true,
  })

  const devToggle = page.locator('header .dev-toggle input[type="checkbox"]')
  if (await devToggle.isVisible()) {
    if (!(await devToggle.isChecked())) {
      await devToggle.check()
    }
  }
  await expect(page.locator('.dev-panel')).toBeVisible()

  const roundRow = page.locator('.dev-panel .dev-row').filter({
    has: page.locator('input[type="number"][min="1"][max="14"]'),
  })
  const roundInput = roundRow.locator('input[type="number"]').first()
  const roundButton = roundRow.locator('button.dev-apply').first()
  await roundInput.fill('9')
  await roundButton.click()

  const afterRoundResp = await getJson(request, `${API_BASE}/api/game/state`)
  saveState('c52-huntsmans-hat-r9-02-round9.json', afterRoundResp.state)
  await page.reload()
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'c52-huntsmans-hat-r9-02-round9.png'),
    fullPage: true,
  })

  for (let i = 0; i < 4; i += 1) {
    const stateResp = await getJson(request, `${API_BASE}/api/game/state`)
    saveState(`c52-huntsmans-hat-r9-03-${String(i).padStart(2, '0')}-before.json`, stateResp.state)

    const playerIndex = stateResp.state.currentPlayerIndex
    const actionsResp = await getJson(request, `${API_BASE}/api/game/actions?playerIndex=${playerIndex}`)
    saveState(`c52-huntsmans-hat-r9-04-${String(i).padStart(2, '0')}-actions.json`, actionsResp)
    const available = (actionsResp.actions ?? []).map((a: any) => a.spaceId)
    const preferred = ['forest', 'copse', 'clay-pit', 'reed-bank', 'fishing', 'day-laborer', 'grove']
    const chosen = preferred.find((id) => available.includes(id)) ?? available[0]

    const actionResp = await postJson(request, `${API_BASE}/api/game/action`, { playerIndex, spaceId: chosen })
    saveState(`c52-huntsmans-hat-r9-05-${String(i).padStart(2, '0')}-action-${chosen}.json`, actionResp.state)
    await page.reload()
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `c52-huntsmans-hat-r9-03-${String(i).padStart(2, '0')}-action.png`),
      fullPage: true,
    })

    if (actionResp.pending?.type === 'confirmNextPlayer') {
      const nextResp = await postJson(request, `${API_BASE}/api/game/next-player`)
      saveState(`c52-huntsmans-hat-r9-06-${String(i).padStart(2, '0')}-next.json`, nextResp.state)
      await page.reload()
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `c52-huntsmans-hat-r9-04-${String(i).padStart(2, '0')}-next.png`),
        fullPage: true,
      })
    }
  }

  const roundEndResp = await postJson(request, `${API_BASE}/api/game/round-end`)
  saveState('c52-huntsmans-hat-r9-07-round-end.json', roundEndResp.state)
  await page.reload()
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'c52-huntsmans-hat-r9-05-round-end.png'),
    fullPage: true,
  })

  const playRow = page.locator('.dev-panel .dev-row').filter({
    has: page.locator('input[type="text"]'),
  })
  const cardInput = playRow.locator('input[type="text"]').first()
  const playButton = playRow.locator('button.dev-apply').first()
  await cardInput.fill(CARD_ID)
  await playButton.click()
  const afterPlayResp = await getJson(request, `${API_BASE}/api/game/state`)
  saveState('c52-huntsmans-hat-r9-08-play-card.json', afterPlayResp.state)
  await page.reload()
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'c52-huntsmans-hat-r9-06-play-card.png'),
    fullPage: true,
  })

  const stateBeforePig = await getJson(request, `${API_BASE}/api/game/state`)
  saveState('c52-huntsmans-hat-r9-09-before-pig-market.json', stateBeforePig.state)
  const pigPlayerIndex = stateBeforePig.state.currentPlayerIndex
  const pigActionResp = await postJson(request, `${API_BASE}/api/game/action`, { playerIndex: pigPlayerIndex, spaceId: 'pig-market' })
  saveState('c52-huntsmans-hat-r9-10-pig-market.json', pigActionResp.state)
  await page.reload()
  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'c52-huntsmans-hat-r9-07-pig-market.png'),
    fullPage: true,
  })

  const logEntries = pigActionResp.state.log
  const hasCardLog = logEntries.some((entry: any) =>
    entry.key === 'log.cardEffectGain' &&
    entry.params?.cardId === CARD_ID &&
    entry.params?.gain?.includes('FOOD')
  )
  expect(hasCardLog).toBe(true)
})
