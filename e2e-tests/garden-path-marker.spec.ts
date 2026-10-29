import assert from 'node:assert/strict'
import { expect, test } from '@playwright/test'
import type { GameSession } from '../server/game/authoritative-session'
import { emptyResources } from '../shared/contract/state-constants'
import { serializeState } from '../shared/session/serialization'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { confirmNext, getChoiceOptions } from '../server/__tests__/_helpers/session-assertions'
import { BACKEND_URL } from './fixtures'

const CARD_ID = 'M027_GardenPath'
const purchase = (session: GameSession, actor: number, space: 'meeting-place' | 'major-improvement') => {
  let response = session.takeAction(actor, space)
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.request.kind === 'confirm-next-player') return confirmNext(session, response)
    const options = getChoiceOptions(response)
    const option = response.interaction.promptKey === 'prompt.selectPayment' ? options[0]
      : options.find(option => option.value.startsWith('action-improvement-'))
        ?? options.find(option => option.value === CARD_ID)
    assert.ok(option, JSON.stringify(response.interaction))
    response = session.resolveChoice(actor, option.value)
    expect(response.ok, response.error).toBe(true)
  }
  throw new Error(`Purchase did not finish: ${JSON.stringify(response.interaction)}`)
}

for (const locale of ['en']) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const mobile = viewport.width === 390
    test.describe(`Garden Path ${locale} at ${viewport.width}px`, () => {
      test.use({ viewport, hasTouch: mobile })
      test('shows localized rules and moves the public token to its new holder', async ({ page, request }) => {
        const session = createWorkSession({
          seed: 411,
          options: { playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true },
          configure: state => {
            for (const [index, player] of state.players.entries()) {
              player.resources = { ...emptyResources, clay: 2, food: 20, fuel: 10, horse: 0 }
              player.minorHand = index === 0 ? [CARD_ID] : ['__test_placeholder__']
              player.occupationHand = ['__test_placeholder__']
              player.farmTerrain = [{ row: 0, col: 1, kind: 'forest' }]
            }
          },
        })
        try {
          const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
            data: { seed: 411, playerCount: 2, customCardIds: [], enableFarmersOfTheMoor: true,
              allowIncompleteFarmersOfTheMoorMinorDeal: true },
          })
          expect(fresh.ok(), await fresh.text()).toBe(true)
          const publish = async () => {
            const loaded = await request.post(`${BACKEND_URL}/api/game/load`, {
              data: { state: session.withCtx(() => serializeState(session.state, { actionHooks: session.actionHooks })) },
            })
            expect(loaded.ok(), await loaded.text()).toBe(true)
          }
          purchase(session, 0, 'meeting-place')
          await publish()
          await page.addInitScript(value => localStorage.setItem('open-agricola-locale-v2', value), locale)
          await page.goto('/?page=game&player=p2&embedded=1&devMode=1')
          await expect(page.locator('.game-layout')).toBeVisible()
          const label = 'Garden Path'
          const marker = page.getByTestId(`public-card-marker-${CARD_ID}-garden-path`)
          await expect(marker).toHaveText(`${label}-1`)
          await expect(marker).toHaveAttribute('title', `${label} -1`)
          await marker.scrollIntoViewIfNeeded()
          await expect(marker).toBeInViewport({ ratio: 1 })
          await page.locator('[data-player-resource-anchor="p2"]').screenshot({
            path: `output/playwright/m027-marker-${locale}-${viewport.width}.png`,
          })

          const handCard = page.locator(`.hand-cards [data-card-anchor="${CARD_ID}"]`).first()
          if (mobile) await handCard.tap()
          else await handCard.hover()
          const details = mobile ? page.getByRole('dialog') : page.locator('.card-hover-preview')
          await expect(details).toBeVisible()
          const rules = details.locator('.card-rules')
          await expect(rules).toContainText('There is only one token')
          await expect(rules).toContainText('The previous holder no longer has it.')
          await rules.scrollIntoViewIfNeeded()
          await details.screenshot({ path: `output/playwright/m027-rules-${locale}-${viewport.width}.png` })
          if (mobile) await details.getByRole('button', { name: 'Close', exact: true }).tap()
          else await page.mouse.move(0, 0)
          await expect(details).toBeHidden()

          purchase(session, 1, 'major-improvement')
          await publish()
          await page.reload()
          const previousHolder = page.locator('[data-player-resource-anchor="p2"]')
          const currentHolder = page.locator('[data-player-resource-anchor="p1"]')
          await expect(previousHolder).toBeVisible()
          await expect(previousHolder.getByTestId(`public-card-marker-${CARD_ID}-garden-path`)).toHaveCount(0)
          await expect(currentHolder).toBeVisible()
          await expect(currentHolder.getByTestId(`public-card-marker-${CARD_ID}-garden-path`)).toHaveText(`${label}-1`)
          await expect(page.locator('.public-card-marker')).toHaveCount(1)
          await currentHolder.screenshot({ path: `output/playwright/m027-transferred-${locale}-${viewport.width}.png` })
        } finally { session.dispose() }
      })
    })
  }
}
