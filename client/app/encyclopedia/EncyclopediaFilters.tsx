import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ENCYCLOPEDIA_GROUPS } from '../../../shared/contract/card-encyclopedia'
import { PAYMENT_RESOURCE_KEYS } from '../../../shared/contract/resource-keys'
import { t, type Locale } from '../../../shared/i18n'
import { useEncyclopediaBrowseState, type EncyclopediaBrowseStore } from './encyclopedia-browse-store'
import {
  EMPTY_ENCYCLOPEDIA_FILTERS,
  ENCYCLOPEDIA_FILTER_TYPES,
  encyclopediaFilterOptions,
  type EncyclopediaCostResource,
  type EncyclopediaFilterOptions,
  type EncyclopediaFilters,
} from './encyclopedia-filters'
import type { EncyclopediaItem } from './encyclopedia-item'
import { encyclopediaGroupLabel, encyclopediaTypeLabel } from './encyclopedia-labels'

export type EncyclopediaFiltersProps = {
  store: EncyclopediaBrowseStore
  locale: Locale
  /** The whole catalog, for building filter options. */
  items: readonly EncyclopediaItem[]
  resultCount: number
}

const COST_RESOURCE_LABEL_KEYS: Record<EncyclopediaCostResource, string> = {
  wood: 'resources.wood',
  clay: 'resources.clay',
  reed: 'resources.reed',
  stone: 'resources.stone',
  food: 'resources.food',
  grain: 'resources.grain',
  vegetable: 'resources.vegetable',
  sheep: 'resources.sheep',
  boar: 'resources.boar',
  cattle: 'resources.cattle',
  horse: 'resources.horse',
  fuel: 'resources.fuel',
  begging: 'resources.begging',
  fence: 'resources.fence',
  stable: 'resources.stable',
}

/** Keeps selections in option order so equal choices always make equal filters. */
const toggled = <T,>(order: readonly T[], selected: readonly T[], option: T): T[] =>
  order.filter(candidate => (candidate === option) !== selected.includes(candidate))

type FieldsProps = {
  filters: EncyclopediaFilters
  options: EncyclopediaFilterOptions
  locale: Locale
  onChange: (filters: EncyclopediaFilters) => void
}

function Option({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <label className="encyclopedia-filters__option">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span>{label}</span>
    </label>
  )
}

function FilterFields({ filters, options, locale, onChange }: FieldsProps) {
  const costHintId = useId()
  const pointsHintId = useId()
  const { cost, points } = filters
  return (
    <div className="encyclopedia-filters__fields">
      <fieldset className="encyclopedia-filters__group">
        <legend>{t(locale, 'ui.encyclopedia.filters.group')}</legend>
        <div className="encyclopedia-filters__options">
          {options.groups.map(group => (
            <Option
              key={group}
              label={encyclopediaGroupLabel(locale, group)}
              checked={filters.groups.includes(group)}
              onToggle={() => onChange({ ...filters, groups: toggled(ENCYCLOPEDIA_GROUPS, filters.groups, group) })}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="encyclopedia-filters__group">
        <legend>{t(locale, 'ui.encyclopedia.filters.type')}</legend>
        <div className="encyclopedia-filters__options">
          {options.types.map(type => (
            <Option
              key={type}
              label={encyclopediaTypeLabel(locale, type)}
              checked={filters.types.includes(type)}
              onToggle={() => onChange({ ...filters, types: toggled(ENCYCLOPEDIA_FILTER_TYPES, filters.types, type) })}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="encyclopedia-filters__group" aria-describedby={costHintId}>
        <legend>{t(locale, 'ui.encyclopedia.filters.cost')}</legend>
        <div className="encyclopedia-filters__options">
          {options.costResources.map(resource => (
            <Option
              key={resource}
              label={t(locale, COST_RESOURCE_LABEL_KEYS[resource])}
              checked={cost.resources.includes(resource)}
              onToggle={() => onChange({
                ...filters,
                cost: { ...cost, resources: toggled(PAYMENT_RESOURCE_KEYS, cost.resources, resource) },
              })}
            />
          ))}
          {options.upgradeReturn || cost.upgradeReturn ? (
            <Option
              label={t(locale, 'ui.encyclopedia.cost.upgradeReturn')}
              checked={cost.upgradeReturn}
              onToggle={() => onChange({ ...filters, cost: { ...cost, upgradeReturn: !cost.upgradeReturn } })}
            />
          ) : null}
        </div>
        <p id={costHintId} className="encyclopedia-filters__hint">{t(locale, 'ui.encyclopedia.filters.costHint')}</p>
      </fieldset>
      <fieldset className="encyclopedia-filters__group" aria-describedby={pointsHintId}>
        <legend>{t(locale, 'ui.encyclopedia.filters.points')}</legend>
        <div className="encyclopedia-filters__range">
          <PointsBound
            value={points.min}
            label={t(locale, 'ui.encyclopedia.filters.pointsMin')}
            placeholder={t(locale, 'ui.encyclopedia.filters.pointsMinPlaceholder')}
            onChange={min => onChange({ ...filters, points: { ...points, min } })}
          />
          <span aria-hidden="true">{t(locale, 'ui.encyclopedia.filters.pointsRangeTo')}</span>
          <PointsBound
            value={points.max}
            label={t(locale, 'ui.encyclopedia.filters.pointsMax')}
            placeholder={t(locale, 'ui.encyclopedia.filters.pointsMaxPlaceholder')}
            onChange={max => onChange({ ...filters, points: { ...points, max } })}
          />
        </div>
        <div className="encyclopedia-filters__options">
          <Option
            label={t(locale, 'ui.encyclopedia.points.unlisted')}
            checked={points.unlisted}
            onToggle={() => onChange({ ...filters, points: { ...points, unlisted: !points.unlisted } })}
          />
        </div>
        <p id={pointsHintId} className="encyclopedia-filters__hint">{t(locale, 'ui.encyclopedia.filters.pointsHint')}</p>
      </fieldset>
      <div className="encyclopedia-filters__group">
        <Option
          label={t(locale, 'ui.encyclopedia.points.bonus')}
          checked={filters.extraVp}
          onToggle={() => onChange({ ...filters, extraVp: !filters.extraVp })}
        />
      </div>
    </div>
  )
}

/**
 * Uncontrolled so the browser keeps partial input such as `-` or `-0.` while the user types;
 * the field is rewritten only when the bound changes from elsewhere, e.g. clearing.
 */
function PointsBound({ value, label, placeholder, onChange }: {
  value: number | null
  label: string
  placeholder: string
  onChange: (value: number | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const input = inputRef.current
    if (input && (input.validity.badInput || parseBound(input.value) !== value)) input.value = formatBound(value)
  }, [value])
  return (
    <input
      ref={inputRef}
      type="number"
      step="any"
      className="encyclopedia-filters__bound"
      aria-label={label}
      placeholder={placeholder}
      defaultValue={formatBound(value)}
      onChange={(event) => {
        if (event.currentTarget.validity.badInput) return
        const next = parseBound(event.currentTarget.value)
        if (next !== value) onChange(next)
      }}
    />
  )
}

const parseBound = (text: string): number | null => {
  const value = text.trim() === '' ? null : Number(text)
  return value !== null && Number.isFinite(value) ? value : null
}

const formatBound = (value: number | null): string => (value === null ? '' : String(value))

type FilterChip = Readonly<{ id: string; label: string; without: () => EncyclopediaFilters }>

/** Every selected condition, each removable on its own. */
function filterChips(filters: EncyclopediaFilters, locale: Locale): FilterChip[] {
  const { cost, points } = filters
  return [
    ...filters.groups.map(group => ({
      id: `group-${group}`,
      label: encyclopediaGroupLabel(locale, group),
      without: () => ({ ...filters, groups: filters.groups.filter(other => other !== group) }),
    })),
    ...filters.types.map(type => ({
      id: `type-${type}`,
      label: encyclopediaTypeLabel(locale, type),
      without: () => ({ ...filters, types: filters.types.filter(other => other !== type) }),
    })),
    ...cost.resources.map(resource => ({
      id: `cost-${resource}`,
      label: t(locale, COST_RESOURCE_LABEL_KEYS[resource]),
      without: () => ({ ...filters, cost: { ...cost, resources: cost.resources.filter(other => other !== resource) } }),
    })),
    ...(cost.upgradeReturn ? [{
      id: 'cost-upgrade-return',
      label: t(locale, 'ui.encyclopedia.cost.upgradeReturn'),
      without: () => ({ ...filters, cost: { ...cost, upgradeReturn: false } }),
    }] : []),
    ...(points.min !== null ? [{
      id: 'points-min',
      label: t(locale, 'ui.encyclopedia.filters.pointsAtLeast', { score: points.min }),
      without: () => ({ ...filters, points: { ...points, min: null } }),
    }] : []),
    ...(points.max !== null ? [{
      id: 'points-max',
      label: t(locale, 'ui.encyclopedia.filters.pointsAtMost', { score: points.max }),
      without: () => ({ ...filters, points: { ...points, max: null } }),
    }] : []),
    ...(points.unlisted ? [{
      id: 'points-unlisted',
      label: t(locale, 'ui.encyclopedia.points.unlisted'),
      without: () => ({ ...filters, points: { ...points, unlisted: false } }),
    }] : []),
    ...(filters.extraVp ? [{
      id: 'extra-vp',
      label: t(locale, 'ui.encyclopedia.points.bonus'),
      without: () => ({ ...filters, extraVp: false }),
    }] : []),
  ]
}

function ClearButton({ store, locale, disabled }: { store: EncyclopediaBrowseStore; locale: Locale; disabled: boolean }) {
  return (
    <button
      type="button"
      className="encyclopedia-filters__clear"
      disabled={disabled}
      onClick={() => store.setFilters(EMPTY_ENCYCLOPEDIA_FILTERS)}
    >
      {t(locale, 'ui.encyclopedia.filters.clear')}
    </button>
  )
}

const useFilterOptions = (items: readonly EncyclopediaItem[]) => useMemo(() => encyclopediaFilterOptions(items), [items])

/** Desktop sidebar beside the results. */
export function EncyclopediaFilterPanel({ store, locale, items }: EncyclopediaFiltersProps) {
  const { filters } = useEncyclopediaBrowseState(store)
  const options = useFilterOptions(items)
  const titleId = useId()
  return (
    <aside className="encyclopedia-filters encyclopedia-filters--sidebar" aria-labelledby={titleId}>
      <div className="encyclopedia-filters__head">
        <h2 id={titleId} className="encyclopedia-filters__title">{t(locale, 'ui.encyclopedia.filters.title')}</h2>
        <ClearButton store={store} locale={locale} disabled={filterChips(filters, locale).length === 0} />
      </div>
      <FilterFields filters={filters} options={options} locale={locale} onChange={next => store.setFilters(next)} />
    </aside>
  )
}

/** Focus targets after the last chip goes away, whichever of them the layout shows. */
const CHIP_FOCUS_FALLBACKS = ['.encyclopedia-filter-entry', '.encyclopedia-filters--sidebar input']

/** Selected conditions under the results bar, each removable on its own. */
export function EncyclopediaActiveFilters({ store, locale }: EncyclopediaFiltersProps) {
  const { filters } = useEncyclopediaBrowseState(store)
  const chips = filterChips(filters, locale)
  const rootRef = useRef<HTMLDivElement>(null)
  const focusChip = useRef<number | null>(null)

  useLayoutEffect(() => {
    const index = focusChip.current
    if (index === null) return
    focusChip.current = null
    const root = rootRef.current
    const remaining = root?.querySelectorAll<HTMLButtonElement>('.encyclopedia-active-filters__chip') ?? []
    const target = remaining[Math.min(index, remaining.length - 1)]
      ?? CHIP_FOCUS_FALLBACKS
        .map(selector => root?.closest('.encyclopedia-browser')?.querySelector<HTMLElement>(selector))
        .find(element => element && element.getClientRects().length > 0)
    target?.focus()
  })

  return (
    <div ref={rootRef} className="encyclopedia-active-filters">
      {chips.length > 0 ? (
        <div className="encyclopedia-active-filters__content" role="group" aria-label={t(locale, 'ui.encyclopedia.filters.active')}>
          <ul className="encyclopedia-active-filters__list">
            {chips.map((chip, index) => (
              <li key={chip.id}>
                <button
                  type="button"
                  className="encyclopedia-active-filters__chip"
                  aria-label={t(locale, 'ui.encyclopedia.filters.remove', { name: chip.label })}
                  onClick={() => {
                    focusChip.current = index
                    store.setFilters(chip.without())
                  }}
                >
                  {chip.label}
                  <span aria-hidden="true" className="encyclopedia-active-filters__remove">×</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="encyclopedia-active-filters__clear"
            onClick={() => {
              focusChip.current = 0
              store.setFilters(EMPTY_ENCYCLOPEDIA_FILTERS)
            }}
          >
            {t(locale, 'ui.encyclopedia.filters.clear')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Phone entry point in the results bar: opens the filters in a full-screen panel. */
export function EncyclopediaFilterEntry({ store, locale, items, resultCount }: EncyclopediaFiltersProps) {
  const { filters } = useEncyclopediaBrowseState(store)
  const options = useFilterOptions(items)
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const count = filterChips(filters, locale).length

  useEffect(() => {
    if (open || !restoreFocus.current) return
    restoreFocus.current = false
    buttonRef.current?.focus()
  }, [open])

  const close = () => {
    restoreFocus.current = true
    setOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn-secondary encyclopedia-filter-entry"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {count > 0
          ? t(locale, 'ui.encyclopedia.filters.titleWithCount', { count })
          : t(locale, 'ui.encyclopedia.filters.title')}
      </button>
      {open ? (
        <FilterDialog locale={locale} resultCount={resultCount} onClose={close}>
          <ClearButton store={store} locale={locale} disabled={count === 0} />
          <FilterFields filters={filters} options={options} locale={locale} onChange={next => store.setFilters(next)} />
        </FilterDialog>
      ) : null}
    </>
  )
}

function FilterDialog({ locale, resultCount, onClose, children }: {
  locale: Locale
  resultCount: number
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="encyclopedia-filter-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
    >
      <div className="encyclopedia-filter-dialog__header">
        <h2 id={titleId}>{t(locale, 'ui.encyclopedia.filters.dialogTitle')}</h2>
        <button type="button" className="btn-secondary" aria-label={t(locale, 'ui.encyclopedia.filters.close')} onClick={onClose}>
          {t(locale, 'ui.close')}
        </button>
      </div>
      <div className="encyclopedia-filter-dialog__body">{children}</div>
      <div className="encyclopedia-filter-dialog__footer">
        <button type="button" className="btn-primary" onClick={onClose}>
          {t(locale, 'ui.encyclopedia.filters.showResults', { count: resultCount })}
        </button>
      </div>
    </dialog>
  )
}
