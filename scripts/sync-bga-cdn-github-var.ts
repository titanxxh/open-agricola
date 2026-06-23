/**
 * 从 BGA gametables 扫多桌，推导 BGA_CDN_BASE_URL。
 *
 * - `-p` / `--probe-only`：只打印探测结果，不写 GitHub。
 * - 不带 `-p`：抓取后与仓库变量 `BGA_CDN_BASE_URL` 比较，不一致则 `gh variable set`（需 gh + token）。
 *
 * 可选：`--dry-run`（仅在不带 -p 时生效）、`--repo owner/name`。
 * 环境变量 `BGA_STORAGE_STATE`：Playwright 登录态 JSON（遇 BGA 登录页时）。
 *
 *   npx tsx scripts/sync-bga-cdn-github-var.ts -p
 *   npx tsx scripts/sync-bga-cdn-github-var.ts
 *   npx tsx scripts/sync-bga-cdn-github-var.ts --dry-run --repo owner/repo
 */

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page, type Response } from 'playwright'

const VAR_NAME = 'BGA_CDN_BASE_URL'

const DEFAULT_TABLE_WAIT_MS = 10_000
const TABLE_GOTO_TIMEOUT_MS = 90_000
const CDN_ASSET_WAIT_PER_TABLE_MS = 75_000
const GAME_AREA_WAIT_MS = 90_000
const DEFAULT_MAX_TABLES = 15

const BGA_ORIGIN = 'https://en.boardgamearena.com'
const BGA_AGRICOLA_TABLES_URL = `${BGA_ORIGIN}/gametables?game=agricola`
const BGA_CDN_ORIGIN = 'https://x.boardgamearena.net'

const AGRICOLA_CDN_IMG_FILE_RE =
  /\/games\/agricola\/[^/]+\/img\/[^/?#]+\.(png|webp|jpe?g|gif|svg|ico)(\?|#|$)/i
const AGRICOLA_CDN_CSS_FILE_RE =
  /\/games\/agricola\/(\d{6}-\d{4})\/agricola\.css(\?|#|$)/i
const AGRICOLA_VERSION_RE = /\d{6}-\d{4}/

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function looksLikeMeeplesAssetUrl(url: string): boolean {
  const u = url.toLowerCase()
  return u.includes('meeples.png') || u.includes('meeples.webp')
}

function looksLikeAgricolaCdnImgFileUrl(url: string): boolean {
  return AGRICOLA_CDN_IMG_FILE_RE.test(url)
}

function looksLikeAgricolaCdnCssFileUrl(url: string): boolean {
  return AGRICOLA_CDN_CSS_FILE_RE.test(url)
}

function repoRoot(): string {
  return path.resolve(__dirname, '..')
}

function loadGhTokenFromDotenv(): void {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return
  const envPath = path.join(repoRoot(), '.env')
  if (!fs.existsSync(envPath)) return
  let text: string
  try {
    text = fs.readFileSync(envPath, 'utf-8')
  } catch {
    return
  }
  let ghVal: string | undefined
  let githubVal: string | undefined
  for (const raw of text.split('\n')) {
    let line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('export ')) line = line.slice(7).trim()
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (val.length >= 2 && val[0] === val.at(-1) && (val[0] === '"' || val[0] === "'")) {
      val = val.slice(1, -1)
    }
    if (key === 'GH_TOKEN' && val) ghVal = val
    else if (key === 'GITHUB_TOKEN' && val) githubVal = val
  }
  if (ghVal) process.env.GH_TOKEN = ghVal
  else if (githubVal) process.env.GITHUB_TOKEN = githubVal
}

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function normalizeEmbeddedText(text: string): string {
  return text.replace(/\\\//g, '/').replace(/&amp;/g, '&')
}

export function baseUrlFromAgricolaVersion(version: string): string | null {
  if (!AGRICOLA_VERSION_RE.test(version)) return null
  return `${BGA_CDN_ORIGIN}/data/themereleases/current/games/agricola/${version}/img`
}

export function baseUrlFromKnownAgricolaAsset(fullUrl: string): string | null {
  let u: URL
  try {
    u = new URL(normalizeEmbeddedText(fullUrl.trim()))
  } catch {
    return null
  }

  if (AGRICOLA_CDN_IMG_FILE_RE.test(u.pathname)) {
    u.pathname = u.pathname.replace(/\/[^/]+$/, '')
    u.search = ''
    u.hash = ''
    return normalizeBase(u.toString())
  }

  const css = u.pathname.match(AGRICOLA_CDN_CSS_FILE_RE)
  if (css) {
    u.pathname = u.pathname.replace(/\/agricola\.css$/i, '/img')
    u.search = ''
    u.hash = ''
    return normalizeBase(u.toString())
  }

  return null
}

export function extractAgricolaCdnBasesFromText(text: string): string[] {
  const normalized = normalizeEmbeddedText(text)
  const candidates: string[] = []
  const assetRe =
    /https?:\/\/[^\s"'<>]+\/games\/agricola\/\d{6}-\d{4}\/(?:agricola\.css|img\/[^\s"'<>]+)/gi
  for (const m of normalized.matchAll(assetRe)) {
    const base = baseUrlFromKnownAgricolaAsset(m[0])
    if (base) candidates.push(base)
  }

  const versionRe = /"name"\s*:\s*"agricola"[\s\S]{0,800}?"version"\s*:\s*"(\d{6}-\d{4})"/gi
  for (const m of normalized.matchAll(versionRe)) {
    const base = baseUrlFromAgricolaVersion(m[1])
    if (base) candidates.push(base)
  }

  return dedupeBasesPreserveOrder(candidates)
}

function tableIdFromHref(href: string): string | null {
  const m = href.match(/[?&]table=(\d+)/i)
  return m?.[1] ?? null
}

function normalizeTableHref(href: string): string {
  if (href.startsWith('/')) return `${BGA_ORIGIN}${href}`
  if (href.startsWith('//')) return `https:${href}`
  return href
}

function dedupeBasesPreserveOrder(basesInListOrder: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const b of basesInListOrder) {
    const n = normalizeBase(b)
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

type TableCdnCapture = {
  tableId: string
  tableUrl: string
  sampleUrl: string
  base: string
}

function baseUrlFromImgAsset(fullUrl: string): string {
  const base = baseUrlFromKnownAgricolaAsset(fullUrl)
  if (!base) {
    throw new Error(
      `Expected path containing /games/agricola/<id>/img/<file>, got: ${JSON.stringify(fullUrl)}`,
    )
  }
  return base
}

async function collectOrderedTableTargets(
  page: Page,
  listWaitMs: number,
  maxTables: number,
): Promise<{ tableId: string; tableUrl: string }[]> {
  await page.waitForSelector('a[href*="agricola?table="]', {
    timeout: listWaitMs,
    state: 'attached',
  })
  const hrefs = await page.locator('a[href*="agricola?table="]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('href')).filter((h): h is string => !!h),
  )
  const seenIds = new Set<string>()
  const out: { tableId: string; tableUrl: string }[] = []
  for (const href of hrefs) {
    if (out.length >= maxTables) break
    const id = tableIdFromHref(href)
    if (!id || seenIds.has(id)) continue
    seenIds.add(id)
    out.push({ tableId: id, tableUrl: normalizeTableHref(href) })
  }
  return out
}

async function captureSampleUrlOnTablePage(
  page: Page,
  tableUrl: string,
  assetWaitMs: number,
): Promise<string> {
  let meeplesHit: string | null = null
  let imgFallback: string | null = null
  let cssFallback: string | null = null
  const handler = (response: Response) => {
    if (response.status() >= 400) return
    const url = response.url()
    if (looksLikeMeeplesAssetUrl(url)) meeplesHit = url
    else if (looksLikeAgricolaCdnImgFileUrl(url) && !imgFallback) imgFallback = url
    else if (looksLikeAgricolaCdnCssFileUrl(url) && !cssFallback) cssFallback = url
  }
  page.on('response', handler)
  try {
    const pick = () => meeplesHit ?? imgFallback ?? cssFallback
    try {
      await page.goto(tableUrl, {
        waitUntil: 'domcontentloaded',
        timeout: TABLE_GOTO_TIMEOUT_MS,
      })
    } catch (e) {
      const got = pick()
      if (got) return got
      throw e
    }
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await page
      .locator('#game_play_area')
      .waitFor({ state: 'attached', timeout: GAME_AREA_WAIT_MS })
      .catch(() => {})

    if (pick()) return pick()!

    try {
      const resp = await page.waitForResponse(
        (r) =>
          r.status() < 400 &&
          (looksLikeMeeplesAssetUrl(r.url()) ||
            looksLikeAgricolaCdnImgFileUrl(r.url()) ||
            looksLikeAgricolaCdnCssFileUrl(r.url())),
        { timeout: assetWaitMs },
      )
      return resp.url()
    } catch {
      const got = pick()
      if (got) return got
      throw new Error(
        `${assetWaitMs / 1000}s 内未捕获 …/games/agricola/…/img/ 下图片（可能未开局或需登录）`,
      )
    }
  } finally {
    page.off('response', handler)
  }
}

function storageStatePathFromEnv(): string | undefined {
  const p = process.env.BGA_STORAGE_STATE?.trim()
  return p || undefined
}

async function fetchCdnCapturesFromPlaywright(): Promise<TableCdnCapture[]> {
  const storageStatePath = storageStatePathFromEnv()
  if (storageStatePath && !fs.existsSync(storageStatePath)) {
    throw new Error(`BGA_STORAGE_STATE 指向的文件不存在: ${storageStatePath}`)
  }
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...(storageStatePath ? { storageState: storageStatePath } : {}),
    })

    const listPage = await context.newPage()
    const listAssetUrls: string[] = []
    const listResponseHandler = (response: Response) => {
      if (response.status() >= 400) return
      const url = response.url()
      if (looksLikeAgricolaCdnImgFileUrl(url) || looksLikeAgricolaCdnCssFileUrl(url)) {
        listAssetUrls.push(url)
      }
    }
    listPage.on('response', listResponseHandler)
    const listGotoTimeout = Math.max(DEFAULT_TABLE_WAIT_MS, 60_000)
    const listGotoAttempts = 3
    let lastGotoError: unknown
    for (let attempt = 1; attempt <= listGotoAttempts; attempt++) {
      try {
        await listPage.goto(BGA_AGRICOLA_TABLES_URL, {
          waitUntil: 'domcontentloaded',
          timeout: listGotoTimeout,
        })
        lastGotoError = undefined
        break
      } catch (err) {
        lastGotoError = err
        console.warn(
          `[sync-bga-cdn] 列表页加载第 ${attempt}/${listGotoAttempts} 次失败：${(err as Error).message || err}`,
        )
        if (attempt < listGotoAttempts) {
          await listPage.waitForTimeout(3_000)
        }
      }
    }
    if (lastGotoError) throw lastGotoError
    await listPage.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    await listPage
      .getByRole('button', { name: /accept all cookies|accept all|tout accepter/i })
      .click({ timeout: 8000 })
      .catch(() => {})
    const title = await listPage.title()
    if (/login to board game arena/i.test(title)) {
      throw new Error(
        '当前被重定向到 BGA 登录页。请设置环境变量 BGA_STORAGE_STATE 指向已登录导出的 storage state JSON 后重试。',
      )
    }

    const listBases = extractAgricolaCdnBasesFromText(
      `${listAssetUrls.join('\n')}\n${await listPage.content()}`,
    )
    if (listBases.length > 0) {
      listPage.off('response', listResponseHandler)
      await listPage.close()
      return listBases.map((base) => ({
        tableId: 'gametables',
        tableUrl: BGA_AGRICOLA_TABLES_URL,
        sampleUrl: `${base.replace(/\/img$/, '')}/agricola.css`,
        base,
      }))
    }

    const tableTargets = await collectOrderedTableTargets(
      listPage,
      DEFAULT_TABLE_WAIT_MS,
      DEFAULT_MAX_TABLES,
    )
    listPage.off('response', listResponseHandler)
    await listPage.close()

    if (tableTargets.length === 0) {
      throw new Error(
        '列表中未找到 agricola?table= 链接（当前无开放桌、页面未加载完或需登录）。',
      )
    }

    const workPage = await context.newPage()
    const captures: TableCdnCapture[] = []
    for (const { tableId, tableUrl } of tableTargets) {
      try {
        const sampleUrl = await captureSampleUrlOnTablePage(
          workPage,
          tableUrl,
          CDN_ASSET_WAIT_PER_TABLE_MS,
        )
        const base = normalizeBase(baseUrlFromImgAsset(sampleUrl))
        captures.push({ tableId, tableUrl, sampleUrl, base })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`桌 table=${tableId} 跳过: ${msg}`)
      }
    }
    await workPage.close()

    if (captures.length === 0) {
      throw new Error('所有候选桌均未抓到 CDN 图片请求')
    }
    return captures
  } finally {
    await browser.close()
  }
}

function ghRepoArgs(repo: string | undefined): string[] {
  return repo ? ['--repo', repo] : []
}

function resolveRepo(cliRepo: string | undefined): string | null {
  if (cliRepo) return cliRepo
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  try {
    const out = execFileSync(
      'gh',
      ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
      { encoding: 'utf-8' },
    )
    return out.trim() || null
  } catch {
    return null
  }
}

function ghVariableGet(name: string, repo: string | undefined): string | null {
  try {
    const out = execFileSync('gh', ['variable', 'get', name, ...ghRepoArgs(repo)], {
      encoding: 'utf-8',
    })
    return out.trim()
  } catch {
    return null
  }
}

function ghVariableSet(name: string, value: string, repo: string | undefined): void {
  execFileSync('gh', ['variable', 'set', name, '--body', value, ...ghRepoArgs(repo)], {
    stdio: 'inherit',
  })
}

function writeGithubOutput(entries: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  const lines = Object.entries(entries)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  fs.appendFileSync(file, `${lines}\n`)
}

function parseArgs(argv: string[]): {
  probeOnly: boolean
  dryRun: boolean
  repo: string | undefined
} {
  const out = {
    probeOnly: false,
    dryRun: false,
    repo: undefined as string | undefined,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--probe-only' || a === '-p') out.probeOnly = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--repo') {
      const next = argv[++i]
      if (!next) throw new Error('--repo 需要参数 owner/name')
      out.repo = next
    } else if (a.startsWith('-')) {
      throw new Error(`未知参数: ${a}`)
    } else {
      throw new Error(`未知参数: ${a}`)
    }
  }
  return out
}

function printProbeDetails(captures: TableCdnCapture[], basesNewestFirst: string[]): void {
  console.log('')
  console.log(`成功 ${captures.length} 个样本；去重后 ${basesNewestFirst.length} 个 CDN 基址。`)
  console.log('')
  console.log('去重后的 BGA_CDN_BASE_URL（新→旧，按列表中首次出现顺序）:')
  for (const b of basesNewestFirst) console.log(b)
  console.log('')
  console.log('各样本（含同源多桌）:')
  for (const c of captures) {
    const via = looksLikeMeeplesAssetUrl(c.sampleUrl)
      ? 'meeples'
      : looksLikeAgricolaCdnCssFileUrl(c.sampleUrl)
        ? 'css'
        : '其它 img'
    const label = c.tableId === 'gametables' ? 'source=gametables' : `table=${c.tableId}`
    console.log(`  ${label} (${via})`)
    console.log(`    ${c.sampleUrl}`)
  }
  console.log('')
}

async function main(): Promise<number> {
  let args: ReturnType<typeof parseArgs>
  try {
    args = parseArgs(process.argv)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    return 2
  }

  let captures: TableCdnCapture[]
  let basesNewestFirst: string[]

  try {
    console.log(
      `从 gametables 捕获 Agricola release，必要时最多扫描 ${DEFAULT_MAX_TABLES} 桌资源（优先 meeples）…`,
    )
    captures = await fetchCdnCapturesFromPlaywright()
    basesNewestFirst = dedupeBasesPreserveOrder(captures.map((c) => c.base))
  } catch (e) {
    console.error('抓取失败:', e)
    return 1
  }

  const newBase = basesNewestFirst[0]
  if (!newBase) {
    console.error('未得到任何 CDN 基址')
    return 1
  }

  if (args.probeOnly) {
    printProbeDetails(captures, basesNewestFirst)
    return 0
  }

  loadGhTokenFromDotenv()
  const repo = resolveRepo(args.repo)
  if (!repo) {
    console.error(
      '无法确定仓库：请设置 GITHUB_REPOSITORY、传入 --repo，或在仓库目录执行 gh repo sync。',
    )
    return 2
  }

  console.log('')
  console.log(`探测到最新 CDN 基址: ${newBase}`)
  if (basesNewestFirst.length > 1) {
    console.log('其它去重基址（新→旧）:', basesNewestFirst.slice(1).join(' | '))
  }

  const currentRaw = ghVariableGet(VAR_NAME, repo)
  let currentNorm: string | null = null
  if (currentRaw === null) {
    console.log(`仓库变量 ${VAR_NAME} 不存在或无法读取，将创建/更新。`)
  } else {
    currentNorm = normalizeBase(currentRaw)
    console.log(`当前 GitHub 变量值: ${currentNorm}`)
  }

  if (currentNorm === newBase) {
    console.log('已与 GitHub 变量一致，无需更新。')
    writeGithubOutput({ updated: 'false', new_base: newBase })
    return 0
  }

  if (args.dryRun) {
    console.log(`[dry-run] 将执行: gh variable set ${VAR_NAME} --body <新值>`)
    console.log(`[dry-run] 新值: ${newBase}`)
    writeGithubOutput({ updated: 'false', new_base: newBase })
    return 0
  }

  ghVariableSet(VAR_NAME, newBase, repo)
  console.log(`已更新 ${VAR_NAME}。`)
  writeGithubOutput({ updated: 'true', new_base: newBase })
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
