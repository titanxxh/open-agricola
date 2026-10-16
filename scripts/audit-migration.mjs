import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultManifest = path.join(root, 'scripts/audit-migration/cases.json')
const originFile = path.join(root, 'scripts/audit-migration/origin.json')
const fail = message => { throw new Error(message) }
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value) }
const json = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`)
const safeRelative = value => typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..')

function readManifest(file, targetRoot = root) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (manifest.version !== 1 || !manifest.source || !Array.isArray(manifest.files)) fail('unsupported migration manifest')
  if (!/^[a-f0-9]{40}$/.test(manifest.source.commit)) fail('source commit must be a full SHA')
  const identities = new Set()
  const sourceFiles = new Set()
  let remaining = 0, resolved = 0
  for (const group of manifest.files) {
    if (!safeRelative(group.file) || !group.file.startsWith('ae-negative-') || !Array.isArray(group.cases)) fail('invalid source file group')
    if (sourceFiles.has(group.file)) fail(`duplicate source file: ${group.file}`)
    sourceFiles.add(group.file)
    if (!/^[a-f0-9]{64}$/.test(group.sha256)) fail(`missing source digest: ${group.file}`)
    for (const item of group.cases) {
      if (typeof item.title !== 'string' || !item.title || typeof item.batch !== 'string') fail('missing dynamic title or migration batch')
      const identity = `${group.file}\0${item.title}`
      if (identities.has(identity)) fail(`duplicate dynamic identity: ${group.file} / ${item.title}`)
      identities.add(identity)
      if (item.status === 'remaining') { remaining++; continue }
      if (!['migrated', 'existing-coverage'].includes(item.status)) fail(`invalid migration status: ${item.status}`)
      if (!safeRelative(item.targetFile) || !item.targetFile.startsWith('server/') || typeof item.targetTitle !== 'string' || !item.targetTitle) fail(`${item.title}: requires targetFile and targetTitle`)
      if (item.status === 'existing-coverage' && (typeof item.rationale !== 'string' || !item.rationale.trim())) fail(`${item.title}: existing-coverage requires rationale`)
      if (!fs.existsSync(path.join(targetRoot, item.targetFile))) fail(`native target missing: ${item.targetFile}`)
      resolved++
    }
  }
  if (sourceFiles.size !== manifest.source.files || identities.size !== manifest.source.cases) fail('source inventory counts do not match manifest')
  if (path.resolve(file) === defaultManifest) {
    const origin = JSON.parse(fs.readFileSync(originFile, 'utf8'))
    const identityDigest = digest(JSON.stringify(manifest.files.flatMap(group => group.cases.map(item => [group.file, item.title, item.batch])).sort()))
    if (manifest.source.commit !== origin.commit || sourceFiles.size !== origin.files || identities.size !== origin.cases || identityDigest !== origin.identitiesSha256) fail('immutable original scenario inventory changed')
  }
  return { manifest, summary: { sourceFiles: sourceFiles.size, sourceCases: identities.size, remaining, resolved } }
}

function replaceOnce(source, before, after, file) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) fail(`source adapter no longer matches ${file}`)
  return source.replace(before, after)
}

function adaptSource(file, source) {
  if (file === 'ae-negative-25-occupations-session.test.ts') {
    source = replaceOnce(source, 'sourceCard:flow.sourceCard,eventSink}', 'sourceCard:flow.sourceCard,eventSink,actionHooks:session.actionHooks}', file)
  }
  if (file === 'ae-negative-39-native-session.test.ts') {
    source = replaceOnce(source, 'GameState, PlayerState, Resource', 'ActionChoiceOption, GameState, PlayerState, Resource', file)
    source = replaceOnce(source, "function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && 'options' in r.interaction.request ? r.interaction.request.options ?? [] : []; }", "function opts(r: SessionResponse): ActionChoiceOption[] { const i = r.interaction; return i.stateId === 'wait' && (i.request.kind === 'choice' || i.request.kind === 'select-trigger') ? i.request.options : []; }", file)
  }
  if (file === 'ae-negative-51-family-session.test.ts') {
    source = replaceOnce(source, "assertRuleOutcome(r.state.players[0]!.resources.vegetable, 1, { id: 'OA-C131-N3-new-occupation-grain-trigger', observed: 0 })", 'assertRuleOutcome(r.state.players[0]!.resources.vegetable, 0)', file)
  }
  source = source.replaceAll('process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR', `(process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR && process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR + '/${file}')`)
  source = source.replaceAll('process.env.AGRICOLA_NEGATIVE_OUTPUT_DIR', `(process.env.AGRICOLA_NEGATIVE_OUTPUT_DIR && process.env.AGRICOLA_NEGATIVE_OUTPUT_DIR + '/${file}')`)
  return source
}

function sourceInventory(candidate) {
  const found = []
  const scan = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) scan(file)
      else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|json)$/.test(entry.name)) found.push(path.relative(candidate, file).split(path.sep).join('/'))
    }
  }
  scan(candidate)
  const ignored = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], { cwd: root, input: `${found.join('\0')}\0`, encoding: 'utf8' })
  if (ignored.status !== 0 && ignored.status !== 1) fail(`cannot inspect source inventory: ${ignored.stderr}`)
  const excluded = new Set(ignored.stdout.split('\0').filter(Boolean))
  return found.filter(file => !excluded.has(file)).sort()
}

function prepare(manifest, output) {
  if (!output || !path.isAbsolute(output)) fail('--output must be an absolute path outside the checkout')
  const commonGit = path.resolve(root, git('rev-parse', '--git-common-dir').toString().trim())
  for (const checkout of [root, path.dirname(commonGit)]) {
    const relative = path.relative(checkout, output)
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) fail('overlay and evidence must be outside Git')
  }
  if (fs.existsSync(output)) fail('output already exists; select a fresh run directory')
  const candidate = path.join(output, 'candidate')
  const tracked = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean)
  const fingerprints = []
  for (const file of tracked) {
    const from = path.join(root, file)
    if (!fs.existsSync(from) || !fs.statSync(from).isFile()) continue
    const bytes = fs.readFileSync(from)
    fingerprints.push([file, digest(bytes)])
    write(path.join(candidate, file), bytes)
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(candidate, 'node_modules'), 'dir')
  const sourceDigests = []
  const remainingFiles = []
  for (const group of manifest.files) {
    const file = `server/__tests__/${group.file}`
    const bytes = git('show', `${manifest.source.commit}:${file}`)
    if (digest(bytes) !== group.sha256) fail(`source digest mismatch: ${file}`)
    sourceDigests.push([file, digest(bytes)])
    if (!group.cases.some(item => item.status === 'remaining')) continue
    remainingFiles.push(file)
    write(path.join(candidate, file), adaptSource(group.file, bytes.toString()))
  }
  const helper = 'server/__tests__/_helpers/negative-rule-audit.ts'
  const helperBytes = git('show', `${manifest.source.commit}:${helper}`)
  if (manifest.source.helperSha256 && digest(helperBytes) !== manifest.source.helperSha256) fail('source helper digest mismatch')
  sourceDigests.push([helper, digest(helperBytes)])
  write(path.join(candidate, helper), helperBytes)
  const nativeFiles = [...new Set(manifest.files.flatMap(group => group.cases.filter(item => item.status !== 'remaining').map(item => item.targetFile)))].sort()
  const titles = manifest.files.flatMap(group => group.cases.filter(item => item.status === 'remaining').map(item => { const prefix = (item.ancestors ?? []).join(' '); return prefix ? `${item.ancestors.join(' > ')} > ${item.title.slice(prefix.length + 1)}` : item.title }))
  const escaped = titles.map(title => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const setupFiles = ['./shared/cards/__tests__/setup-register-all.ts', './shared/cards/__tests__/setup-listener-purity.ts']
  const projects = []
  if (remainingFiles.length) projects.push({ extends: true, test: { name: 'remaining', include: remainingFiles, testNamePattern: `^(?:${escaped.join('|')})$`, setupFiles, isolate: false } })
  if (nativeFiles.length) projects.push({ extends: true, test: { name: 'native', include: nativeFiles, setupFiles, isolate: false } })
  write(path.join(candidate, 'vitest.migration.config.ts'), `import { defineConfig } from 'vitest/config'\nexport default defineConfig(${JSON.stringify({ test: { projects } })})\n`)
  const includes = [...remainingFiles, ...nativeFiles]
  json(path.join(candidate, 'tsconfig.migration.json'), { extends: './tsconfig.server.json', compilerOptions: { noUnusedLocals: false, noUnusedParameters: false, incremental: false }, include: includes, exclude: [] })
  const covered = [...new Set([...tracked, ...remainingFiles, helper, 'vitest.migration.config.ts', 'tsconfig.migration.json'])].filter(file => fs.existsSync(path.join(candidate, file)) && fs.statSync(path.join(candidate, file)).isFile()).sort()
  const candidateFingerprints = covered.map(file => [file, digest(fs.readFileSync(path.join(candidate, file)))])
  json(path.join(output, 'cases.json'), manifest)
  json(path.join(output, 'assembly.json'), { candidateCommit: git('rev-parse', 'HEAD').toString().trim(), candidateFingerprint: digest(JSON.stringify(fingerprints)), candidateFiles: fingerprints, assembledFiles: candidateFingerprints, assembledFingerprint: digest(JSON.stringify(candidateFingerprints)), sourceInventory: sourceInventory(candidate), source: manifest.source, sourceFiles: sourceDigests, remainingFiles, nativeFiles, remainingCases: titles.length, createdAt: new Date().toISOString() })
  return { candidate, remainingFiles: remainingFiles.length, nativeFiles: nativeFiles.length, remainingCases: titles.length }
}

function command(candidate, args, log, env = {}) {
  const result = spawnSync('pnpm', args, { cwd: candidate, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  write(log, `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? result.error.message : ''}`)
  return result.status ?? 1
}

function verify(output) {
  const candidate = path.join(output, 'candidate')
  if (!fs.existsSync(path.join(output, 'assembly.json'))) fail('run prepare before verify')
  const assembly = JSON.parse(fs.readFileSync(path.join(output, 'assembly.json'), 'utf8'))
  const assertCandidate = () => {
    if (JSON.stringify(sourceInventory(candidate)) !== JSON.stringify(assembly.sourceInventory)) fail('candidate source inventory changed since assembly')
    for (const [file, expected] of assembly.assembledFiles) if (!fs.existsSync(path.join(candidate, file)) || digest(fs.readFileSync(path.join(candidate, file))) !== expected) fail(`candidate changed since assembly: ${file}`)
  }
  assertCandidate()
  const types = command(candidate, ['exec', 'tsc', '-p', 'tsconfig.migration.json', '--pretty', 'false'], path.join(output, 'types.log'))
  const files = command(candidate, ['exec', 'tsc', '-p', 'tsconfig.migration.json', '--listFilesOnly', '--pretty', 'false'], path.join(output, 'included-files.log'))
  const behavior = command(candidate, ['exec', 'vitest', 'run', '--config', 'vitest.migration.config.ts', '--reporter=json', `--outputFile=${path.join(output, 'behavior.json')}`], path.join(output, 'behavior.log'), { AGRICOLA_NEGATIVE_ARTIFACT_DIR: path.join(output, 'scenario-evidence'), AGRICOLA_NEGATIVE_OUTPUT_DIR: path.join(output, 'scenario-evidence') })
  assertCandidate()
  const included = new Set(fs.readFileSync(path.join(output, 'included-files.log'), 'utf8').split(/\r?\n/).map(file => path.resolve(file)))
  const missingTypeRoots = [...assembly.remainingFiles, ...assembly.nativeFiles].filter(file => !included.has(path.join(candidate, file)))
  const summary = { typesExit: types, fileInventoryExit: files, behaviorExit: behavior, missingTypeRoots, includedTypeRoots: assembly.remainingFiles.length + assembly.nativeFiles.length - missingTypeRoots.length }
  const behaviorFile = path.join(output, 'behavior.json')
  if (fs.existsSync(behaviorFile)) {
    const report = JSON.parse(fs.readFileSync(behaviorFile, 'utf8'))
    Object.assign(summary, { tests: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests, todo: report.numTodoTests })
    const { manifest } = readManifest(path.join(output, 'cases.json'), candidate)
    const cases = new Map()
    for (const suite of report.testResults ?? []) for (const test of suite.assertionResults ?? []) {
      const key = `${path.relative(candidate, suite.name).replaceAll(path.sep, '/')}\0${test.fullName}`
      if (cases.has(key)) fail(`ambiguous dynamic test identity: ${key.replace('\0', ' / ')}`)
      cases.set(key, test.status)
    }
    const unresolved = []
    for (const group of manifest.files) for (const item of group.cases) {
      const file = item.status === 'remaining' ? `server/__tests__/${group.file}` : item.targetFile
      const title = item.status === 'remaining' ? item.title : item.targetTitle
      if (cases.get(`${file}\0${title}`) !== 'passed') unresolved.push({ source: `${group.file} / ${item.title}`, file, title, result: cases.get(`${file}\0${title}`) ?? 'not-executed' })
    }
    json(path.join(output, 'unresolved-cases.json'), unresolved)
    summary.coveredSourceCases = manifest.source.cases - unresolved.length
    summary.unresolvedSourceCases = unresolved.length
  } else summary.unresolvedSourceCases = 'behavior report absent'
  json(path.join(output, 'summary.json'), summary)
  return summary
}

try {
  const [action, ...arguments_] = process.argv.slice(2)
  const options = new Map()
  for (let index = 0; index < arguments_.length; index += 2) {
    if (!arguments_[index]?.startsWith('--') || !arguments_[index + 1]) fail('options require --name value')
    options.set(arguments_[index].slice(2), arguments_[index + 1])
  }
  const { manifest, summary } = readManifest(options.get('manifest') ?? defaultManifest)
  if (action === 'check') process.stdout.write(`${JSON.stringify(summary)}\n`)
  else if (action === 'prepare') process.stdout.write(`${JSON.stringify(prepare(manifest, options.get('output')))}\n`)
  else if (action === 'verify') {
    const result = verify(options.get('output'))
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result.typesExit || result.fileInventoryExit || result.behaviorExit || result.unresolvedSourceCases || result.missingTypeRoots.length) process.exitCode = 1
  } else fail('usage: node scripts/audit-migration.mjs check|prepare|verify [--manifest file] [--output external-run-directory]')
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
}
