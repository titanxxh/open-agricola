/**
 * 卡牌实现 vs BGA 架构审查脚本（A 阶段机械信号扫描）。
 * 详见 docs/superpowers/specs/2026-04-28-card-impl-vs-bga-audit-design.md
 *
 * 用法：
 *   pnpm tsx scripts/audit-card-architecture.ts
 *   pnpm tsx scripts/audit-card-architecture.ts --strict   # 任一信号命中即 exit 1
 *
 * env：
 *   BGA_CARDS_DIR  默认 /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards
 *   OUR_CARDS_DIR  默认 shared/cards
 */

export interface ParsedArgs {
  ourCardsDir: string
  bgaCardsDir: string
  outputPath: string
  strict: boolean
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedArgs {
  return {
    ourCardsDir: env.OUR_CARDS_DIR ?? 'shared/cards',
    bgaCardsDir: env.BGA_CARDS_DIR ?? '/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards',
    outputPath: 'output/tmp/audit-card-arch-2026-04-28.jsonl',
    strict: argv.includes('--strict'),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  console.log(JSON.stringify(args, null, 2))
}
