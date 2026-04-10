import type { Page, APIRequestContext } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

// ── URL constants ────────────────────────────────────────────────────────────

export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:5175'
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'

// ── Output directory ─────────────────────────────────────────────────────────

const OUTPUT_DIR = path.resolve(process.cwd(), 'output/playwright')

function ensureOutputDir(dir = OUTPUT_DIR) {
  mkdirSync(dir, { recursive: true })
}

// ── API helpers ──────────────────────────────────────────────────────────────

export async function postJson(
  request: APIRequestContext,
  url: string,
  body?: unknown,
  token?: string,
) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const resp = await request.post(url, {
    ...(body !== undefined ? { data: body } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  })
  return resp.json()
}

export async function getJson(request: APIRequestContext, url: string) {
  const resp = await request.get(url)
  return resp.json()
}

// ── Dev panel helpers ────────────────────────────────────────────────────────

export async function giveResource(page: Page, resource: string, amount: number) {
  const devSection = page.locator('.dev-panel .dev-section')
  const firstRow = devSection.locator('.dev-row').first()
  const resourceSelect = firstRow.locator('select')
  await resourceSelect.selectOption({ value: resource })
  const amountInput = firstRow.locator('input[type="number"]')
  await amountInput.fill(String(amount))
  const applyBtn = firstRow.locator('button')
  await applyBtn.click()
  await page.waitForTimeout(300)
}

export async function advanceRound(page: Page, targetRound: number) {
  const devSection = page.locator('.dev-panel .dev-section')
  const roundRow = devSection.locator('.dev-row').nth(1)
  const roundInput = roundRow.locator('input[type="number"]')
  await roundInput.fill(String(targetRound))
  const advanceBtn = roundRow.locator('button')
  await advanceBtn.click()
  await page.waitForTimeout(500)
}

// ── Output helpers ───────────────────────────────────────────────────────────

export async function saveScreenshot(page: Page, name: string, dir = OUTPUT_DIR) {
  ensureOutputDir(dir)
  const filePath = path.join(dir, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`[Screenshot] ${name}`)
}

export function saveState(name: string, data: unknown, dir = OUTPUT_DIR) {
  ensureOutputDir(dir)
  const filePath = path.join(dir, name.endsWith('.json') ? name : `${name}.json`)
  writeFileSync(filePath, JSON.stringify(data, null, 2))
  return filePath
}
