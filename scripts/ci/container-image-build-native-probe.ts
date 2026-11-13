import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { candidateExecution, collectCandidateDiagnostics, executeCandidate, printVerificationOutput } from './candidate-isolation.ts'
import { cleanupImageBuild, imageBuilderCreateCommand } from './container-image-build.ts'

const baseImage = 'node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54'
const dockerfile = `FROM ${baseImage} AS permissions
RUN cp -p /etc/debian_version /tmp/permissions && cmp /etc/debian_version /tmp/permissions
FROM ${baseImage} AS readline
RUN apt-get update && apt-get install -y --no-install-recommends readline-common && dpkg-query -W -f='\${Status}\\n' readline-common | grep -Fx 'install ok installed'
FROM ${baseImage} AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev && dpkg-query -W -f='\${Status}\\n' readline-common | grep -Fx 'install ok installed'
FROM ${baseImage} AS trace
RUN apt-get update && cd /tmp && apt-get download strace libunwind8 readline-common && for archive in ./*.deb; do dpkg-deb -x "$archive" /tmp/probe; done
RUN LD_LIBRARY_PATH=/tmp/probe/usr/lib/x86_64-linux-gnu /tmp/probe/usr/bin/strace -e trace=chmod,fchmod,fchmodat,getxattr,lgetxattr,fgetxattr,setxattr,lsetxattr,fsetxattr cp -p /tmp/probe/usr/share/readline/inputrc /etc/inputrc && cmp /tmp/probe/usr/share/readline/inputrc /etc/inputrc
`

type Observation = { variant: string; step: string; exitCode: number | null; error?: string; elapsedMs: number; evidence: string }

function probe(): void {
  if (process.getuid?.() !== 61000 || process.arch !== 'x64' || process.env.CI !== 'true'
    || process.env.DOCKER_HOST !== 'unix:///run/user/61000/docker.sock') throw new Error('Probe requires the isolated native AMD64 candidate')
  const root = mkdtempSync(join(tmpdir(), 'oa-native-image-probe-'))
  const context = join(root, 'context'), dockerConfig = join(root, 'docker')
  mkdirSync(context); mkdirSync(dockerConfig); writeFileSync(join(context, 'Dockerfile'), dockerfile)
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, USER: 'oa-candidate', LANG: 'C.UTF-8',
    DOCKER_HOST: process.env.DOCKER_HOST, DOCKER_CONFIG: dockerConfig }
  const observations: Observation[] = []
  const run = (variant: string, step: string, program: string, args: string[], timeout = 240_000): number | null => {
    const started = Date.now()
    const result = spawnSync(program, args, { env, encoding: 'utf8', timeout, maxBuffer: 2 * 1024 * 1024 })
    const output = result.stdout + result.stderr
    const keyLines = output.split('\n').filter(line => /preserving permissions|Invalid argument|[fl]?getxattr\(|[fl]?setxattr\(|[f]?chmod|install ok installed|snapshotter|process-mode|BuildKit version|Docker daemon|SecurityOptions|KernelVersion|ERROR|error:/.test(line)).join('\n')
    const observation = { variant, step, exitCode: result.status, ...(result.error ? { error: result.error.message } : {}),
      elapsedMs: Date.now() - started, evidence: (keyLines || output).slice(-12_000) }
    observations.push(observation); printVerificationOutput(JSON.stringify(observation))
    return result.status
  }
  let productionPassed = false, nativePassed = false
  try {
    const info = execFileSync('docker', ['info', '--format', '{{json .SecurityOptions}} {{.Architecture}} {{.ServerVersion}} {{.Driver}} {{json .DriverStatus}}'], { env, encoding: 'utf8', timeout: 15_000 })
    if (!info.includes('name=rootless') || !info.includes('29.9.3') || !info.includes('overlayfs')) throw new Error(`Unexpected probe daemon: ${info.trim()}`)
    run('environment', 'native', 'docker', ['info', '--format', '{{json .SecurityOptions}} KernelVersion={{.KernelVersion}} Architecture={{.Architecture}} Docker={{.ServerVersion}} Driver={{.Driver}} Status={{json .DriverStatus}}'])
    run('environment', 'versions', 'docker', ['version', '--format', '{{json .Server.Components}}'])
    run('environment', 'buildx', 'docker', ['buildx', 'version'])
    run('environment', 'client-uid-map', '/bin/cat', ['/proc/self/uid_map'])
    for (const variant of ['production', 'native']) {
      try {
        const create = imageBuilderCreateCommand() + (variant === 'native' ? ' --buildkitd-flags=--oci-worker-snapshotter=native' : '')
        if (run(variant, 'create', '/bin/bash', ['-euo', 'pipefail', '-c', create]) !== 0) continue
        if (run(variant, 'bootstrap', 'docker', ['buildx', 'inspect', '--bootstrap', 'oa-image']) !== 0) continue
        for (const target of ['permissions', 'readline', 'dependencies', 'trace']) {
          run(variant, target, 'docker', ['buildx', 'build', '--builder', 'oa-image', '--progress=plain', '--no-cache',
            '--platform', 'linux/amd64', '--provenance=false', '--sbom=false', '--target', target, '--output', 'type=cacheonly', context])
        }
      } finally { run(variant, 'cleanup', 'docker', ['buildx', 'rm', '--force', 'oa-image'], 30_000) }
    }
    const production = observations.filter(observation => observation.variant === 'production')
    productionPassed = production.length === 7 && production.every(observation => observation.exitCode === 0)
    const native = observations.filter(observation => observation.variant === 'native')
    nativePassed = native.length === 7 && native.every(observation => observation.exitCode === 0)
  } finally {
    const destination = join(process.cwd(), 'output/verification/native-image-probe.json')
    mkdirSync(join(process.cwd(), 'output/verification'), { recursive: true })
    writeFileSync(destination, JSON.stringify({ diagnosticOnly: true, candidateUid: process.getuid?.(), baseImage, dockerfile,
      productionCreateCommand: imageBuilderCreateCommand(), productionPassed, nativePassed, observations }, null, 2) + '\n')
    rmSync(root, { recursive: true, force: true })
  }
  if (!productionPassed || !nativePassed) throw new Error('A builder failed the native probe; comparison is retained, no image was published')
}

function runIsolated(): void {
  const execution = candidateExecution()
  execFileSync('sudo', ['-n', 'systemctl', 'set-property', '--runtime', 'user-61000.slice', 'MemoryMax=6G', 'MemorySwapMax=0', 'CPUQuota=200%', 'TasksMax=768'])
  const limits = execFileSync('systemctl', ['show', 'user-61000.slice', '-p', 'MemoryMax', '-p', 'MemorySwapMax', '-p', 'CPUQuotaPerSecUSec', '-p', 'TasksMax'], { encoding: 'utf8' }).split('\n')
  if (!['MemoryMax=6442450944', 'MemorySwapMax=0', 'CPUQuotaPerSecUSec=2s', 'TasksMax=768'].every(limit => limits.includes(limit))) throw new Error('Probe limits differ from the image producer')
  let status: number
  try {
    status = executeCandidate(execution, '/usr/bin/timeout', ['--signal=TERM', '--kill-after=10s', '1080', execution.node,
      join(execution.work, 'scripts/ci/container-image-build-native-probe.ts'), 'probe'], 'native-image-probe')
  } finally {
    cleanupImageBuild()
    collectCandidateDiagnostics(execution.work, execution.privateDirectory)
  }
  const receipt = join(execution.privateDirectory, 'output/verification/native-image-probe.json')
  printVerificationOutput(readFileSync(receipt, 'utf8'))
  if (status !== 0) throw new Error('Native build probe failed; inspect the bounded diagnostic receipt')
}

try {
  if (process.argv[2] === 'probe') probe()
  else if (process.argv[2] === 'run') runIsolated()
  else throw new Error('Usage: container-image-build-native-probe.ts run|probe')
} catch (error) { printVerificationOutput(error instanceof Error ? error.message : 'Native image probe failed', 'stderr'); process.exitCode = 1 }
