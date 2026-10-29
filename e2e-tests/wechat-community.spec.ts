import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvas } from 'canvas'
import { expect, test } from '@playwright/test'
import { BACKEND_URL } from './fixtures'

const communities = [
  { platform: 'wechat', label: 'WeChat player group', title: 'Join the WeChat player group', image: 'WeChat player group QR code', flag: '--wechat-qr', filename: 'wechat-qr', endpoint: '/api/community/wechat-qr' },
  { platform: 'feishu', label: 'Feishu player group', title: 'Join the Feishu player group', image: 'Feishu player group QR code', flag: '--feishu-qr', filename: 'feishu-qr', endpoint: '/api/community/feishu-qr' },
]

function communityDirectory() {
  if (!process.env.SHARED_DATA_DIR || !process.env.DATABASE_SCHEMA?.startsWith('test_')) {
    throw new Error('Run through pnpm verify to use an isolated community directory')
  }
  return process.env.COMMUNITY_DATA_DIR ?? join(process.env.SHARED_DATA_DIR, 'community')
}

for (const community of communities) {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test.describe(`${community.platform} ${viewport.width}px`, () => {
      test.use({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 })
      test('opens beside GitHub and refreshes its own image without restarting', async ({ page, request }, testInfo) => {
        const directory = communityDirectory()
        const canvas = createCanvas(600, 600)
        const context = canvas.getContext('2d')
        context.fillStyle = '#fff'
        context.fillRect(0, 0, 600, 600)
        context.fillStyle = '#000'
        context.fillText('TEST IMAGE A', 30, 50)
        const first = testInfo.outputPath('test-image-a.png')
        writeFileSync(first, canvas.toBuffer('image/png'))
        const original = (community.platform === 'wechat' ? process.env.WECHAT_QR_ACCEPTANCE_IMAGE : process.env.FEISHU_QR_ACCEPTANCE_IMAGE) ?? first
        context.fillStyle = '#0b8'
        context.fillRect(50, 50, 400, 400)
        context.fillStyle = '#000'
        context.fillText('TEST IMAGE B', 30, 30)
        const replacement = testInfo.outputPath('test-image-b.png')
        writeFileSync(replacement, canvas.toBuffer('image/png'))
        const update = (path: string) => execFileSync('bash', ['deploy-operations.sh', community.flag, '--local', path, directory])
        update(original)
        await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
        await page.goto('/?page=login&bg=none')
        await expect(page.locator('.login-page')).toBeVisible()
        const trigger = page.getByRole('button', { name: community.label, exact: true })
        const github = page.locator('.site-community-links .github-repo-link').first()
        await expect(trigger).toBeVisible()
        const gitBox = await github.boundingBox(), groupBox = await trigger.boundingBox()
        if (!gitBox || !groupBox) throw new Error('Missing header icons')
        expect(groupBox.x).toBeGreaterThanOrEqual(gitBox.x + gitBox.width)
        expect(Math.abs(groupBox.y - gitBox.y)).toBeLessThan(2)
        expect(groupBox.x + groupBox.width).toBeLessThanOrEqual(viewport.width)
        const dialog = page.getByRole('dialog', { name: community.title })
        const open = async (expected: string) => {
          const responsePromise = page.waitForResponse(response => response.url().includes(`${community.endpoint}?`))
          await trigger.click()
          const response = await responsePromise
          expect(response.status()).toBe(200)
          expect(response.headers()['cache-control']).toBe('no-store')
          expect(await response.body()).toEqual(readFileSync(expected))
          await expect(dialog.getByRole('img', { name: community.image })).toBeVisible()
          const bounds = await dialog.boundingBox()
          if (!bounds) throw new Error('Missing dialog')
          expect(bounds.x).toBeGreaterThanOrEqual(0)
          expect(bounds.y).toBeGreaterThanOrEqual(0)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
          expect(await dialog.getByRole('img').evaluate(element => element instanceof HTMLImageElement && element.naturalWidth >= 200)).toBe(true)
        }
        await open(original)
        await page.screenshot({ path: testInfo.outputPath(`${community.platform}-group.png`), fullPage: true })
        const close = dialog.getByRole('button', { name: 'Close', exact: true })
        await expect(close).toBeFocused()
        await page.keyboard.press('Tab')
        expect(await page.locator('.login-page').evaluate(element => element.contains(document.activeElement))).toBe(false)
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
        await expect(trigger).toBeFocused()
        update(replacement)
        await open(replacement)
        await close.click()
        rmSync(join(directory, community.filename))
        await trigger.click()
        await expect(dialog.getByRole('status')).toContainText('The group QR code is unavailable.')
        update(original)
        await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
        await expect(dialog.getByRole('img', { name: community.image })).toBeVisible()
        expect((await request.get(`${BACKEND_URL}/api/health`)).ok()).toBe(true)
      })
    })
  }
}

test.describe('shared headers on touch devices', () => {
  test.use({ hasTouch: true, isMobile: true })
  test('keeps both groups visible in the lobby and game on a narrow phone and short landscape', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    for (const url of ['/?player=p1&devMode=1&bg=none', '/?page=game&transport=ws&room=dev2&player=p1&devMode=1&bg=none']) {
      for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport)
        await page.goto(url)
        await expect(page.locator(url.includes('page=game') ? '.header-compact' : '.lobby-header')).toBeVisible()
        for (const community of communities) {
          const trigger = page.getByRole('button', { name: community.label, exact: true })
          await expect(trigger).toBeVisible()
          const buttonBounds = await trigger.boundingBox()
          if (!buttonBounds) throw new Error('Missing group button')
          expect(buttonBounds.x).toBeGreaterThanOrEqual(0)
          expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(viewport.width)
          await trigger.click()
          const dialog = page.getByRole('dialog', { name: community.title })
          await expect(dialog).toBeVisible()
          const bounds = await dialog.boundingBox()
          if (!bounds) throw new Error('Missing dialog')
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
          await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        }
      }
    }
  })
})

test('Chinese labels identify each group correctly', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
  await page.goto('/?page=login&bg=none')
  for (const name of ['微信', '飞书']) {
    await page.getByRole('button', { name: `${name}玩家群`, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `加入${name}玩家群` })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  }
})
