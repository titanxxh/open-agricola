import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cardsManifestAsset } from './browser-data.ts'

const repoRoot = resolve(import.meta.dirname, '..')
const gameBuildId = process.argv[2]
if (!gameBuildId) throw new Error('Static encyclopedia requires a game build identity')

execFileSync('pnpm', ['exec', 'vite', 'build', '--config', 'scripts/vite-encyclopedia.ts'], {
  cwd: repoRoot,
  stdio: 'inherit',
})

const pages = resolve(repoRoot, 'dist-pages')
const encyclopedia = resolve(pages, 'encyclopedia')
const { fileName, sha256 } = cardsManifestAsset(readFileSync(resolve(pages, 'cards-manifest.json'), 'utf8'))
copyFileSync(resolve(pages, fileName), resolve(encyclopedia, fileName))
for (const directory of ['card-encyclopedia', 'i18n']) {
  cpSync(resolve(pages, directory), resolve(encyclopedia, directory), { recursive: true })
}
const language: unknown = JSON.parse(readFileSync(resolve(repoRoot, 'i18n.ref'), 'utf8'))
const catalog: unknown = JSON.parse(readFileSync(resolve(encyclopedia, 'card-encyclopedia/manifest.json'), 'utf8'))
writeFileSync(resolve(encyclopedia, 'build.json'), JSON.stringify({
  gameBuildId,
  language,
  publicAssetsRevision: readFileSync(resolve(repoRoot, 'public-assets.ref'), 'utf8').trim(),
  cardsManifestSha256: sha256,
  catalog,
}) + '\n')
