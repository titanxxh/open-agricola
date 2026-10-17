import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { withOwnedOperation } from './control.mjs'
import { assertCommittedSource } from './committed-source.mjs'

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }) }
const fail = message => { throw new Error(message) }
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim()
const safeTarget = file => typeof file === 'string' && /^server\/.+\.test\.ts$/.test(file) && !file.includes('\\') && path.posix.normalize(file) === file && !file.split('/').includes('..')
const inside = (base, file) => { const relative = path.relative(base, file); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) }

function outputDirectory(root, output) {
  if (typeof output !== 'string' || !path.isAbsolute(output)) fail('validation output must be an absolute new directory outside Git')
  let ancestor = output
  const suffix = []
  while (!fs.existsSync(ancestor)) { suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor) }
  const resolved = path.join(fs.realpathSync(ancestor), ...suffix)
  if (fs.existsSync(resolved)) fail('validation output already exists')
  const common = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir')
  const worktrees = git(root, 'worktree', 'list', '--porcelain').split('\n').filter(line => line.startsWith('worktree ')).map(line => line.slice(9))
  if ([common, ...worktrees].some(base => inside(fs.realpathSync(base), resolved)) || spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: ancestor, stdio: 'ignore' }).status === 0) fail('validation output must be outside every Git checkout')
  return resolved
}

function jsonFiles(directory) {
  if (!fs.existsSync(directory)) return []
  const found = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) fail('evidence directory contains a symlink')
    if (entry.isDirectory()) found.push(...jsonFiles(file))
    else if (entry.isFile() && entry.name.endsWith('.json')) found.push(file)
    if (found.length > 10000) fail('evidence directory exceeds the file bound')
  }
  return found
}

function expectRaw(summary, responsibilities) {
  const zero = ['typesExit', 'fileInventoryExit', 'behaviorExit', 'failed', 'pending', 'todo', 'unresolvedSourceCases']
  if (summary.rawMode !== 'strict-expected' || zero.some(field => summary[field] !== 0) || !Array.isArray(summary.missingTypeRoots) || summary.missingTypeRoots.length || summary.coveredSourceCases !== responsibilities || summary.tests !== summary.passed || !(summary.passed > 0) || !(summary.includedTypeRoots > 0)) fail('RAW responsibility, strict or behavior proof is incomplete')
}

function passingTargets(report, targets, cases, root) {
  if (!(report.numTotalTests > 0) || report.numTotalTests !== report.numPassedTests || report.numFailedTests !== 0 || report.numPendingTests !== 0 || (report.numTodoTests ?? 0) !== 0 || !Array.isArray(report.testResults)) fail('whole-target tests did not all pass')
  const files = new Map()
  for (const suite of report.testResults) {
    const file = path.relative(root, suite.name).replaceAll(path.sep, '/')
    if (files.has(file) || !suite.assertionResults?.length || suite.assertionResults.some(test => test.status !== 'passed') || new Set(suite.assertionResults.map(test => test.fullName)).size !== suite.assertionResults.length) fail('whole-target report has duplicate or incomplete tests')
    files.set(file, suite.assertionResults)
  }
  if ([...files.values()].reduce((count, tests) => count + tests.length, 0) !== report.numTotalTests) fail('whole-target test totals differ from actual assertions')
  if (JSON.stringify([...files.keys()].sort()) !== JSON.stringify(targets)) fail('whole-target report did not execute exactly the complete target set')
  for (const item of cases) if (files.get(item.targetFile)?.filter(test => test.fullName === item.targetTitle && test.status === 'passed').length !== 1) fail(`mapped responsibility was not executed exactly once: ${item.title}`)
  return { tests: report.numTotalTests, passed: report.numPassedTests, targets: files.size, sourceResponsibilitiesActualPassed: cases.length }
}

function sourceFiles(root) {
  return git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean).sort().filter(file => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile()).map(file => [file, sha(fs.readFileSync(path.join(root, file)))])
}

function rawMapping(root, raw, cases, responsibilities) {
  const summary = read(path.join(raw, 'summary.json'))
  expectRaw(summary, responsibilities)
  const candidate = path.join(raw, 'candidate')
  const report = read(path.join(raw, 'behavior.json'))
  const included = new Set(fs.readFileSync(path.join(raw, 'included-files.log'), 'utf8').split(/\r?\n/).filter(Boolean).map(file => path.resolve(file)))
  for (const item of cases) {
    const suites = report.testResults.filter(suite => path.relative(candidate, suite.name).replaceAll(path.sep, '/') === item.targetFile)
    const tests = suites.flatMap(suite => suite.assertionResults ?? [])
    if (suites.length !== 1 || !tests.length || tests.some(test => test.status !== 'passed') || tests.filter(test => test.fullName === item.targetTitle && test.status === 'passed').length !== 1 || !included.has(path.join(candidate, item.targetFile))) fail(`RAW mapped target is missing, incomplete or absent from strict inputs: ${item.title}`)
    if (sha(fs.readFileSync(path.join(root, item.targetFile))) !== sha(fs.readFileSync(path.join(candidate, item.targetFile)))) fail('RAW mapped target bytes drifted')
  }
  if (jsonFiles(path.join(raw, 'native-evidence')).length) fail('successful native RAW tests emitted full-state evidence')
  return { summary, sourceResponsibilitiesActualPassed: cases.length }
}

export async function runValidation(root, options) {
  const configFile = options.get('config')
  if (!configFile) fail('validation requires --config with a fixed frozen-run configuration')
  const config = read(configFile)
  const worktree = fs.realpathSync(git(config.worktree ?? root, 'rev-parse', '--show-toplevel'))
  if (git(worktree, 'rev-parse', '--path-format=absolute', '--git-common-dir') !== git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir')) fail('validation worktree belongs to another Git repository')
  if (!/^[a-f0-9]{40}$/.test(config.head) || typeof config.batch !== 'string' || !config.batch.trim() || typeof config.workspace !== 'string' || !config.assignment) fail('frozen validation requires head, batch, workspace and an immutable assignment')
  const unchanged = () => assertCommittedSource({ worktree, head: config.head })
  unchanged()
  const output = outputDirectory(worktree, config.output)
  const manifest = read(path.join(worktree, 'scripts/audit-migration/cases.json'))
  const cases = manifest.files.flatMap(group => group.cases.filter(item => item.batch === config.batch))
  if (!cases.length || cases.some(item => !['migrated', 'existing-coverage'].includes(item.status) || !safeTarget(item.targetFile) || typeof item.targetTitle !== 'string' || !item.targetTitle || (item.status === 'existing-coverage' && !item.rationale?.trim()))) fail('batch must have fully mapped native responsibilities')
  const extra = config.extraTargets ?? []
  if (!Array.isArray(extra) || extra.some(file => !safeTarget(file))) fail('extraTargets must contain canonical server test paths')
  const targets = [...new Set([...cases.map(item => item.targetFile), ...(manifest.nativeScope ?? []).map(item => item.file), ...extra])].sort()
  for (const file of targets) if (!safeTarget(file) || !fs.existsSync(path.join(worktree, file)) || !inside(worktree, fs.realpathSync(path.join(worktree, file)))) fail(`invalid or missing native target: ${file}`)
  const environment = { ...process.env }
  for (const key of ['NODE_OPTIONS', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete environment[key]
  const databaseFile = config.services?.databaseEnv
  if (typeof databaseFile !== 'string' || !path.isAbsolute(databaseFile)) fail('services.databaseEnv must name the local TEST_DATABASE_URL file')
  const database = fs.readFileSync(databaseFile, 'utf8').split(/\r?\n/).find(line => /^(?:export\s+)?TEST_DATABASE_URL=/.test(line))?.replace(/^(?:export\s+)?TEST_DATABASE_URL=/, '').replace(/^(['"])(.*)\1$/, '$2')
  try { const url = new URL(database ?? ''); if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length <= 1) fail('invalid database configuration') } catch { fail('local TEST_DATABASE_URL configuration is missing or invalid') }
  environment.TEST_DATABASE_URL = database
  environment.SHARED_DATA_DIR = path.join(output, 'services-data')
  environment.AGRICOLA_TEST_EVIDENCE_DIR = path.join(output, 'native-evidence')
  const raw = path.join(output, 'raw')
  const receipt = { version: 1, head: config.head, tree: git(worktree, 'rev-parse', 'HEAD^{tree}'), batch: config.batch, targets, steps: [], status: 'running' }
  const command = (stage, executable, args) => {
    const result = spawnSync(executable, args, { cwd: worktree, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    fs.writeFileSync(path.join(output, `${stage}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`, { flag: 'wx' })
    if (result.error || result.status !== 0) fail(`${stage} failed; inspect ${path.join(output, `${stage}.log`)}`)
    return result.stdout ?? ''
  }
  const stage = async (name, callback) => withOwnedOperation({ root: worktree, workspace: config.workspace, assignment: config.assignment, operation: `local-validation:${name}` }, async claim => {
    if (claim.head !== config.head) fail('assignment head differs from the frozen validation head')
    unchanged()
    fs.mkdirSync(output, { recursive: true })
    const result = await callback()
    unchanged()
    const step = { name, status: 'passed', result }
    write(path.join(output, `${name}.json`), step)
    receipt.steps.push(step)
    return result
  })
  try {
    await stage('frozen-native', () => {
      const report = path.join(output, 'focus.json')
      command('frozen-native', 'pnpm', ['exec', 'vitest', 'run', ...targets, '--reporter=json', `--outputFile=${report}`])
      const result = passingTargets(read(report), targets, cases, worktree)
      if (jsonFiles(path.join(output, 'native-evidence')).length) fail('successful native tests emitted full-state evidence')
      return result
    })
    await stage('frozen-strict', () => {
      const file = path.join(output, 'strict-config.json')
      write(file, { extends: path.join(worktree, 'tsconfig.server.json'), compilerOptions: { noEmit: true, incremental: false, noUnusedLocals: false, noUnusedParameters: false, typeRoots: [path.join(worktree, 'node_modules/@types')] }, files: targets.map(target => path.join(worktree, target)), include: [], exclude: [] })
      const stdout = command('frozen-strict', 'pnpm', ['exec', 'tsc', '--project', file, '--pretty', 'false', '--listFiles'])
      const included = stdout.split(/\r?\n/).filter(line => path.isAbsolute(line) && fs.existsSync(line) && fs.statSync(line).isFile()).map(line => fs.realpathSync(line))
      if (!included.length || new Set(included).size !== included.length || targets.some(target => !included.includes(fs.realpathSync(path.join(worktree, target))))) fail('strict compiler input inventory is incomplete or duplicated')
      write(path.join(output, 'strict-inputs.json'), included.map(file => ({ file, sha256: sha(fs.readFileSync(file)) })))
      return { roots: targets.length, actualFiles: included.length, diagnostics: 0, missingRoots: [] }
    })
    await stage('frozen-check-native', () => {
      const stdout = command('frozen-check-native', process.execPath, ['scripts/audit-migration.mjs', 'check-native'])
      const result = JSON.parse(stdout.trim().split('\n').at(-1))
      if (result.typesExit !== 0 || result.fileInventoryExit !== 0 || !Array.isArray(result.missingTypeRoots) || result.missingTypeRoots.length) fail('normal native type gate is incomplete')
      if (result.reportDirectory) for (const name of ['types.log', 'included-files.log', 'policy-partition.json']) if (fs.existsSync(path.join(result.reportDirectory, name))) {
        fs.mkdirSync(path.join(output, 'native-types'), { recursive: true })
        fs.copyFileSync(path.join(result.reportDirectory, name), path.join(output, 'native-types', name), fs.constants.COPYFILE_EXCL)
      }
      return result
    })
    await stage('raw-prepare', () => {
      command('raw-prepare', process.execPath, ['scripts/audit-migration.mjs', 'prepare', '--output', raw])
      const assembly = read(path.join(raw, 'assembly.json'))
      if (assembly.candidateCommit !== config.head) fail('RAW assembly did not freeze the expected head')
      return { raw, candidateCommit: assembly.candidateCommit, candidateFingerprint: assembly.candidateFingerprint }
    })
    await stage('raw-verify', () => {
      command('raw-verify', process.execPath, ['scripts/audit-migration.mjs', 'verify', '--output', raw])
      return rawMapping(worktree, raw, cases, manifest.source.cases)
    })
    await stage('prepush', () => {
      command('prepush', 'pnpm', ['verify', 'prepush'])
      const prepush = read(path.join(worktree, 'output/verification/prepush.json'))
      if (prepush.mode !== 'prepush' || prepush.status !== 'passed' || prepush.head !== config.head || JSON.stringify(prepush.steps?.map(step => step.name)) !== JSON.stringify(['test-services', 'fast', 'lint']) || prepush.steps.some(step => step.status !== 'passed' || step.exitCode !== 0)) fail('prepush did not prove the complete fast/lint gates')
      write(path.join(output, 'prepush-record.json'), prepush)
      return { head: prepush.head, status: prepush.status, fingerprint: prepush.fingerprint }
    })
    await stage('local-proof', () => {
      const stdout = command('local-proof', 'pnpm', ['verify', 'status'])
      if (!stdout.includes('[verify] prepush: current / passed')) fail('prepush fingerprint is stale')
      if (JSON.stringify(read(path.join(worktree, 'output/verification/prepush.json'))) !== JSON.stringify(read(path.join(output, 'prepush-record.json')))) fail('current prepush differs from the saved receipt')
      const assembly = read(path.join(raw, 'assembly.json'))
      const files = sourceFiles(worktree)
      if (assembly.candidateCommit !== config.head || JSON.stringify(files) !== JSON.stringify(assembly.candidateFiles) || sha(JSON.stringify(files)) !== assembly.candidateFingerprint) fail('RAW candidate bytes or inventory differ from the frozen source')
      expectRaw(read(path.join(raw, 'summary.json')), manifest.source.cases)
      return { head: config.head, tree: receipt.tree, raw, prepush: path.join(output, 'prepush-record.json'), rawCandidateFingerprint: assembly.candidateFingerprint, remoteChecked: false }
    })
    receipt.status = 'passed'
    write(path.join(output, 'final.json'), receipt)
    return { ...receipt, output, raw, prepush: path.join(output, 'prepush-record.json'), remoteChecked: false }
  } catch (error) {
    if (fs.existsSync(output)) write(path.join(output, 'final.json'), { ...receipt, status: 'failed', error: error.message })
    throw error
  }
}
