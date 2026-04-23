# UI Overhaul — Batch 3: Game Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the game-page wide-screen layout: 3 columns (left action board / center player-tabs farm / right top score panel + right bottom action log). Add 6 new board components (PlayerTabs, PlayerFarmPanel, ScorePanel, ActionLog, StageBar, CardCarousel). Replace grass tile background with wood-dark token. Apply Level-3 tableau styling to all in-game panels. Make floating control pills move into the existing `.interaction-bar`.

**Architecture:** Three-column CSS grid, with media queries collapsing to 2-col then 1-col on smaller viewports. Center column uses player tabs to switch farm view (replaces the spec-deferred "opponent farm thumbnail" — better UX). Right column is split: top is `ScorePanel` (parchment card with all-player score breakdown), bottom is `ActionLog` (existing log enhanced with icons + player avatars).

**Tech Stack:** React 19 + TypeScript, Vite, Vitest. Uses Batch 1 tokens + Batch 2 components.

**Spec:** `docs/superpowers/specs/2026-04-23-ui-overhaul-design.md` — Section 7

**Depends on:** Batch 2 merged.

---

## Pre-flight

- [ ] **Step 1: Verify Batch 2 merged**

```bash
git log --oneline -8 | grep -i 'batch.2\|non-game'
```

- [ ] **Step 2: Take Batch 2 baseline**

```bash
mkdir -p output/tmp/batch-2-merged-baseline
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-2-merged-baseline node .tmp-shoot.mjs
```

- [ ] **Step 3: Inspect current GameContainerApi.tsx structure**

```bash
wc -l client/app/GameContainerApi.tsx
grep -n 'className=' client/app/GameContainerApi.tsx | head -40
grep -n 'state.players\|state.scores\|state.log\|state.currentRound\|state.stages' client/app/GameContainerApi.tsx | head -20
```

Capture: where the `.game-layout` lives, where the existing player-tab chips live (P1/P2 in the screenshot), where the action log renders, what fields exist on `state`.

- [ ] **Step 4: Check shared types**

```bash
grep -n 'currentRound\|stages\|scores\|log:\|occupations\|minorImprovements' shared/game/types.ts | head -20
```

Confirm field names. The plan below uses `state.currentRound`, `state.players[i].score`, `state.players[i].occupations`, `state.players[i].minorImprovements`, `state.log`. Adjust if names differ.

---

## Task 1: PlayerTabs Component

**Files:**
- Create: `client/components/board/PlayerTabs.tsx`
- Create: `client/components/board/__tests__/PlayerTabs.test.tsx`
- Modify: `client/styles/pages/game.css`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayerTabs, type PlayerSummary } from '../PlayerTabs'

const PLAYERS: PlayerSummary[] = [
  { id: 'p1', name: 'You', score: 12, isYou: true, isCurrent: true, color: '#aabbcc' },
  { id: 'p2', name: 'AI', score: 9, isYou: false, isCurrent: false, color: '#ccbbaa' },
]

describe('PlayerTabs', () => {
  it('renders one tab per player', () => {
    render(<PlayerTabs players={PLAYERS} active="p1" onChange={() => {}} />)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })
  it('marks the active tab', () => {
    const { container } = render(<PlayerTabs players={PLAYERS} active="p1" onChange={() => {}} />)
    expect(container.querySelector('[data-player="p1"][aria-selected="true"]')).toBeInTheDocument()
    expect(container.querySelector('[data-player="p2"][aria-selected="true"]')).not.toBeInTheDocument()
  })
  it('shows ☆ marker for "you"', () => {
    render(<PlayerTabs players={PLAYERS} active="p1" onChange={() => {}} />)
    const youTab = screen.getByRole('tab', { name: /you/i })
    expect(youTab.textContent).toContain('☆')
  })
  it('highlights the current-turn player', () => {
    const { container } = render(<PlayerTabs players={PLAYERS} active="p2" onChange={() => {}} />)
    expect(container.querySelector('[data-player="p1"].is-current-turn')).toBeInTheDocument()
  })
  it('calls onChange when clicked', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<PlayerTabs players={PLAYERS} active="p1" onChange={fn} />)
    await user.click(screen.getByRole('tab', { name: /AI/i }))
    expect(fn).toHaveBeenCalledWith('p2')
  })
  it('shows score per tab', () => {
    render(<PlayerTabs players={PLAYERS} active="p1" onChange={() => {}} />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement**

```tsx
export interface PlayerSummary {
  id: string
  name: string
  score?: number
  color?: string
  isYou?: boolean
  isCurrent?: boolean
}

interface Props {
  players: PlayerSummary[]
  active: string
  onChange: (id: string) => void
}

export function PlayerTabs({ players, active, onChange }: Props) {
  return (
    <div role="tablist" className="player-tabs">
      {players.map((p) => (
        <button
          key={p.id}
          role="tab"
          data-player={p.id}
          aria-selected={p.id === active}
          className={[
            'player-tabs__tab',
            p.id === active && 'is-active',
            p.isCurrent && 'is-current-turn',
            p.isYou && 'is-you',
          ].filter(Boolean).join(' ')}
          onClick={() => onChange(p.id)}
          style={p.color ? { '--player-color': p.color } as React.CSSProperties : undefined}
        >
          <span className="player-tabs__avatar" aria-hidden>{p.name.slice(0, 1).toUpperCase()}</span>
          <span className="player-tabs__name">
            {p.isYou && <span aria-label="you">☆</span>} {p.name}
          </span>
          {p.score !== undefined && <span className="player-tabs__score">{p.score}</span>}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Style (append to game.css)**

```css
/* ══════════ PlayerTabs ══════════ */
.player-tabs {
  display: flex; gap: 6px;
  padding: 6px;
  background: var(--bg-parchment);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-paper);
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.player-tabs__tab {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.5);
  cursor: pointer;
  color: var(--color-text);
  font-size: var(--fs-body);
  flex: 1; min-width: 100px;
  transition: all 0.15s;
}
.player-tabs__tab.is-active {
  background: var(--color-accent-bg);
  border-color: var(--color-accent-strong);
  font-weight: 700;
  box-shadow: var(--btn-emboss-secondary);
}
.player-tabs__tab.is-current-turn {
  border-width: 2px;
  border-color: var(--color-accent-strong);
}
.player-tabs__avatar {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--player-color, var(--color-primary));
  color: #fff;
  border-radius: var(--radius-pill);
  font-weight: 700;
}
.player-tabs__score {
  margin-left: auto;
  background: var(--color-accent-strong);
  color: #fff;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-weight: 700;
  font-size: var(--fs-small);
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm exec vitest run client/components/board/__tests__/PlayerTabs.test.tsx
pnpm exec tsc --noEmit
git add client/components/board/PlayerTabs.tsx \
        client/components/board/__tests__/PlayerTabs.test.tsx \
        client/styles/pages/game.css
git commit -m "feat(client/board): PlayerTabs component with score + current-turn marker"
```

---

## Task 2: PlayerFarmPanel Component (extracts existing render logic)

**Files:**
- Create: `client/components/board/PlayerFarmPanel.tsx`
- Modify: `client/app/GameContainerApi.tsx` (extract farm-render JSX)

This is a refactor of existing rendering, not new logic. The component takes `state` + `viewedPlayerId` and renders that player's farm grid + occupations + minor improvements.

- [ ] **Step 1: Create PlayerFarmPanel by lifting existing JSX**

Find the JSX in `GameContainerApi.tsx` that renders the current player's farm (`.player-farm`, `.farm-grid` markup). Move it into:

```tsx
import type { GameState } from '../../../shared/game/types'

interface Props {
  state: GameState
  viewedPlayerId: string
}

export function PlayerFarmPanel({ state, viewedPlayerId }: Props) {
  const player = state.players.find((p) => p.id === viewedPlayerId)
  if (!player) return null
  // — paste lifted farm-grid + cards JSX here —
  return (
    <div className="player-farm-panel">
      {/* farm grid */}
      {/* occupations CardCarousel — added in Task 6 */}
      {/* minor improvements CardCarousel — added in Task 6 */}
    </div>
  )
}
```

- [ ] **Step 2: Wire in GameContainerApi.tsx**

```tsx
const [viewedPlayerId, setViewedPlayerId] = useState(state.players[0]?.id ?? '')
useEffect(() => {
  // Default to "you" when state changes
  const me = state.players.find((p) => p.id === myPlayerId)
  if (me) setViewedPlayerId(me.id)
}, [myPlayerId])
```

- [ ] **Step 3: Verify**

```bash
pnpm test
pnpm exec tsc --noEmit
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-3-task-2 node .tmp-shoot.mjs
```

Expected: game page looks the same (extraction only, no visual change). Game page might fail to load if backend isn't reachable — that's OK at this stage; visual verification happens at Batch 3 end.

- [ ] **Step 4: Commit**

```bash
git add client/components/board/PlayerFarmPanel.tsx client/app/GameContainerApi.tsx
git commit -m "refactor(client/board): extract PlayerFarmPanel from GameContainerApi"
```

---

## Task 3: ScorePanel Component

**Files:**
- Create: `client/components/board/ScorePanel.tsx`
- Create: `client/components/board/__tests__/ScorePanel.test.tsx`
- Modify: `client/styles/pages/game.css`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScorePanel, type PlayerScoreRow } from '../ScorePanel'

const ROWS: PlayerScoreRow[] = [
  { id: 'p1', name: 'You', isYou: true, total: 12, breakdown: { fields: 3, animals: 5, food: 4, family: 3, cards: 2 } },
  { id: 'p2', name: 'AI', total: 9, breakdown: { fields: 2, animals: 3, food: 2, family: 2, cards: 0 } },
]

describe('ScorePanel', () => {
  it('renders one row per player', () => {
    render(<ScorePanel rows={ROWS} />)
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
  })
  it('shows total score', () => {
    render(<ScorePanel rows={ROWS} />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })
  it('highlights "you" row', () => {
    const { container } = render(<ScorePanel rows={ROWS} />)
    expect(container.querySelector('.score-panel__row.is-you')).toBeInTheDocument()
  })
  it('shows breakdown chips', () => {
    render(<ScorePanel rows={ROWS} />)
    expect(screen.getAllByText(/fields/i).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Implement**

```tsx
export interface PlayerScoreRow {
  id: string
  name: string
  isYou?: boolean
  total: number
  breakdown: {
    fields: number
    animals: number
    food: number
    family: number
    cards: number
  }
}

interface Props { rows: PlayerScoreRow[] }

export function ScorePanel({ rows }: Props) {
  return (
    <div className="score-panel">
      <h3 className="score-panel__title">实时计分</h3>
      <ul className="score-panel__list">
        {rows.map((row) => (
          <li key={row.id} className={`score-panel__row${row.isYou ? ' is-you' : ''}`}>
            <span className="score-panel__name">{row.name}</span>
            <span className="score-panel__total">{row.total}</span>
            <div className="score-panel__breakdown">
              <span className="score-chip" title="fields">🌾 {row.breakdown.fields}</span>
              <span className="score-chip" title="animals">🐑 {row.breakdown.animals}</span>
              <span className="score-chip" title="food">🍞 {row.breakdown.food}</span>
              <span className="score-chip" title="family">👶 {row.breakdown.family}</span>
              <span className="score-chip" title="cards">🃏 {row.breakdown.cards}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Style**

```css
/* ══════════ ScorePanel ══════════ */
.score-panel {
  background: var(--bg-parchment-noisy);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  box-shadow: var(--shadow-paper);
  border: 1px solid var(--color-border);
}
.score-panel__title {
  margin: 0 0 8px;
  font-size: var(--fs-h3);
  color: var(--color-primary);
  font-family: var(--agricola-font);
  border-bottom: 1px solid var(--color-border-light);
  padding-bottom: 6px;
}
.score-panel__list { list-style: none; margin: 0; padding: 0; }
.score-panel__row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "name total" "breakdown breakdown";
  gap: 6px;
  padding: 8px;
  border-radius: var(--radius-sm);
}
.score-panel__row + .score-panel__row { margin-top: 4px; }
.score-panel__row.is-you {
  background: var(--color-accent-bg);
  border: 1px solid var(--color-accent-border);
}
.score-panel__name { grid-area: name; font-weight: 600; }
.score-panel__total {
  grid-area: total;
  font-weight: 700; font-size: var(--fs-h2);
  color: var(--color-accent-strong);
  font-family: var(--agricola-font);
}
.score-panel__breakdown {
  grid-area: breakdown;
  display: flex; flex-wrap: wrap; gap: 4px;
}
.score-chip {
  background: rgba(255,255,255,0.6);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  font-size: var(--fs-small);
  color: var(--color-text-secondary);
}
```

- [ ] **Step 4: Wire to scoring source**

In `GameContainerApi.tsx`, compute `rows` from `state`:

```tsx
import { computeScores } from '../../shared/game/scoring'  // adjust to actual export

const scoreRows = state.players.map((p) => {
  const breakdown = computeScores(state, p.id)  // adjust signature
  return {
    id: p.id, name: p.name, isYou: p.id === myPlayerId,
    total: breakdown.total,
    breakdown: {
      fields: breakdown.fields, animals: breakdown.animals,
      food: breakdown.food, family: breakdown.family, cards: breakdown.cards,
    },
  }
})
```

If `computeScores` doesn't exist or has a different signature: open `shared/game/scoring.ts`, find the existing total-scoring function, and use it. If only a final-scoring function exists, document this gap and use a stub: just `total: 0` until end of game; chips show 0/0/0/0/0 mid-game with a note "估算分数仅在收获后更新". This is acceptable per spec §7.3.

- [ ] **Step 5: Verify + commit**

```bash
pnpm test
pnpm exec tsc --noEmit
git add client/components/board/ScorePanel.tsx \
        client/components/board/__tests__/ScorePanel.test.tsx \
        client/styles/pages/game.css \
        client/app/GameContainerApi.tsx
git commit -m "feat(client/board): ScorePanel with breakdown chips and you-highlight"
```

---

## Task 4: ActionLog Component

**Files:**
- Create: `client/components/board/ActionLog.tsx`
- Create: `client/components/board/action-log-icons.ts`
- Create: `client/components/board/__tests__/ActionLog.test.tsx`
- Modify: `client/styles/pages/game.css`

- [ ] **Step 1: Create icon classifier**

`client/components/board/action-log-icons.ts`:

```ts
export type LogIconKey = '🌾' | '🐑' | '🐖' | '🐂' | '🏠' | '👶' | '💰' | '🃏' | '⚙️'

const RULES: Array<[RegExp, LogIconKey]> = [
  [/收获|harvest/i, '🌾'],
  [/羊|sheep/i, '🐑'],
  [/猪|pig|boar/i, '🐖'],
  [/牛|cattle/i, '🐂'],
  [/建造|房间|木屋|build|room|hut/i, '🏠'],
  [/家庭|family|繁殖|grow/i, '👶'],
  [/木|stone|clay|reed|资源|food|wood/i, '💰'],
  [/卡|card|发展|occupation/i, '🃏'],
]

export function pickLogIcon(text: string): LogIconKey {
  for (const [re, icon] of RULES) if (re.test(text)) return icon
  return '⚙️'
}
```

- [ ] **Step 2: Failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActionLog } from '../ActionLog'

describe('ActionLog', () => {
  it('renders entries with icons', () => {
    render(
      <ActionLog
        entries={[
          { id: 'e1', round: 1, playerId: 'p1', playerName: 'You', text: '取了 3 木' },
          { id: 'e2', round: 1, playerId: 'p2', playerName: 'AI', text: '收获了 1 麦' },
        ]}
      />,
    )
    expect(screen.getByText(/取了 3 木/)).toBeInTheDocument()
    expect(screen.getByText(/收获了 1 麦/)).toBeInTheDocument()
    expect(screen.getByText('💰')).toBeInTheDocument()
    expect(screen.getByText('🌾')).toBeInTheDocument()
  })
  it('groups by round', () => {
    const { container } = render(
      <ActionLog
        entries={[
          { id: 'e1', round: 1, playerId: 'p1', playerName: 'You', text: 'a' },
          { id: 'e2', round: 2, playerId: 'p1', playerName: 'You', text: 'b' },
        ]}
      />,
    )
    expect(container.querySelectorAll('.action-log__round-header')).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Implement**

```tsx
import { pickLogIcon } from './action-log-icons'

export interface LogEntry {
  id: string
  round: number
  playerId: string
  playerName: string
  text: string
}

interface Props { entries: LogEntry[] }

export function ActionLog({ entries }: Props) {
  // Group by round
  const groups = new Map<number, LogEntry[]>()
  for (const e of entries) {
    if (!groups.has(e.round)) groups.set(e.round, [])
    groups.get(e.round)!.push(e)
  }
  const rounds = [...groups.keys()].sort((a, b) => a - b)

  return (
    <div className="action-log">
      <h3 className="action-log__title">行动记录</h3>
      <div className="action-log__body">
        {rounds.length === 0 && <p className="action-log__empty">暂无</p>}
        {rounds.map((round) => (
          <div key={round}>
            <div className="action-log__round-header">第 {round} 轮</div>
            <ul className="action-log__list">
              {groups.get(round)!.map((e) => (
                <li key={e.id} className="action-log__entry">
                  <span className="action-log__icon" aria-hidden>{pickLogIcon(e.text)}</span>
                  <span className="action-log__player">{e.playerName.slice(0, 1)}</span>
                  <span className="action-log__text">{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Style**

```css
/* ══════════ ActionLog ══════════ */
.action-log {
  background: var(--bg-parchment);
  border-radius: var(--radius-md);
  padding: 12px;
  box-shadow: var(--shadow-paper);
  border: 1px solid var(--color-border);
  display: flex; flex-direction: column;
  max-height: 100%;
  overflow: hidden;
}
.action-log__title {
  margin: 0 0 8px;
  font-size: var(--fs-h3);
  color: var(--color-primary);
  font-family: var(--agricola-font);
  border-bottom: 1px solid var(--color-border-light);
  padding-bottom: 6px;
}
.action-log__body { overflow-y: auto; flex: 1; }
.action-log__empty { color: var(--color-text-muted); text-align: center; padding: 12px; }
.action-log__round-header {
  font-weight: 700;
  font-size: var(--fs-small);
  color: var(--color-text-secondary);
  margin: 8px 0 4px;
  border-bottom: 1px dashed var(--color-border-light);
  padding-bottom: 2px;
}
.action-log__list { list-style: none; margin: 0; padding: 0; }
.action-log__entry {
  display: grid;
  grid-template-columns: 20px 24px 1fr;
  gap: 6px; align-items: center;
  padding: 4px 6px;
  font-size: var(--fs-small);
  color: var(--color-text);
  border-radius: var(--radius-sm);
}
.action-log__entry:hover { background: rgba(0,0,0,0.03); }
.action-log__icon { text-align: center; }
.action-log__player {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  background: var(--color-primary); color: #fff;
  border-radius: var(--radius-pill);
  font-weight: 700; font-size: 11px;
}
```

- [ ] **Step 5: Wire data source**

In `GameContainerApi.tsx`, derive entries from `state.log`:

```tsx
const logEntries: LogEntry[] = (state.log ?? []).map((l, i) => ({
  id: `${i}`,
  round: l.round ?? 0,
  playerId: l.playerId ?? 'system',
  playerName: state.players.find((p) => p.id === l.playerId)?.name ?? 'system',
  text: l.text ?? '',
}))
```

(Adjust to actual log entry shape — open `shared/game/types.ts` to confirm.)

- [ ] **Step 6: Commit**

```bash
git add client/components/board/ActionLog.tsx \
        client/components/board/action-log-icons.ts \
        client/components/board/__tests__/ActionLog.test.tsx \
        client/styles/pages/game.css \
        client/app/GameContainerApi.tsx
git commit -m "feat(client/board): ActionLog with icon classifier and round grouping"
```

---

## Task 5: StageBar Component

**Files:**
- Create: `client/components/board/StageBar.tsx`
- Create: `client/components/board/__tests__/StageBar.test.tsx`
- Modify: `client/styles/pages/game.css`

- [ ] **Step 1: Failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageBar, STAGE_BREAKPOINTS } from '../StageBar'

describe('StageBar', () => {
  it('renders 14 round cells', () => {
    const { container } = render(<StageBar currentRound={3} />)
    expect(container.querySelectorAll('.stage-bar__cell')).toHaveLength(14)
  })
  it('marks current round as active', () => {
    const { container } = render(<StageBar currentRound={3} />)
    expect(container.querySelector('.stage-bar__cell.is-current')).toHaveTextContent('3')
  })
  it('marks harvest rounds with icon', () => {
    const { container } = render(<StageBar currentRound={1} />)
    for (const r of STAGE_BREAKPOINTS) {
      expect(container.querySelector(`.stage-bar__cell[data-round="${r}"].is-harvest`)).toBeInTheDocument()
    }
  })
})
```

- [ ] **Step 2: Implement**

```tsx
export const STAGE_BREAKPOINTS = [4, 7, 9, 11, 13, 14] as const

interface Props {
  currentRound: number
  totalRounds?: number
}

export function StageBar({ currentRound, totalRounds = 14 }: Props) {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1)
  const nextHarvest = STAGE_BREAKPOINTS.find((r) => r >= currentRound)
  const remaining = nextHarvest ? nextHarvest - currentRound : 0

  return (
    <div className="stage-bar">
      <div className="stage-bar__cells">
        {rounds.map((r) => {
          const isHarvest = (STAGE_BREAKPOINTS as readonly number[]).includes(r)
          const isCurrent = r === currentRound
          const isPast = r < currentRound
          return (
            <div
              key={r}
              data-round={r}
              className={[
                'stage-bar__cell',
                isCurrent && 'is-current',
                isHarvest && 'is-harvest',
                isPast && 'is-past',
              ].filter(Boolean).join(' ')}
              title={isHarvest ? `第 ${r} 轮：收获` : `第 ${r} 轮`}
            >
              {isHarvest ? '🌾' : r}
            </div>
          )
        })}
      </div>
      {nextHarvest && nextHarvest > currentRound && (
        <p className="stage-bar__hint">
          还有 {remaining} 轮到下次收获（第 {nextHarvest} 轮）
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Style**

```css
/* ══════════ StageBar ══════════ */
.stage-bar {
  background: var(--bg-wood-light);
  padding: 8px;
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  box-shadow: var(--shadow-paper);
}
.stage-bar__cells {
  display: grid;
  grid-template-columns: repeat(14, 1fr);
  gap: 3px;
}
.stage-bar__cell {
  height: 30px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.15);
  color: var(--color-bg-warm);
  border-radius: var(--radius-sm);
  font-size: var(--fs-small);
  font-weight: 600;
}
.stage-bar__cell.is-past { opacity: 0.5; }
.stage-bar__cell.is-harvest {
  background: rgba(212, 160, 23, 0.4);
  border: 1px solid var(--color-accent-strong);
}
.stage-bar__cell.is-current {
  background: var(--color-accent-strong);
  color: #3a2410;
  font-weight: 700;
  transform: scale(1.1);
}
.stage-bar__hint {
  margin: 6px 0 0;
  text-align: center;
  font-size: var(--fs-small);
  color: var(--color-bg-warm);
}
```

- [ ] **Step 4: Wire data + verify**

In `GameContainerApi.tsx`, just `<StageBar currentRound={state.currentRound ?? 1} />` above PlayerTabs in the center column.

```bash
pnpm test
pnpm exec tsc --noEmit
git add client/components/board/StageBar.tsx \
        client/components/board/__tests__/StageBar.test.tsx \
        client/styles/pages/game.css \
        client/app/GameContainerApi.tsx
git commit -m "feat(client/board): StageBar with 14-round timeline + harvest markers"
```

---

## Task 6: CardCarousel Component

**Files:**
- Create: `client/components/board/CardCarousel.tsx`
- Create: `client/components/board/__tests__/CardCarousel.test.tsx`
- Modify: `client/styles/pages/game.css`
- Modify: `client/components/board/PlayerFarmPanel.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardCarousel } from '../CardCarousel'

describe('CardCarousel', () => {
  it('renders title and child cards', () => {
    render(
      <CardCarousel title="职业" cards={[
        <div key="1" data-testid="card1">A</div>,
        <div key="2" data-testid="card2">B</div>,
      ]} />,
    )
    expect(screen.getByText('职业')).toBeInTheDocument()
    expect(screen.getByTestId('card1')).toBeInTheDocument()
    expect(screen.getByTestId('card2')).toBeInTheDocument()
  })
  it('shows empty state when no cards', () => {
    render(<CardCarousel title="x" cards={[]} emptyState="还没有" />)
    expect(screen.getByText('还没有')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement**

```tsx
import { useRef, type ReactNode } from 'react'

interface Props {
  title: string
  cards: ReactNode[]
  emptyState?: string
}

export function CardCarousel({ title, cards, emptyState }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)

  function scroll(dir: -1 | 1) {
    trackRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })
  }

  return (
    <div className="card-carousel">
      <div className="card-carousel__header">
        <h4 className="card-carousel__title">{title}</h4>
        {cards.length > 2 && (
          <div className="card-carousel__nav">
            <button onClick={() => scroll(-1)} aria-label="prev">‹</button>
            <button onClick={() => scroll(1)} aria-label="next">›</button>
          </div>
        )}
      </div>
      {cards.length === 0 ? (
        <p className="card-carousel__empty">{emptyState ?? '无'}</p>
      ) : (
        <div className="card-carousel__track" ref={trackRef}>
          {cards.map((c, i) => <div key={i} className="card-carousel__item">{c}</div>)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Style**

```css
/* ══════════ CardCarousel ══════════ */
.card-carousel {
  margin-top: 12px;
  background: var(--bg-parchment);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  box-shadow: var(--shadow-paper);
}
.card-carousel__header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 6px;
}
.card-carousel__title {
  margin: 0;
  font-size: var(--fs-h3);
  color: var(--color-primary);
  font-family: var(--agricola-font);
}
.card-carousel__nav button {
  width: 24px; height: 24px;
  border: none; background: var(--color-border-light);
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-size: 14px; line-height: 1;
}
.card-carousel__track {
  display: flex; gap: 8px;
  overflow-x: auto; scroll-snap-type: x mandatory;
  max-height: 200px;
  padding: 4px;
  -webkit-overflow-scrolling: touch;
}
.card-carousel__item { scroll-snap-align: start; flex: 0 0 auto; }
.card-carousel__empty {
  margin: 8px 0; font-size: var(--fs-small);
  color: var(--color-text-muted); text-align: center;
}
```

- [ ] **Step 4: Use in PlayerFarmPanel**

Replace the previous occupation/minor-improvement list rendering with:

```tsx
<CardCarousel
  title="职业"
  cards={player.occupations.map((card) => (
    <PlayerCard key={card.id} cardId={card.id} cardType="occupation" locale={locale} />
  ))}
  emptyState="还没有打出职业卡"
/>
<CardCarousel
  title="小发展"
  cards={player.minorImprovements.map((card) => (
    <PlayerCard key={card.id} cardId={card.id} cardType="minor" locale={locale} />
  ))}
  emptyState="还没有打出小发展卡"
/>
```

- [ ] **Step 5: Commit**

```bash
git add client/components/board/CardCarousel.tsx \
        client/components/board/__tests__/CardCarousel.test.tsx \
        client/styles/pages/game.css \
        client/components/board/PlayerFarmPanel.tsx
git commit -m "feat(client/board): CardCarousel for occupations and minor improvements"
```

---

## Task 7: Game Layout Rewrite (3 columns)

**Files:**
- Modify: `client/styles/pages/game.css`
- Modify: `client/app/GameContainerApi.tsx`

- [ ] **Step 1: Update `.game-layout` to 3-column**

In `pages/game.css`, find the existing `.game-layout` block and replace:

```css
.game-layout {
  --game-header-height: 0px;
  display: grid;
  grid-template-columns:
    minmax(720px, 1fr)
    minmax(380px, 1fr)
    minmax(300px, 360px);
  gap: 16px;
  max-width: 1800px;
  margin: 0 auto;
}

.game-layout__left { min-width: 0; }
.game-layout__center { min-width: 0; display: flex; flex-direction: column; }
.game-layout__right {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  max-height: calc(100vh - 80px);
}

@media (max-width: 1280px) {
  .game-layout {
    grid-template-columns: 1.4fr 1fr;
  }
  .game-layout__right { grid-column: 1 / -1; }
}

@media (max-width: 900px) {
  .game-layout { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Refactor GameContainerApi.tsx top-level layout**

Find the `<div className="game-layout">` block and restructure to 3 explicit children:

```tsx
<div className="game-layout">
  <div className="game-layout__left">
    {/* existing: <ActionBoard /> + minor stuff */}
  </div>
  <div className="game-layout__center">
    <StageBar currentRound={state.currentRound ?? 1} />
    <PlayerTabs
      players={state.players.map((p) => ({
        id: p.id, name: p.name,
        score: p.score,
        isYou: p.id === myPlayerId,
        isCurrent: p.id === state.currentPlayerId,
      }))}
      active={viewedPlayerId}
      onChange={setViewedPlayerId}
    />
    <PlayerFarmPanel state={state} viewedPlayerId={viewedPlayerId} />
  </div>
  <div className="game-layout__right">
    <ScorePanel rows={scoreRows} />
    <ActionLog entries={logEntries} />
  </div>
</div>
```

The major-improvements / interaction-bar / harvest panels stay where they are (most are fixed-position or nested in left column).

- [ ] **Step 3: Verify**

```bash
pnpm test
pnpm exec tsc --noEmit
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-3-task-7 node .tmp-shoot.mjs
```

Visually compare the 1920 game screenshot with `output/tmp/batch-2-merged-baseline/20-game-1920.png`. The right column should now show ScorePanel on top + ActionLog below, no more empty white card.

- [ ] **Step 4: Commit**

```bash
git add client/styles/pages/game.css client/app/GameContainerApi.tsx
git commit -m "feat(client/game): 3-column layout with center player tabs and right scores+log"
```

---

## Task 8: Wood Backdrop + Action Board Scaling

**Files:**
- Modify: `client/styles/pages/game.css`

- [ ] **Step 1: Replace grass backdrop on game page**

The `.app` background was switched to wood-dark in Batch 2. Confirm the game page doesn't override:

```bash
grep -n 'background.*background.jpg\|background.*url' client/styles/pages/game.css
```

If any `.action-board { background: url('/bga-img/background.jpg'); }`-style rule exists, leave the BGA action board's own background alone (that's the playing surface), but remove any redundant page-level backgrounds.

- [ ] **Step 2: Add action-board scale variable + media**

In `pages/game.css`:

```css
.action-board {
  /* ... existing rules ... */
  transform-origin: top left;
  transform: scale(var(--action-board-scale, 1));
}

@media (min-width: 1600px) {
  :root { --action-board-scale: 1.15; }
}

@media (min-width: 1920px) {
  :root { --action-board-scale: 1.25; }
}
```

(Don't modify `.action-board` rules that already have a `transform` — extend cautiously.)

- [ ] **Step 3: Verify** — game page on 1920 should show a noticeably larger action board.

- [ ] **Step 4: Commit**

```bash
git add client/styles/pages/game.css
git commit -m "feat(client/game): scale action board on widescreen, drop grass backdrop"
```

---

## Task 9: Move Floating Pills into Interaction Bar

**Files:**
- Modify: `client/app/GameContainerApi.tsx`
- Modify: `client/styles/pages/game.css`

- [ ] **Step 1: Find the floating pills**

```bash
grep -n '上一步\|离开房间\|开发者\|undo\|leave\|devMode' client/app/GameContainerApi.tsx
```

These are likely rendered in a `<div className="game-utility-bar">` or similar. If they live outside `.interaction-bar`, move them inside.

- [ ] **Step 2: Restructure interaction bar**

Make `.interaction-bar` content split into two halves:

```tsx
<div className="interaction-bar">
  <div className="interaction-bar__utility">
    <button className="btn-secondary btn-small" onClick={undo}>← 上一步</button>
    <button className="btn-ghost btn-small" onClick={leaveRoom}>离开房间</button>
    {devMode && <button className="btn-ghost btn-small" onClick={openDevPanel}>开发者</button>}
  </div>
  <div className="interaction-bar__pending">
    {/* existing pending action UI */}
  </div>
</div>
```

- [ ] **Step 3: CSS**

```css
.interaction-bar {
  display: flex; align-items: flex-start; gap: 16px;
  /* ... keep existing positioning ... */
}
.interaction-bar__utility {
  display: flex; gap: 6px; flex-shrink: 0;
}
.interaction-bar__pending { flex: 1; min-width: 0; }
```

- [ ] **Step 4: Commit**

```bash
git add client/app/GameContainerApi.tsx client/styles/pages/game.css
git commit -m "feat(client/game): consolidate floating utility pills into interaction-bar"
```

---

## Task 10: Game Page Mobile Responsive

**Files:**
- Modify: `client/styles/pages/game.css`
- Modify: `client/app/GameContainerApi.tsx`

- [ ] **Step 1: Single-column stack rules**

Already added at end of Task 7. Confirm and add:

```css
@media (max-width: 900px) {
  .game-layout { grid-template-columns: 1fr; gap: 8px; }
  .game-layout__left,
  .game-layout__center,
  .game-layout__right { width: 100%; }
  .game-layout__right {
    grid-template-rows: auto auto;
    max-height: none;
  }
  .stage-bar__cells { grid-template-columns: repeat(7, 1fr); }
  .stage-bar__cells > :nth-child(n+8) { display: none; }
}
```

- [ ] **Step 2: PlayerTabs collapse to SelectButton on mobile**

Add inside PlayerTabs.tsx:

```tsx
import { useEffect, useState } from 'react'
// ...
const [isMobile, setIsMobile] = useState(false)
useEffect(() => {
  const mq = window.matchMedia('(max-width: 900px)')
  setIsMobile(mq.matches)
  const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}, [])

if (isMobile) {
  return (
    <SelectButton
      value={active}
      onChange={onChange}
      options={players.map((p) => ({
        value: p.id,
        label: `${p.isYou ? '☆ ' : ''}${p.name} · ${p.score ?? 0}`,
      }))}
    />
  )
}

return (
  <div role="tablist" className="player-tabs">
    {/* ... existing tabs ... */}
  </div>
)
```

- [ ] **Step 3: ScorePanel + ActionLog in accordion on mobile**

Wrap each in `<Section collapsible defaultCollapsed>` from Batch 1. In GameContainerApi.tsx mobile block:

```tsx
{isMobile ? (
  <>
    <Section collapsible defaultCollapsed icon="📊" title="计分"><ScorePanel rows={scoreRows} /></Section>
    <Section collapsible defaultCollapsed icon="📜" title="行动记录"><ActionLog entries={logEntries} /></Section>
  </>
) : (
  <>
    <ScorePanel rows={scoreRows} />
    <ActionLog entries={logEntries} />
  </>
)}
```

- [ ] **Step 4: Verify on mobile viewport**

```bash
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-3-mobile node .tmp-shoot.mjs
```

- [ ] **Step 5: Commit**

```bash
git add client/styles/pages/game.css client/app/GameContainerApi.tsx client/components/board/PlayerTabs.tsx
git commit -m "feat(client/game): mobile responsive 1-column layout + collapsed score/log"
```

---

## Task 11: Cleanup Old Tokens (optional, can defer to a separate cleanup PR)

**Files:**
- Modify: `client/styles/tokens.css`

- [ ] **Step 1: grep for unused old tokens**

```bash
for tok in --color-bg-card --interaction-bar-max-height --game-header-gap; do
  echo "=== $tok ==="
  grep -rln "var($tok)" client/ || echo "UNUSED"
done
```

If any token is fully unused after Batches 1-3, delete from tokens.css.

- [ ] **Step 2: Re-run full suite**

```bash
pnpm test
pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add client/styles/tokens.css
git commit -m "chore(client/style): drop unused legacy tokens"
```

---

## Task 12: Final Batch 3 Verification

- [ ] **Step 1: Full suite**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm run build
pnpm run lint 2>&1 | grep -i error | head
```

- [ ] **Step 2: Generate Batch 3 final screenshots**

```bash
mkdir -p output/tmp/batch-3-after
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-3-after node .tmp-shoot.mjs
```

Compare game-page screenshots:
- `20-game-1920.png` — should now show 3-column layout, wood backdrop, larger action board, score panel + log on right
- `21-game-1920-full.png` — fullPage; should be much shorter than baseline (carousel replaces vertical card stack)
- `15-mobile-single-game.png` — single column, collapsed sections

- [ ] **Step 3: Try E2E if local services available**

```bash
./restart-intranet.sh &
sleep 10
pnpm run test:e2e
```

If E2E breaks due to DOM changes, fix the test selectors (don't revert visual changes).

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin batch-3-game
gh pr create --title "UI overhaul Batch 3: game page widescreen + 6 board components" \
  --body "$(cat <<'EOF'
Implements spec §7. Game-page rewrite:
- 3-column layout (action board / player-tab farm / score+log)
- 6 new board components: PlayerTabs, PlayerFarmPanel, ScorePanel, ActionLog, StageBar, CardCarousel
- Wood-dark backdrop, action board scaled on widescreen
- Mobile responsive 1-col with collapsed sections
- Floating utility pills consolidated into interaction-bar

See output/tmp/batch-3-after/ vs output/tmp/batch-2-merged-baseline/ for visuals.
EOF
)"
```

- [ ] **Step 5: Wait for CI green**

---

## Spec Coverage Check (against design doc §7)

| Spec section | Covered by |
|---|---|
| §7.1 3-column layout | Task 7 |
| §7.2 PlayerTabs | Task 1 + Task 7 |
| §7.3 ScorePanel + ActionLog | Tasks 3, 4 |
| §7.4 wood backdrop | Task 8 (Batch 2 already switched .app; here just confirms game page) |
| §7.5 action board scale | Task 8 |
| §7.6 StageBar | Task 5 |
| §7.7 CardCarousel | Task 6 + Task 2 |
| §7.8 utility pills consolidation | Task 9 |
| §7.9 mobile single-column | Task 10 |
| §7.10 6 new components inventory | Tasks 1-6 |

All Batch 3 spec items covered.
