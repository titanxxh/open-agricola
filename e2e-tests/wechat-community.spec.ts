import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvas } from 'canvas'
import { expect, test } from '@playwright/test'
import { BACKEND_URL } from './fixtures'

const translations = {
  en: { label: 'WeChat player group', title: 'Join the WeChat player group', image: 'WeChat player group QR code', close: 'Close', retry: 'Retry', unavailable: 'The group QR code is unavailable.' },
  zh: { label: '微信玩家群', title: '加入微信玩家群', image: '微信玩家群二维码', close: '关闭', retry: '重试', unavailable: '群二维码暂不可用' },
}

function communityDirectory() {
  if (!process.env.SHARED_DATA_DIR || !process.env.DATABASE_SCHEMA?.startsWith('test_')) {
    throw new Error('Run through pnpm verify to use an isolated community directory')
  }
  return process.env.COMMUNITY_DATA_DIR ?? join(process.env.SHARED_DATA_DIR, 'community')
}

for (const locale of ['en', 'zh'] as const) {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test.describe(`${locale} ${viewport.width}px`, () => {
      test.use({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 })
      test('opens beside GitHub and refreshes the image through the maintenance script without restarting', async ({ page, request }, testInfo) => {
        const copy = translations[locale]
        const directory = communityDirectory()
        const canvas = createCanvas(600, 600)
        const context = canvas.getContext('2d')
        context.fillStyle = '#fff'
        context.fillRect(0, 0, 600, 600)
        context.fillStyle = '#000'
        context.fillText('TEST IMAGE A', 30, 50)
        const first = testInfo.outputPath('test-image-a.png')
        writeFileSync(first, canvas.toBuffer('image/png'))
        const original = process.env.WECHAT_QR_ACCEPTANCE_IMAGE ?? first
        context.fillStyle = '#0b8'
        context.fillRect(50, 50, 400, 400)
        context.fillStyle = '#000'
        context.fillText('TEST IMAGE B', 30, 30)
        const replacement = testInfo.outputPath('test-image-b.png')
        writeFileSync(replacement, canvas.toBuffer('image/png'))
        const update = (path: string) => execFileSync('bash', ['deploy-operations.sh', '--wechat-qr', '--local', path, directory])
        update(original)
        await page.addInitScript(value => localStorage.setItem('open-agricola-locale-v2', value), locale)
        await page.goto('/?page=login&bg=none')
        await expect(page.locator('.login-page')).toBeVisible()
        const trigger = page.getByRole('button', { name: copy.label, exact: true })
        const github = page.locator('.site-community-links .github-repo-link').first()
        await expect(trigger).toBeVisible()
        const gitBox = await github.boundingBox(), wechatBox = await trigger.boundingBox()
        if (!gitBox || !wechatBox) throw new Error('Missing header icons')
        expect(wechatBox.x).toBeGreaterThanOrEqual(gitBox.x + gitBox.width)
        expect(Math.abs(wechatBox.y - gitBox.y)).toBeLessThan(2)
        const dialog = page.getByRole('dialog', { name: copy.title })
        const open = async (expected: string) => {
          const responsePromise = page.waitForResponse(response => response.url().includes('/api/community/wechat-qr?'))
          await trigger.click()
          const response = await responsePromise
          expect(response.status()).toBe(200)
          expect(response.headers()['cache-control']).toBe('no-store')
          expect(await response.body()).toEqual(readFileSync(expected))
          await expect(dialog.getByRole('img', { name: copy.image })).toBeVisible()
          const bounds = await dialog.boundingBox()
          if (!bounds) throw new Error('Missing dialog')
          expect(bounds.x).toBeGreaterThanOrEqual(0)
          expect(bounds.y).toBeGreaterThanOrEqual(0)
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
          expect(await dialog.getByRole('img').evaluate(element => element instanceof HTMLImageElement && element.naturalWidth >= 200)).toBe(true)
        }
        await open(original)
        await page.screenshot({ path: testInfo.outputPath('wechat-group.png'), fullPage: true })
        const close = dialog.getByRole('button', { name: copy.close, exact: true })
        await expect(close).toBeFocused()
        await page.keyboard.press('Tab')
        expect(await page.locator('.login-page').evaluate(element => element.contains(document.activeElement))).toBe(false)
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
        await expect(trigger).toBeFocused()
        update(replacement)
        await open(replacement)
        await close.click()
        rmSync(join(directory, 'wechat-qr'))
        await trigger.click()
        await expect(dialog.getByRole('status')).toContainText(copy.unavailable)
        update(original)
        await dialog.getByRole('button', { name: copy.retry, exact: true }).click()
        await expect(dialog.getByRole('img', { name: copy.image })).toBeVisible()
        expect((await request.get(`${BACKEND_URL}/api/health`)).ok()).toBe(true)
      })
    })
  }
}

test('shared links remain visible in the lobby and game header on a narrow phone and short landscape', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  for (const url of ['/?player=p1&devMode=1&bg=none', '/?page=game&transport=ws&room=dev2&player=p1&devMode=1&bg=none']) {
    for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport)
      await page.goto(url)
      await expect(page.locator(url.includes('page=game') ? '.header-compact' : '.lobby-header')).toBeVisible()
      const trigger = page.getByRole('button', { name: translations.en.label, exact: true })
      await expect(trigger).toBeVisible()
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: translations.en.title })
      await expect(dialog).toBeVisible()
      const bounds = await dialog.boundingBox()
      if (!bounds) throw new Error('Missing dialog')
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
      await dialog.getByRole('button', { name: translations.en.close, exact: true }).click()
    }
  }
})
