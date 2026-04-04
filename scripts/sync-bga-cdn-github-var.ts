/**
 * 推导 BGA_CDN_BASE_URL，并用 gh 对齐 GitHub Repository variable。
 *
 * 默认：**匿名 HTTP HEAD** 探测固定 CDN URL（与 vite 默认 build 同步），**不需要 BGA 登录**。
 * 可选 `--scan-tables`：用 Playwright 扫 gametables?game=agricola 列表（多数情况无需登录；若遇登录墙可配合 --storage-state）。
 *
 * 读写 GitHub 变量：gh 或 .env 的 GH_TOKEN（--probe-only 不需要）。
 *
 *   npx tsx scripts/sync-bga-cdn-github-var.ts --probe-only
 *   npx tsx scripts/sync-bga-cdn-github-var.ts --probe-only --scan-tables
 *   npx tsx scripts/sync-bga-cdn-github-var.ts --dry-run
 */

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page, type Response } from 'playwright'

const VAR_NAME = 'BGA_CDN_BASE_URL'

const DEFAULT_TABLE_WAIT_MS = 10_000
const TABLE_GOTO_TIMEOUT_MS = 90_000
/** 多桌扫描时每桌等待素材的上限（秒太长会拖慢整次运行） */
const CDN_ASSET_WAIT_PER_TABLE_MS = 75_000
const GAME_AREA_WAIT_MS = 90_000
const DEFAULT_MAX_TABLES = 15

/** 列表与桌链接用英文区，避免根域 302 / 区域不一致 */
const BGA_ORIGIN = 'https://en.boardgamearena.com'
/** 公开桌列表（链格式为 /…/agricola?table=，与旧版 /table?table= 不同） */
const BGA_AGRICOLA_TABLES_URL = `${BGA_ORIGIN}/gametables?game=agricola`

/**
 * 匿名可访问的 meeples 探测 URL（与 vite.config.ts / server 默认 BGA_CDN_BASE 同步）。
 * BGA 更换 theme build 后需改此处或设 env BGA_CDN_FALLBACK_MEEPLES_URL。
 */
const FALLBACK_CDN_MEEPLES_URL =
  process.env.BGA_CDN_FALLBACK_MEEPLES_URL ??
  'https://x.boardgamearena.net/data/themereleases/current/games/agricola/260329-0408/img/meeples.png'

async function probeCdnViaHttpHead(): Promise<string> {
  const r = await fetch(FALLBACK_CDN_MEEPLES_URL, { method: 'HEAD', redirect: 'follow' })
  if (!r.ok) {
    throw new Error(`HEAD ${FALLBACK_CDN_MEEPLES_URL} -> HTTP ${r.status}`)
  }
  return r.url
}

/** 任意一局内从 CDN 拉取的、位于 agricola …/img/ 下的静态图（meeples 常不请求，用其它图推导同一基址） */
const AGRICOLA_CDN_IMG_FILE_RE =
  /\/games\/agricola\/[^/]+\/img\/[^/?#]+\.(png|webp|jpe?g|gif|svg|ico)(\?|#|$)/i

function looksLikeMeeplesAssetUrl(url: string): boolean {
  const u = url.toLowerCase()
  return u.includes('meeples.png') || u.includes('meeples.webp')
}

function looksLikeAgricolaCdnImgFileUrl(url: string): boolean {
  return AGRICOLA_CDN_IMG_FILE_RE.test(url)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

function tableIdFromHref(href: string): string | null {
  const m = href.match(/[?&]table=(\d+)/i)
  return m?.[1] ?? null
}

function normalizeTableHref(href: string): string {
  if (href.startsWith('/')) return `${BGA_ORIGIN}${href}`
  if (href.startsWith('//')) return `https:${href}`
  return href
}

/** 列表顺序 = BGA 展示顺序，视为新→旧；按此顺序对 base 去重即「从新到旧」的唯一基址列表 */
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

/** 从 …/games/agricola/<build>/img/<file> 去掉文件名得到 BGA_CDN_BASE_URL */
function baseUrlFromImgAsset(fullUrl: string): string {
  const u = new URL(fullUrl.trim())
  const pathname = u.pathname
  if (!/\/games\/agricola\/[^/]+\/img\//i.test(pathname)) {
    throw new Error(
      `Expected path containing /games/agricola/<id>/img/<file>, got: ${JSON.stringify(fullUrl)}`,
    )
  }
  const dir = pathname.replace(/\/[^/]+$/, '')
  u.pathname = dir
  u.search = ''
  u.hash = ''
  return normalizeBase(u.toString())
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
  const handler = (response: Response) => {
    if (response.status() >= 400) return
    const url = response.url()
    if (looksLikeMeeplesAssetUrl(url)) meeplesHit = url
    else if (looksLikeAgricolaCdnImgFileUrl(url) && !imgFallback) imgFallback = url
  }
  page.on('response', handler)
  try {
    await page.goto(tableUrl, {
      waitUntil: 'load',
      timeout: TABLE_GOTO_TIMEOUT_MS,
    })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await page
      .locator('#game_play_area')
      .waitFor({ state: 'attached', timeout: GAME_AREA_WAIT_MS })
      .catch(() => {})

    const pick = () => meeplesHit ?? imgFallback
    if (pick()) return pick()!

    try {
      const resp = await page.waitForResponse(
        (r) =>
          r.status() < 400 &&
          (looksLikeMeeplesAssetUrl(r.url()) || looksLikeAgricolaCdnImgFileUrl(r.url())),
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

/**
 * 按 gametables 列表顺序（视为新→旧）取前 maxTables 个不同 table=，逐桌抓 CDN 样本。
 */
async function fetchCdnCapturesFromPlaywright(
  headless: boolean,
  listWaitMs: number,
  maxTables: number,
  storageStatePath?: string,
): Promise<TableCdnCapture[]> {
  if (storageStatePath && !fs.existsSync(storageStatePath)) {
    throw new Error(`--storage-state 文件不存在: ${storageStatePath}`)
  }
  const browser = await chromium.launch({ headless })
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...(storageStatePath ? { storageState: storageStatePath } : {}),
    })

    const listPage = await context.newPage()
    await listPage.goto(BGA_AGRICOLA_TABLES_URL, {
      waitUntil: 'load',
      timeout: Math.max(listWaitMs, 60_000),
    })
    await listPage.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    await listPage
      .getByRole('button', { name: /accept all cookies|accept all|tout accepter/i })
      .click({ timeout: 8000 })
      .catch(() => {})
    const title = await listPage.title()
    if (/login to board game arena/i.test(title)) {
      throw new Error(
        '当前被重定向到 BGA 登录页。请使用已登录浏览器导出的 --storage-state=auth.json，' +
          '或改用默认匿名 HTTP（不要加 --scan-tables）。',
      )
    }

    const tableTargets = await collectOrderedTableTargets(listPage, listWaitMs, maxTables)
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

function parseArgs(argv: string[]): {
  probeOnly: boolean
  dryRun: boolean
  headed: boolean
  /** 为 true 时用 Playwright 扫多桌（常需 BGA 登录）；默认 false = 匿名 HTTP */
  scanLiveTables: boolean
  maxTables: number
  repo: string | undefined
  storageState: string | undefined
} {
  const out = {
    probeOnly: false,
    dryRun: false,
    headed: false,
    scanLiveTables: false,
    maxTables: DEFAULT_MAX_TABLES,
    repo: undefined as string | undefined,
    storageState: undefined as string | undefined,
  }
  let explicitHttpOnly = false
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--probe-only' || a === '-p') out.probeOnly = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--headed') out.headed = true
    else if (a === '--scan-tables') out.scanLiveTables = true
    else if (a === '--http-only') explicitHttpOnly = true
    else if (a === '--max-tables') {
      const next = argv[++i]
      if (!next) throw new Error('--max-tables 需要正整数')
      const n = Number.parseInt(next, 10)
      if (!Number.isFinite(n) || n < 1) throw new Error('--max-tables 需要正整数')
      out.maxTables = n
    } else if (a === '--repo') {
      const next = argv[++i]
      if (!next) throw new Error('--repo 需要参数 owner/name')
      out.repo = next
    } else if (a === '--storage-state') {
      const next = argv[++i]
      if (!next) throw new Error('--storage-state 需要 auth.json 路径')
      out.storageState = next
    } else if (a.startsWith('-')) {
      throw new Error(`未知参数: ${a}`)
    }
  }
  if (explicitHttpOnly && out.scanLiveTables) {
    throw new Error('--http-only 与 --scan-tables 互斥（默认已是匿名 HTTP，无需再写 --http-only）')
  }
  if (explicitHttpOnly) out.scanLiveTables = false
  return out
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv)

  if (args.storageState && !args.scanLiveTables) {
    console.warn(
      '提示: 已忽略 --storage-state（仅在 --scan-tables 时生效；默认使用匿名 HTTP，无需 BGA 登录）。',
    )
  }

  let captures: TableCdnCapture[]
  let basesNewestFirst: string[]

  try {
    if (args.scanLiveTables) {
      console.log(
        `按列表顺序（新→旧）最多扫描 ${args.maxTables} 桌，捕获 …/games/agricola/…/img/ 资源（优先 meeples）…`,
      )
      captures = await fetchCdnCapturesFromPlaywright(
        !args.headed,
        DEFAULT_TABLE_WAIT_MS,
        args.maxTables,
        args.storageState,
      )
      basesNewestFirst = dedupeBasesPreserveOrder(captures.map((c) => c.base))
    } else {
      console.log('使用匿名 HTTP HEAD 探测 CDN（无需 BGA 登录；URL 与仓库 vite 默认 build 同步）…')
      const sampleUrl = await probeCdnViaHttpHead()
      const base = normalizeBase(baseUrlFromImgAsset(sampleUrl))
      captures = [
        {
          tableId: 'http-fallback',
          tableUrl: FALLBACK_CDN_MEEPLES_URL,
          sampleUrl,
          base,
        },
      ]
      basesNewestFirst = [base]
    }
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
    console.log('')
    if (args.scanLiveTables) {
      console.log(`成功 ${captures.length} 桌；去重后 ${basesNewestFirst.length} 个 CDN 基址。`)
      console.log('')
      console.log('去重后的 BGA_CDN_BASE_URL（新→旧，按列表中首次出现顺序）:')
      for (const b of basesNewestFirst) console.log(b)
      console.log('')
      console.log('各桌样本（含同源多桌）:')
      for (const c of captures) {
        const via = looksLikeMeeplesAssetUrl(c.sampleUrl) ? 'meeples' : '其它 img'
        console.log(`  table=${c.tableId} (${via})`)
        console.log(`    ${c.sampleUrl}`)
      }
    } else {
      const first = captures[0]
      if (!first) {
        console.error('内部错误: 匿名 HTTP 无样本')
        return 1
      }
      const via = looksLikeMeeplesAssetUrl(first.sampleUrl) ? 'meeples' : '其它 img'
      console.log(`HTTP 样本（${via}）:`)
      console.log(first.sampleUrl)
      console.log('')
      console.log('去重后的 BGA_CDN_BASE_URL（新→旧）:')
      console.log(newBase)
    }
    console.log('')
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

  if (args.scanLiveTables) {
    console.log(`采用实时桌列表去重后的最新 CDN 基址: ${newBase}`)
    if (basesNewestFirst.length > 1) {
      console.log('其它去重基址（新→旧）:', basesNewestFirst.slice(1).join(' | '))
    }
  } else {
    console.log(`采用匿名 HTTP 探测的 CDN 基址: ${newBase}`)
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
    return 0
  }

  if (args.dryRun) {
    console.log(`[dry-run] 将执行: gh variable set ${VAR_NAME} --body <新值>`)
    console.log(`[dry-run] 新值: ${newBase}`)
    return 0
  }

  ghVariableSet(VAR_NAME, newBase, repo)
  console.log(`已更新 ${VAR_NAME}。`)
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
