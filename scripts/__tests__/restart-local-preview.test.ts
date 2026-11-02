import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const scanner = readFileSync('scripts/local-rooms.ts', 'utf8')
const script = readFileSync('restart-local.sh', 'utf8')
const argumentsBlock = script.slice(script.indexOf('KILL_ONLY=0'), script.indexOf('\ncd "$SCRIPT_DIR"'))
const bindingBlock = script.slice(script.indexOf('if [ "$INTRANET_ENABLED" -eq 1 ]; then'), script.indexOf('\necho "Preparing local dependencies..."'))
const publicApiBlock = script.slice(script.indexOf('echo "Binding to:'), script.indexOf('\necho "Stopping existing processes..."'))

function resolveBinding(args: string[], tailscaleMode = 'online') {
  return spawnSync('bash', ['-c', `
    set -euo pipefail
    tailscale() {
      [ "$*" = 'ip -4' ] || return 1
      case "$TEST_TAILSCALE_MODE" in
        online) echo '100.64.0.42' ;;
        empty) return 0 ;;
        *) return 1 ;;
      esac
    }
    command() {
      if [ "$*" = '-v tailscale' ] && [ "$TEST_TAILSCALE_MODE" = missing ]; then return 1; fi
      builtin command "$@"
    }
    get_lan_ip() { echo '192.0.2.42'; }
    ${argumentsBlock}
    ${bindingBlock}
    ${publicApiBlock}
    echo "PUBLIC_API_BASE=$PUBLIC_API_BASE"
  `, 'restart-binding-test', ...args], {
    encoding: 'utf8',
    env: { ...process.env, TEST_TAILSCALE_MODE: tailscaleMode, PUBLIC_API_BASE: 'https://production.example', BACKEND_PORT: '5175' },
  })
}

describe('restart-local network binding', () => {
  it('binds preview and advertises the local API on the Tailscale IPv4', () => {
    const result = resolveBinding(['--preview', '--tailscale'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Binding to: 100.64.0.42 (Tailscale)')
    expect(result.stdout).toContain('PUBLIC_API_BASE=http://100.64.0.42:5175')
  })

  it('keeps loopback as the default', () => {
    const result = resolveBinding([])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Binding to: 127.0.0.1')
  })

  it('preserves LAN binding', () => {
    const result = resolveBinding(['--intranet'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Binding to: 192.0.2.42 (intranet)')
  })

  it('rejects conflicting network flags', () => {
    const result = resolveBinding(['--intranet', '--tailscale'])
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('--intranet and --tailscale cannot be combined')
  })

  it.each(['missing', 'offline', 'empty'])('rejects a %s Tailscale address', mode => {
    const result = resolveBinding(['--tailscale'], mode)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('--tailscale requires a running Tailscale client with an IPv4 address')
    expect(result.stdout).not.toContain('Binding to:')
  })
})

describe('restart-local preview mode', () => {
  it('documents and parses --preview', () => {
    expect(script).toContain('[--preview]')
    expect(script).toContain('--preview')
    expect(script).toMatch(/PREVIEW_ENABLED=0/)
    expect(script).toMatch(/--preview\)\s*PREVIEW_ENABLED=1/s)
  })

  it('builds the frontend and serves dist through vite preview', () => {
    expect(script).toContain('VITE_API_BASE="http://$BIND_IP:$BACKEND_PORT"')
    expect(script.match(/VITE_WS_BASE="ws:\/\/\$BIND_IP:\$BACKEND_PORT\/ws"/g)).toHaveLength(3)
    expect(script).toMatch(/VITE_ENABLE_DEV_AUTH_SHORTCUTS=1[\s\\]+"?\$PNPM_BIN"? run build/)
    expect(script).toContain('"$PNPM_BIN" run build')
    expect(script).toContain('"$FRONTEND_BIN" preview')
  })

  it('binds to loopback by default and only reads the LAN IP with --intranet', () => {
    expect(script).toContain('[--intranet]')
    expect(script).toMatch(/INTRANET_ENABLED=0/)
    expect(script).toMatch(/--intranet\)\s*INTRANET_ENABLED=1/s)
    expect(script).toContain('BIND_IP="127.0.0.1"')
    expect(script).toMatch(/if \[ "\$INTRANET_ENABLED" -eq 1 \]; then\s*\n\s*BIND_IP=\$\(get_lan_ip\)/)
    expect(script).not.toContain('LAN_IP=$(get_lan_ip)\nif')
  })

  it('does not reference any reference image source', () => {
    expect(script).not.toContain('x.boardgamearena.net')
    expect(script).not.toContain('BGA_CDN_BASE_URL')
    expect(script).not.toContain('BGA_IMAGE_DIR')
    expect(script).not.toContain('bga-img')
  })

  it('documents and wires --moor for fixed dev rooms', () => {
    expect(script).toContain('[--parents] [--seasons] [--moor] [--draft] [--preview]')
    expect(script).toContain('--moor')
    expect(script).toMatch(/MOOR_ENABLED=0/)
    expect(script).toMatch(/--moor\)\s*MOOR_ENABLED=1/s)
    expect(script).toContain('DEV_ENABLE_FARMERS_OF_THE_MOOR="$([ "$MOOR_ENABLED" -eq 1 ] && echo true || echo false)"')
    expect(script).toContain('DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL="$([ "$MOOR_ENABLED" -eq 1 ] && echo true || echo false)"')
    expect(script).toContain('&enableFarmersOfTheMoor=true&allowIncompleteFarmersOfTheMoorMinorDeal=true')
  })

  it('documents and wires --snake for fixed dev rooms', () => {
    expect(script).toContain('[--snake]')
    expect(script).toMatch(/SNAKE_ENABLED=0/)
    expect(script).toMatch(/--snake\)\s*SNAKE_ENABLED=1/s)
    expect(script).toContain('DEV_ENABLE_SNAKE_OPENING="$([ "$SNAKE_ENABLED" -eq 1 ] && echo true || echo false)"')
    expect(script).toContain('&enableSnakeOpening=true')
    expect(script).toContain('dev_rooms_without_variant snake')
    const resetScanner = scanner
    expect(resetScanner).toContain('state?.enableSnakeOpening')
  })

  it('does not require incomplete-minor startup options from serialized Moor game state', () => {
    const resetScanner = scanner
    expect(resetScanner).toContain('state?.enableFarmersOfTheMoor')
    expect(resetScanner).not.toContain('state.allowIncompleteFarmersOfTheMoorMinorDeal')
    expect(script).toContain('dev_rooms_without_variant moor')
  })
})
