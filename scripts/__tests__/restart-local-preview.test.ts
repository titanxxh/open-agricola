import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const script = readFileSync('restart-local.sh', 'utf8')

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
    const resetScanner = script.match(/dev_rooms_without_variant\(\) \{[\s\S]*?^\}/m)?.[0] ?? ''
    expect(resetScanner).toContain('state.enableSnakeOpening !== true')
  })

  it('does not require incomplete-minor startup options from serialized Moor game state', () => {
    const resetScanner = script.match(/dev_rooms_without_variant\(\) \{[\s\S]*?^\}/m)?.[0] ?? ''
    expect(resetScanner).toContain('state.enableFarmersOfTheMoor !== true')
    expect(resetScanner).not.toContain('state.allowIncompleteFarmersOfTheMoorMinorDeal')
    expect(script).toContain('dev_rooms_without_variant moor')
  })
})
