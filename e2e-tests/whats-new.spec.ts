import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'

function communityDirectory() {
  if (!process.env.SHARED_DATA_DIR || !process.env.DATABASE_SCHEMA?.startsWith('test_')) {
    throw new Error('Run through pnpm verify to use an isolated community directory')
  }
  return process.env.COMMUNITY_DATA_DIR ?? join(process.env.SHARED_DATA_DIR, 'community')
}

const release = (patch: number) => ({
  version: `v0.12.${patch}`,
  date: `2026-11-${String(patch + 1).padStart(2, '0')}`,
  items: patch === 3
    ? [{ zh: '只写了中文的条目' }]
    : [{ zh: `第 ${patch} 版新功能`, en: `Feature from release ${patch}` }, { zh: `第 ${patch} 版修复`, en: `Fix from release ${patch}` }],
})
const releasesUpTo = (latest: number) => Array.from({ length: latest + 1 }, (_, index) => release(latest - index))

function publish(testInfo: TestInfo, latest: number) {
  const path = testInfo.outputPath(`whats-new-${latest}.json`)
  writeFileSync(path, JSON.stringify({ releases: releasesUpTo(latest) }, null, 2))
  execFileSync('bash', ['deploy-operations.sh', '--whats-new', '--local', path, communityDirectory()])
}

/** Header buttons may sit below the fold on phones; only horizontal overflow is a layout fault. */
async function expectHorizontallyWithin(page: Page, locator: Locator) {
  const bounds = await locator.boundingBox()
  const viewport = page.viewportSize()
  if (!bounds || !viewport) throw new Error('Missing bounds')
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
}

async function expectWithin(page: Page, locator: Locator) {
  const bounds = await locator.boundingBox()
  const viewport = page.viewportSize()
  if (!bounds || !viewport) throw new Error('Missing bounds')
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
}

test.afterEach(() => rmSync(join(communityDirectory(), 'whats-new.json'), { force: true }))

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 })
    test('lists the newest five releases and clears the unread dot once read, following host updates', async ({ page }, testInfo) => {
      publish(testInfo, 5)
      await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
      await page.goto('/?page=login&bg=none')
      await expect(page.locator('.login-page')).toBeVisible()
      const unread = page.getByRole('button', { name: "What's new (unread updates)", exact: true })
      const read = page.getByRole('button', { name: "What's new", exact: true })
      await expect(unread).toBeVisible()
      await expect(unread.locator('.whats-new-button__dot')).toBeVisible()
      const feishu = await page.getByRole('button', { name: 'Feishu player group', exact: true }).boundingBox()
      const own = await unread.boundingBox()
      if (!feishu || !own) throw new Error('Missing header icons')
      expect(own.x).toBeGreaterThanOrEqual(feishu.x + feishu.width)
      expect(Math.abs(own.y - feishu.y)).toBeLessThan(2)
      await expectHorizontallyWithin(page, unread)

      await unread.click()
      const dialog = page.getByRole('dialog', { name: "What's new" })
      await expect(dialog).toBeVisible()
      await expectWithin(page, dialog)
      await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
      const releases = dialog.locator('.whats-new-dialog__releases > li')
      await expect(releases).toHaveCount(5)
      await expect(releases.locator('h3 > span:first-child')).toHaveText(['v0.12.5', 'v0.12.4', 'v0.12.3', 'v0.12.2', 'v0.12.1'])
      await expect(releases.nth(0).locator('time')).toHaveAttribute('datetime', '2026-11-06')
      await expect(releases.nth(0).locator('time')).toHaveText('Nov 6, 2026')
      await expect(releases.nth(0).getByRole('listitem')).toHaveText(['Feature from release 5', 'Fix from release 5'])
      await expect(releases.nth(2).getByRole('listitem')).toHaveText(['只写了中文的条目'])
      await expect(dialog.locator('.whats-new-dialog__badge')).toHaveCount(1)
      await expect(releases.nth(0).locator('.whats-new-dialog__badge')).toHaveText('New')
      await page.screenshot({ path: testInfo.outputPath('whats-new.png'), fullPage: true })
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(read).toBeFocused()
      await expect(read.locator('.whats-new-button__dot')).toHaveCount(0)

      await page.reload()
      await expect(read).toBeVisible()
      await expect(unread).toHaveCount(0)

      publish(testInfo, 7)
      await page.reload()
      await unread.click()
      await expect(releases.locator('h3 > span:first-child')).toHaveText(['v0.12.7', 'v0.12.6', 'v0.12.5', 'v0.12.4', 'v0.12.3'])
      await expect(dialog.locator('.whats-new-dialog__badge')).toHaveCount(2)
      await expect(releases.nth(1).locator('.whats-new-dialog__badge')).toBeVisible()
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(dialog).not.toBeVisible()

      rmSync(join(communityDirectory(), 'whats-new.json'))
      await page.reload()
      await expect(page.getByRole('button', { name: 'Feishu player group', exact: true })).toBeVisible()
      await expect(page.locator('.whats-new-button')).toHaveCount(0)
    })
  })
}

test('uses Chinese labels, dates and notes', async ({ page }, testInfo) => {
  publish(testInfo, 2)
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
  await page.goto('/?page=login&bg=none')
  await page.getByRole('button', { name: '更新内容（有新内容）', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '更新内容' })
  const newest = dialog.locator('.whats-new-dialog__releases > li').first()
  await expect(newest.locator('time')).toHaveText('2026年11月3日')
  await expect(newest.getByRole('listitem')).toHaveText(['第 2 版新功能', '第 2 版修复'])
  await expect(newest.locator('.whats-new-dialog__badge')).toHaveText('新')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('button', { name: '更新内容', exact: true })).toBeVisible()
})

test.describe('shared headers on touch devices', () => {
  test.use({ hasTouch: true, isMobile: true })
  test('fits the lobby header on phones and stays out of the crowded phone game header', async ({ page }, testInfo) => {
    publish(testInfo, 5)
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    const pages = [['/?player=p1&devMode=1&bg=none', '.lobby-header'], ['/?page=game&transport=ws&room=dev2&player=p1&devMode=1&bg=none', '.header-compact']]
    for (const [url, header] of pages) {
      for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
        await test.step(`${header} at ${viewport.width}x${viewport.height}`, async () => {
          await page.setViewportSize(viewport)
          await page.goto(url)
          await expect(page.locator(header)).toBeVisible()
          const trigger = page.locator(`${header} .whats-new-button`)
          const feishu = page.locator(header).getByRole('button', { name: 'Feishu player group', exact: true })
          await expect(feishu).toBeVisible()
          if (header === '.header-compact' && viewport.width <= 480) {
            await expect(trigger).toBeHidden()
            return
          }
          await expect(trigger).toBeVisible()
          await expectHorizontallyWithin(page, trigger)
          await trigger.click()
          const dialog = page.getByRole('dialog', { name: "What's new" })
          await expect(dialog).toBeVisible()
          await expectWithin(page, dialog)
          await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        })
      }
    }
  })
})
