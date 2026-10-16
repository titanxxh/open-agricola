import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import ts from 'typescript'
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
  const nativeScope = manifest.nativeScope === undefined ? [] : manifest.nativeScope
  if (!Array.isArray(nativeScope)) fail('nativeScope must be an array')
  const scopeFiles = new Set()
  for (const entry of nativeScope) {
    const file = entry?.file
    if (!safeRelative(file) || file.includes('\\') || path.posix.normalize(file) !== file || !file.startsWith('server/') || !file.endsWith('.test.ts')) fail('nativeScope requires a canonical server test path')
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) fail(`nativeScope requires a nonempty reason: ${file}`)
    if (scopeFiles.has(file)) fail(`duplicate nativeScope file: ${file}`)
    scopeFiles.add(file)
    const full = path.join(targetRoot, file)
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) fail(`nativeScope file missing: ${file}`)
    const relative = path.relative(fs.realpathSync(targetRoot), fs.realpathSync(full))
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail(`nativeScope file escapes checkout: ${file}`)
  }
  const identities = new Set()
  const sourceFiles = new Set()
  const migratedTargets = new Set()
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
      if (item.status === 'migrated') {
        const target = `${item.targetFile}\0${item.targetTitle}`
        if (migratedTargets.has(target)) fail(`${item.title}: duplicate native target requires existing-coverage and rationale`)
        migratedTargets.add(target)
      }
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

function nativeFilesFor(manifest) {
  return [...new Set([
    ...manifest.files.flatMap(group => group.cases.filter(item => item.status !== 'remaining').map(item => item.targetFile)),
    ...(manifest.nativeScope ?? []).map(entry => entry.file),
  ])].sort()
}

function checkNative(manifest) {
  const nativeFiles = nativeFilesFor(manifest)
  const permittedAuditDocs = new Set(['README.md', 'audit/final-conclusions.json', 'audit/source-provenance.json'])
  const names = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean)
  for (const name of names) {
    if (!fs.existsSync(path.join(root, name))) continue
    if (/^server\/__tests__\/ae-negative-/.test(name) || name === 'server/__tests__/_helpers/negative-rule-audit.ts') fail(`Integrate native tests instead of importing the numbered audit suite: ${name}`)
    const prefix = 'docs/test/ae-negative-audit/'
    if (name.startsWith(prefix) && !permittedAuditDocs.has(name.slice(prefix.length))) fail(`Keep scenario evidence outside Git: ${name}`)
  }
  if (!nativeFiles.length) return { nativeFiles, typesExit: 0, missingTypeRoots: [] }
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-native-types-'))
  const config = path.join(output, 'tsconfig.json')
  json(config, { extends: path.join(root, 'tsconfig.server.json'), compilerOptions: { noUnusedLocals: false, noUnusedParameters: false, incremental: false, typeRoots: [path.join(root, 'node_modules/@types')] }, files: nativeFiles.map(file => path.join(root, file)), include: [], exclude: [] })
  const typesExit = command(root, ['exec', 'tsc', '-p', config, '--noEmit', '--pretty', 'false'], path.join(output, 'types.log'))
  if (typesExit) process.stderr.write(fs.readFileSync(path.join(output, 'types.log'), 'utf8'))
  const fileInventoryExit = command(root, ['exec', 'tsc', '-p', config, '--listFilesOnly', '--pretty', 'false'], path.join(output, 'included-files.log'))
  const included = new Set(fs.readFileSync(path.join(output, 'included-files.log'), 'utf8').split(/\r?\n/).filter(Boolean).map(file => path.resolve(file)))
  const missingTypeRoots = nativeFiles.filter(file => !included.has(path.join(root, file)))
  const ownedSources = [...included].filter(file => nativeFiles.includes(path.relative(root, file)) || file.startsWith(path.join(root, 'server/__tests__/_helpers/')))
  for (const file of ownedSources) {
    if (fs.statSync(file).size > 1024 * 1024) fail(`Native test source exceeds 1 MiB; keep full scenario evidence outside Git: ${path.relative(root, file)}`)
  }
  return { nativeFiles, typesExit, fileInventoryExit, missingTypeRoots, includedFiles: included.size, reportDirectory: output }
}

function replaceOnce(source, before, after, file) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) fail(`source adapter no longer matches ${file}`)
  return source.replace(before, after)
}

function pruneMigratedCases(group, source) {
  if (group.cases.every(item => item.status === 'remaining')) return source
  const parsed = ts.createSourceFile(group.file, source, ts.ScriptTarget.Latest, true)
  if (parsed.parseDiagnostics.length) fail(`cannot parse partial source: ${group.file}`)
  const tests = new Set(), suites = new Set()
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'vitest') continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const binding of bindings.elements) {
      const name = binding.propertyName?.text ?? binding.name.text
      if (name === 'it' || name === 'test') tests.add(binding.name.text)
      if (name === 'describe') suites.add(binding.name.text)
    }
  }
  const declarations = new Map()
  const callee = expression => ts.isIdentifier(expression) ? expression.text
    : ts.isPropertyAccessExpression(expression) || ts.isCallExpression(expression) ? callee(expression.expression) : undefined
  const unsupported = node => {
    if (ts.isCallExpression(node) && (tests.has(callee(node.expression)) || suites.has(callee(node.expression)))) fail(`unsupported partial registration in ${group.file}`)
    ts.forEachChild(node, unsupported)
  }
  const collect = (statements, ancestors = []) => {
    for (const statement of statements) {
      const call = ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) ? statement.expression : undefined
      if (call && ts.isIdentifier(call.expression) && (tests.has(call.expression.text) || suites.has(call.expression.text))) {
        const title = call.arguments[0], body = call.arguments[1]
        if (!title || !ts.isStringLiteralLike(title) || !body || (!ts.isArrowFunction(body) && !ts.isFunctionExpression(body))) fail(`unsupported partial registration in ${group.file}`)
        if (suites.has(call.expression.text)) {
          if (!ts.isBlock(body.body)) fail(`unsupported partial suite in ${group.file}`)
          collect(body.body.statements, [...ancestors, title.text])
        } else {
          const identity = [...ancestors, title.text].join(' ')
          if (declarations.has(identity)) fail(`ambiguous partial registration in ${group.file}: ${identity}`)
          declarations.set(identity, statement)
          unsupported(body)
        }
      } else unsupported(statement)
    }
  }
  collect(parsed.statements)
  const expected = new Set(group.cases.map(item => item.title))
  if (declarations.size !== expected.size || [...declarations.keys()].some(title => !expected.has(title))) fail(`partial source identities do not match manifest: ${group.file}`)
  const removed = new Set(group.cases.filter(item => item.status !== 'remaining').map(item => declarations.get(item.title)))
  const functions = new Map(parsed.statements.filter(ts.isFunctionDeclaration).filter(node => node.name).map(node => [node.name.text, node]))
  const candidates = new Set()
  const dependencies = node => {
    if (ts.isIdentifier(node) && functions.has(node.text) && !candidates.has(node.text)) {
      candidates.add(node.text)
      ts.forEachChild(functions.get(node.text), dependencies)
    }
    ts.forEachChild(node, dependencies)
  }
  for (const statement of removed) dependencies(statement)
  let changed = true
  while (changed) {
    changed = false
    const used = new Set()
    const references = node => {
      if (removed.has(node)) return
      if (ts.isIdentifier(node) && !(ts.isFunctionDeclaration(node.parent) && node.parent.name === node)) used.add(node.text)
      ts.forEachChild(node, references)
    }
    references(parsed)
    for (const name of candidates) if (!used.has(name) && !removed.has(functions.get(name))) { removed.add(functions.get(name)); changed = true }
  }
  for (const node of [...removed].sort((a, b) => b.pos - a.pos)) source = source.slice(0, node.getStart(parsed)) + source.slice(node.end)
  return source
}

function adaptSource(file, source) {
  const evidenceDirectory = "(process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative')"
  if (file === 'ae-negative-05-building-session.test.ts') {
    source = replaceOnce(source, "mkdirSync('output/ae-negative/building-oa-artifacts',", `mkdirSync(${evidenceDirectory},`, file)
    source = replaceOnce(source, "writeFileSync('output/ae-negative/building-oa-artifacts/A014-N5-duplicate.json',", `writeFileSync(${evidenceDirectory} + '/A014-N5-duplicate.json',`, file)
  }
  if (file === 'ae-negative-08-triggers-session.test.ts') {
    source = replaceOnce(source, "mkdirSync('output/ae-negative',", `mkdirSync(${evidenceDirectory},`, file)
    source = replaceOnce(source, '`output/ae-negative/08-oa-facts-', '`' + '${' + evidenceDirectory + '}/08-oa-facts-', file)
  }
  if (file === 'ae-negative-25-occupations-session.test.ts') {
    source = replaceOnce(source, 'sourceCard:flow.sourceCard,eventSink}', 'sourceCard:flow.sourceCard,eventSink,actionHooks:session.actionHooks}', file)
  }
  if (file === 'ae-negative-39-native-session.test.ts') {
    source = replaceOnce(source, 'GameState, PlayerState, Resource', 'ActionChoiceOption, GameState, PlayerState, Resource', file)
    source = replaceOnce(source, "function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && 'options' in r.interaction.request ? r.interaction.request.options ?? [] : []; }", "function opts(r: SessionResponse): ActionChoiceOption[] { const i = r.interaction; return i.stateId === 'wait' && (i.request.kind === 'choice' || i.request.kind === 'select-trigger') ? i.request.options : []; }", file)
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
      else if (entry.isFile() || entry.isSymbolicLink()) found.push(path.relative(candidate, file).split(path.sep).join('/'))
    }
  }
  scan(candidate)
  return found.sort()
}

const inputDigest = file => fs.lstatSync(file).isSymbolicLink() ? digest(`symlink\0${fs.readlinkSync(file)}`) : digest(fs.readFileSync(file))

function checkoutFiles() {
  return git('ls-files', '--cached', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean).sort()
    .filter(file => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile())
    .map(file => [file, digest(fs.readFileSync(path.join(root, file)))])
}

function prepare(manifest, output) {
  if (!output || !path.isAbsolute(output)) fail('--output must be an absolute path outside the checkout')
  const suffix = []
  let ancestor = path.resolve(output)
  while (!fs.existsSync(ancestor)) {
    suffix.unshift(path.basename(ancestor))
    ancestor = path.dirname(ancestor)
  }
  output = path.join(fs.realpathSync(ancestor), ...suffix)
  const commonGit = path.resolve(root, git('rev-parse', '--git-common-dir').toString().trim())
  for (const checkout of [root, path.dirname(commonGit)]) {
    const relative = path.relative(fs.realpathSync(checkout), output)
    const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    if (!outside) fail('overlay and evidence must be outside Git')
  }
  if (fs.existsSync(output)) fail('output already exists; select a fresh run directory')
  const candidate = path.join(output, 'candidate')
  const fingerprints = checkoutFiles()
  const tracked = fingerprints.map(([file]) => file)
  for (const file of tracked) {
    const from = path.join(root, file)
    const bytes = fs.readFileSync(from)
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
    write(path.join(candidate, file), adaptSource(group.file, pruneMigratedCases(group, bytes.toString())))
  }
  const helper = 'server/__tests__/_helpers/negative-rule-audit.ts'
  const helperBytes = git('show', `${manifest.source.commit}:${helper}`)
  if (manifest.source.helperSha256 && digest(helperBytes) !== manifest.source.helperSha256) fail('source helper digest mismatch')
  sourceDigests.push([helper, digest(helperBytes)])
  write(path.join(candidate, helper), helperBytes)
  const nativeFiles = nativeFilesFor(manifest)
  const titles = manifest.files.flatMap(group => group.cases.filter(item => item.status === 'remaining').map(item => { const prefix = (item.ancestors ?? []).join(' '); return prefix ? `${item.ancestors.join(' > ')} > ${item.title.slice(prefix.length + 1)}` : item.title }))
  const escaped = titles.map(title => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const setupFiles = ['./shared/cards/__tests__/setup-register-all.ts', './shared/cards/__tests__/setup-listener-purity.ts']
  const projects = []
  if (remainingFiles.length) projects.push({ extends: true, test: { name: 'remaining', include: remainingFiles, testNamePattern: `^(?:${escaped.join('|')})$`, setupFiles, isolate: false } })
  write(path.join(candidate, 'vitest.migration.config.ts'), `import { defineConfig } from 'vitest/config'
import { globSync } from 'glob'
import base from './vitest.config.ts'
const nativeFiles = ${JSON.stringify(nativeFiles)}
const projects = ${JSON.stringify(projects)}
const owners = new Map(nativeFiles.map(file => [file, 0]))
if (nativeFiles.length) for (const project of base.test?.projects ?? []) {
  if (typeof project !== 'object' || !project || !('test' in project)) throw new Error('migration requires explicit native project configuration')
  const settings = project.test ?? {}
  const discovered = new Set(globSync(settings.include ?? [], { cwd: import.meta.dirname, ignore: [...(base.test?.exclude ?? []), ...(settings.exclude ?? [])], nodir: true, posix: true }))
  const include = nativeFiles.filter(file => discovered.has(file))
  if (!include.length) continue
  for (const file of include) owners.set(file, (owners.get(file) ?? 0) + 1)
  projects.push({ ...project, test: { ...settings, include } })
}
for (const [file, count] of owners) if (count !== 1) throw new Error('native target must belong to exactly one normal test project: ' + file)
export default defineConfig({ ...base, test: { ...base.test, projects } })
`)
  const includes = [...remainingFiles, ...nativeFiles]
  json(path.join(candidate, 'tsconfig.migration.json'), { extends: './tsconfig.server.json', compilerOptions: { noUnusedLocals: false, noUnusedParameters: false, incremental: false }, include: includes, exclude: [] })
  const inventory = sourceInventory(candidate)
  const candidateFingerprints = inventory.map(file => [file, inputDigest(path.join(candidate, file))])
  json(path.join(output, 'cases.json'), manifest)
  json(path.join(output, 'assembly.json'), { candidateCommit: git('rev-parse', 'HEAD').toString().trim(), candidateFingerprint: digest(JSON.stringify(fingerprints)), candidateFiles: fingerprints, assembledFiles: candidateFingerprints, assembledFingerprint: digest(JSON.stringify(candidateFingerprints)), sourceInventory: sourceInventory(candidate), runManifestSha256: digest(fs.readFileSync(path.join(output, 'cases.json'))), source: manifest.source, sourceFiles: sourceDigests, remainingFiles, nativeFiles, remainingCases: titles.length, createdAt: new Date().toISOString() })
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
    if (git('rev-parse', 'HEAD').toString().trim() !== assembly.candidateCommit || digest(JSON.stringify(checkoutFiles())) !== assembly.candidateFingerprint) fail('live checkout changed since assembly; prepare a fresh run')
    const runManifest = path.join(output, 'cases.json')
    if (!fs.existsSync(runManifest) || digest(fs.readFileSync(runManifest)) !== assembly.runManifestSha256) fail('run manifest changed since assembly')
    if (JSON.stringify(sourceInventory(candidate)) !== JSON.stringify(assembly.sourceInventory)) fail('candidate source inventory changed since assembly')
    for (const [file, expected] of assembly.assembledFiles) if (inputDigest(path.join(candidate, file)) !== expected) fail(`candidate changed since assembly: ${file}`)
  }
  assertCandidate()
  const types = command(candidate, ['exec', 'tsc', '-p', 'tsconfig.migration.json', '--pretty', 'false'], path.join(output, 'types.log'))
  const files = command(candidate, ['exec', 'tsc', '-p', 'tsconfig.migration.json', '--listFilesOnly', '--pretty', 'false'], path.join(output, 'included-files.log'))
  const behavior = command(candidate, ['exec', 'vitest', 'run', '--config', 'vitest.migration.config.ts', '--reporter=json', `--outputFile=${path.join(output, 'behavior.json')}`], path.join(output, 'behavior.log'), { AGRICOLA_NEGATIVE_RAW: '1', AGRICOLA_NEGATIVE_ARTIFACT_DIR: path.join(output, 'scenario-evidence'), AGRICOLA_NEGATIVE_OUTPUT_DIR: path.join(output, 'scenario-evidence'), AGRICOLA_TEST_EVIDENCE_DIR: path.join(output, 'native-evidence') })
  assertCandidate()
  const included = new Set(fs.readFileSync(path.join(output, 'included-files.log'), 'utf8').split(/\r?\n/).map(file => path.resolve(file)))
  const missingTypeRoots = [...assembly.remainingFiles, ...assembly.nativeFiles].filter(file => !included.has(path.join(candidate, file)))
  const summary = { rawMode: 'strict-expected', typesExit: types, fileInventoryExit: files, behaviorExit: behavior, missingTypeRoots, includedTypeRoots: assembly.remainingFiles.length + assembly.nativeFiles.length - missingTypeRoots.length }
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
  else if (action === 'check-native') {
    const result = checkNative(manifest)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result.typesExit || result.fileInventoryExit || result.missingTypeRoots.length) process.exitCode = 1
  }
  else if (action === 'prepare') process.stdout.write(`${JSON.stringify(prepare(manifest, options.get('output')))}\n`)
  else if (action === 'verify') {
    const result = verify(options.get('output'))
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result.typesExit || result.fileInventoryExit || result.behaviorExit || result.unresolvedSourceCases || result.missingTypeRoots.length) process.exitCode = 1
  } else fail('usage: node scripts/audit-migration.mjs check|check-native|prepare|verify [--manifest file] [--output external-run-directory]')
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
}
