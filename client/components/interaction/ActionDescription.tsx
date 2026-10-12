import type { ReactNode } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import type { ChoiceDescriptionPreview, ChoiceEffectPreview, RuleAmount, RuleCondition } from '../../../shared/contract/types'
import type { RuleOperationPreview } from '../../../shared/contract/rule-operation-previews'
import { ResourceLine } from '../common/ResourceLine'
import { ResourceText } from '../common/ResourceText'
import { getAnyCardDisplayName, translateCardText } from '../common/cardText'
import { getPlayerDisplayName } from '../../utils/player-name'

export const hasPositiveResources = (resources?: Record<string, number | undefined>) =>
  !!resources && Object.values(resources).some((value) => (value ?? 0) > 0)

export const renderResourceAwareText = (text: string): ReactNode =>
  text.includes('<') ? (
    <ResourceText text={text} className="interaction-option-resource-text" />
  ) : text

export const renderPaymentSourceCards = (
  locale: Locale,
  sourceCards: string[] | undefined,
): ReactNode => {
  if (!sourceCards || sourceCards.length === 0) return null
  const names = sourceCards.map((id) => getAnyCardDisplayName(locale, id))
  const joiner = locale === 'zh' ? '、' : ', '
  return (
    <span className="payment-option-sources">
      {t(locale, 'ui.interactionPaymentVia', { cards: names.join(joiner) })}
    </span>
  )
}

export const renderRuleAmount = (locale: Locale, amount: RuleAmount): string => {
  if (typeof amount === 'number') return String(amount)
  switch (amount.kind) {
    case 'supply': return t(locale, 'ui.ruleSupplyQuantity', { resource: t(locale, `resources.${amount.resource}`) })
    case 'fields': return t(locale, 'ui.ruleFieldQuantity', { crop: t(locale, `resources.${amount.crop}`) })
    case 'family': return t(locale, 'ui.ruleFamilyQuantity')
    case 'crop-total': return t(locale, 'ui.ruleCropTotal')
    case 'major-improvements': return t(locale, 'ui.ruleMajorImprovements')
    case 'card-fact': return t(locale, 'ui.ruleRecordedQuantity')
    case 'occupied-round-spaces': return t(locale, 'ui.ruleOccupiedRoundSpaces')
    case 'scale': return `(${renderRuleAmount(locale, amount.value)}) × ${amount.by}`
    case 'min': return t(locale, 'ui.ruleMinimum', { values: amount.values.map(value => renderRuleAmount(locale, value)).join(', ') })
    case 'sum': return amount.values.map(value => renderRuleAmount(locale, value)).join(' + ')
    case 'divide': return t(locale, 'ui.ruleDivideQuantity', { value: renderRuleAmount(locale, amount.value), by: amount.by })
  }
}

const renderRuleCondition = (locale: Locale, condition: RuleCondition): string => {
  switch (condition.kind) {
    case 'house-type': return t(locale, 'ui.ruleHouseType', { type: t(locale, `resources.${condition.houseType}`) })
    case 'room-for-newborn': return t(locale, 'ui.ruleRoomForNewborn')
    case 'has-fields': return t(locale, 'ui.ruleHasFields')
    case 'card-flag': case 'card-fact-true': return t(locale, 'ui.ruleActiveEffect')
    case 'card-fact-positive': return t(locale, 'ui.rulePositiveRecordedQuantity')
    case 'purchased-by-round': return t(locale, 'ui.rulePurchasedByRound', { round: condition.round })
    case 'extra-room-active': return t(locale, 'ui.ruleExtraRoomActive')
    case 'inactive-supply-worker': return t(locale, 'ui.ruleInactiveSupplyWorker')
    case 'all': return condition.conditions.map(entry => renderRuleCondition(locale, entry)).join(t(locale, 'ui.actionPreviewAnd'))
    case 'compare': return `${renderRuleAmount(locale, condition.left)} ${condition.operator === 'eq' ? '=' : condition.operator === 'ge' ? '≥' : '>'} ${renderRuleAmount(locale, condition.right)}`
  }
}

const renderRuleOperation = (locale: Locale, operation: RuleOperationPreview): ReactNode => {
  switch (operation.kind) {
    case 'put-on-action-space': return <span>{t(locale, 'ui.rulePutOnSpace', { space: t(locale, operation.spaceNameKey) })}{' '}<ResourceLine locale={locale} resources={operation.resources} /></span>
    case 'move-worker-from-space': return t(locale, 'ui.ruleMoveWorkerFromSpace', { space: t(locale, operation.spaceNameKey) })
    case 'supply-worker-placement': return t(locale, 'ui.ruleSupplyWorkerPlacement')
    case 'supply-worker-turn': return t(locale, 'ui.ruleSupplyWorkerTurn')
    case 'card-fact-refund': return <span>{t(locale, 'ui.ruleRefund', { amount: operation.paidAmount, divisor: operation.divisor })}{' '}<ResourceLine locale={locale} resources={{ [operation.resource]: operation.amount }} /></span>
    case 'take-stored-resources': return <span>{t(locale, 'ui.ruleTakeStoredResources')}{' '}<ResourceLine locale={locale} resources={operation.resources} /></span>
    case 'harvest-selected-supply-reward': return <span>{t(locale, 'ui.ruleSelectedHarvestReward', { selected: operation.selectedFields })}{' '}<ResourceLine locale={locale} resources={{ [operation.crop]: 1 }} />{' × '}{operation.appliedFields ?? t(locale, 'ui.ruleActualHarvestedFields')}</span>
    case 'release-reserved-worker': return t(locale, 'ui.ruleReleaseReservedWorker')
    case 'gain-per-building-resource-collected': return <span>{t(locale, 'ui.rulePerBuildingResourceCollected')}{' '}<ResourceLine locale={locale} resources={{ [operation.resource]: operation.perBuildingResource }} /></span>
    case 'skip-next-turns': return t(locale, 'ui.ruleSkipNextTurns', { count: operation.count })
    case 'breed-animals': return t(locale, 'ui.ruleBreedAnimals', { animals: operation.animals.map(animal => t(locale, `resources.${animal}`)).join(', ') })
    case 'take-field-crop': return <span>{t(locale, 'ui.ruleTakeFieldCrop')}{' '}<ResourceLine locale={locale} resources={{ [operation.crop]: operation.amount }} /></span>
    case 'expire-extra-room': return t(locale, operation.removeUnhousedWorker ? 'ui.ruleExpireExtraRoomWorker' : 'ui.ruleExpireExtraRoom')
    case 'collect-board-resources': return <span>{t(locale, 'ui.ruleCollectBoardResources')}{' '}{operation.resources.map(resource => t(locale, `resources.${resource}`)).join(', ')}</span>
    case 'each-space-worker': return <span>{t(locale, 'ui.ruleEachSpaceWorker', { space: t(locale, `actions.${operation.spaceId}.name`) })}{' '}<ResourceLine locale={locale} resources={operation.alternativeGain} />{' / '}{t(locale, 'ui.ruleMoveWorkerToEmptySpace')}</span>
    case 'discounted-action': return <span>{t(locale, `actions.${operation.actionId}.name`)}{': '}{operation.discounts.map((discount, index) => <span key={index}>{index ? ' / ' : ''}{t(locale, 'ui.ruleDiscount')}{' '}<ResourceLine locale={locale} resources={discount} /></span>)}</span>
    case 'borrow-fences': return t(locale, 'ui.ruleBorrowFences', { amount: operation.maximumPerOpponent })
    case 'bounded-exchange': return <span>{t(locale, operation.quantity === 'choose' ? 'ui.ruleChooseUpTo' : 'ui.ruleExchangeMaximum', { maximum: renderRuleAmount(locale, operation.maximum) })}{': '}<ResourceLine locale={locale} resources={operation.cost} mode="payment" emptyLabel={t(locale, 'ui.free')} />{' → '}<ResourceLine locale={locale} resources={operation.gain} bonusVp={operation.bonusVp} /></span>
  }
}

export const renderEffectPreview = (
  locale: Locale,
  effectPreview: ChoiceEffectPreview,
): ReactNode => {
  if (effectPreview.kind === 'resourceBundle') return <ResourceLine locale={locale} resources={effectPreview.resources} />
  if (effectPreview.kind === 'cardRecordSelection') return <span>{t(locale, 'ui.ruleRecordSelection', { count: effectPreview.count, card: getAnyCardDisplayName(locale, effectPreview.cardId) })}{': '}{effectPreview.choices.map((resources, index) => <span key={index}>{index ? ' / ' : ''}<ResourceLine locale={locale} resources={resources} /></span>)}</span>
  if (effectPreview.kind === 'cardStack') return <span>{t(locale, effectPreview.amount < 0 ? 'ui.ruleDiscardCardMarker' : 'ui.ruleStoreCardMarker', { card: getAnyCardDisplayName(locale, effectPreview.cardId), amount: Math.abs(effectPreview.amount) })}{' '}{t(locale, `resources.${effectPreview.item}`)}</span>
  if (effectPreview.kind === 'scoringReserve') return <span>{t(locale, 'ui.ruleReserveForScoring')}{' '}<ResourceLine locale={locale} resources={effectPreview.resourcesReserved} />{' → '}<ResourceLine locale={locale} resources={{}} bonusVp={effectPreview.bonusVp} /></span>
  if (effectPreview.kind === 'animalCapacity') return t(locale, 'ui.ruleAddAnimalCapacity', { amount: effectPreview.amount })
  if (effectPreview.kind === 'virtualRoom') return t(locale, 'ui.ruleVirtualRoom', { amount: effectPreview.amount, capacity: effectPreview.animalCapacity })
  if (effectPreview.kind === 'fenceReserve') return t(locale, 'ui.ruleReserveFences', { amount: effectPreview.amount })
  if (effectPreview.kind === 'cardCounter') return t(locale, effectPreview.amount < 0 ? 'ui.ruleConsumeCardCounter' : 'ui.ruleIncreaseCardCounter', { card: getAnyCardDisplayName(locale, effectPreview.cardId), amount: Math.abs(effectPreview.amount) })
  if (effectPreview.kind === 'animalPose') return <span>{t(locale, 'ui.ruleLieAnimal', { amount: effectPreview.amount, animal: t(locale, `resources.${effectPreview.animal}`) })}{' → '}<ResourceLine locale={locale} resources={effectPreview.resourcesGained} /></span>
  if (effectPreview.kind === 'resourceSale') return effectPreview.stage === 'buyer-offer' ? <span>{t(locale, 'ui.ruleBuyerIfSelected')}{': '}<ResourceLine locale={locale} resources={effectPreview.buyerPays} mode="payment" />{' → '}<ResourceLine locale={locale} resources={effectPreview.resourcesSold} /></span> : <span>{t(locale, 'ui.ruleSellResources')}{' '}<ResourceLine locale={locale} resources={effectPreview.resourcesSold} />{': '}{t(locale, 'ui.ruleSellToSupply')}{' '}<ResourceLine locale={locale} resources={effectPreview.supplyReward} />{' / '}{t(locale, 'ui.ruleSellToWillingPlayer')}{' '}<ResourceLine locale={locale} resources={effectPreview.buyerPays} /></span>
  if (effectPreview.kind === 'resourceQuantitySchedule') {
    if (effectPreview.preset) return <span>{effectPreview.choices.filter(choice => (effectPreview.preset?.[choice.resource] ?? 0) > 0).map((choice, index) => {
      const count = effectPreview.preset![choice.resource] ?? 0
      const received = Object.fromEntries(Object.entries(choice.resourcesPerUnit).map(([resource, amount]) => [resource, (amount ?? 0) * count]))
      return <span key={choice.resource}>{index ? '; ' : ''}<ResourceLine locale={locale} mode="payment" resources={{ [choice.resource]: count }} />{' → '}<ResourceLine locale={locale} resources={received} />{' '}{t(locale, 'ui.ruleScheduleEachRound', { rounds: choice.rounds.join(', ') || '—' })}</span>
    })}</span>
    return <span>{t(locale, 'ui.chooseQuantity')}{': '}{effectPreview.choices.map((choice, index) => <span key={choice.resource}>{index ? '; ' : ''}<ResourceLine locale={locale} resources={{ [choice.resource]: 1 }} />{` (0–${choice.available}) → `}<ResourceLine locale={locale} resources={choice.resourcesPerUnit} />{' '}{t(locale, 'ui.ruleSchedulePerUnit', { rounds: choice.rounds.join(', ') || '—' })}</span>)}</span>
  }
  if (effectPreview.kind === 'terrainOperation') return <span>{t(locale, `ui.ruleTerrainOperation.${effectPreview.operation}`)}{' '}{effectPreview.from ? t(locale, `ui.ruleTerrain.${effectPreview.from}`) : ''}{effectPreview.to ? ` → ${t(locale, `ui.ruleTerrain.${effectPreview.to}`)}` : ''}{` (${effectPreview.minSelections}–${effectPreview.maxSelections})`}{effectPreview.visibleLayerOnly ? `; ${t(locale, 'ui.ruleVisibleTerrainLayer')}` : ''}{effectPreview.requiresUncovered ? `; ${t(locale, 'ui.ruleUncoveredTerrain')}` : ''}{effectPreview.adjacentFieldRequiredWhenPresent ? `; ${t(locale, 'ui.ruleAdjacentFieldWhenPresent')}` : ''}{effectPreview.gainPerSelection || effectPreview.bonusVpPerSelection ? <>{'; '}{t(locale, 'ui.rulePerSelectedTile')}{' '}<ResourceLine locale={locale} resources={effectPreview.gainPerSelection ?? {}} bonusVp={effectPreview.bonusVpPerSelection} /></> : null}</span>
  if (effectPreview.kind === 'fieldOperation') {
    const operation = effectPreview.operation
    return <span>{t(locale, effectPreview.location === 'crop-space' ? 'ui.ruleSelectCropSpaces' : 'ui.ruleSelectFields', { min: effectPreview.minSelections, max: effectPreview.maxSelections })}{': '}
      {operation.kind === 'replace' ? <><ResourceLine locale={locale} resources={{ [operation.from]: operation.fromAmount }} />{' → '}<ResourceLine locale={locale} resources={{ [operation.to]: operation.toAmount }} /></> : operation.kind === 'remove-top' ? <>{t(locale, 'ui.ruleRemoveTop', { amount: operation.amount, crop: operation.crop ? t(locale, `resources.${operation.crop}`) : t(locale, 'ui.ruleCropToken') })}{hasPositiveResources(operation.gain) ? <>{'; '}{t(locale, 'ui.rulePerSelectedTile')}{' '}<ResourceLine locale={locale} resources={operation.gain} /></> : null}</> : operation.kind === 'discard-all' ? t(locale, 'ui.ruleDiscardAllCrops') : t(locale, 'ui.ruleMoveCrops', { amount: operation.amount })}
    </span>
  }
  if (effectPreview.kind === 'exchangeCatalog') return <span>{t(locale, 'ui.chooseQuantity')}{': '}{effectPreview.choices.map((choice, index) => <span key={index}>{index ? '; ' : ''}{choice.sourceCard ? `${getAnyCardDisplayName(locale, choice.sourceCard)}: ` : ''}{renderEffectPreview(locale, { kind: 'resourceExchange', resourcesPaid: choice.resourcesPaid, resourcesGained: choice.resourcesGained })}{` (${choice.minTimes}–${Number.isFinite(choice.maxTimes) ? choice.maxTimes : '∞'})`}</span>)}</span>
  if (effectPreview.kind === 'resourceBatchExchange') return <span>{t(locale, 'ui.ruleBatchExchange', { min: effectPreview.minTotal, max: effectPreview.maxTotal })}{': '}<ResourceLine locale={locale} resources={effectPreview.available} />{' → '}{effectPreview.receiveResources.map(resource => t(locale, `resources.${resource}`)).join(' / ')}</span>
  if (effectPreview.kind === 'workerRecall') return effectPreview.noOp ? t(locale, 'ui.ruleNoWorkerToRecall') : <span>{t(locale, effectPreview.select ? 'ui.ruleChooseWorkerToRecall' : 'ui.ruleRecallWorker')}{effectPreview.workers.map((worker, index) => <span key={index}>{index ? ' / ' : ': '}{t(locale, worker.spaceNameKey)}</span>)}{' → '}{effectPreview.destination.kind === 'card' ? getAnyCardDisplayName(locale, effectPreview.destination.cardId) : t(locale, 'ui.ruleHome')}</span>
  if (effectPreview.kind === 'collection') return t(locale, 'ui.ruleCollectAllOnSpace', { space: t(locale, effectPreview.spaceNameKey), resources: effectPreview.resourceTypes.map(resource => t(locale, `resources.${resource}`)).join(', ') })
  if (effectPreview.kind === 'resourceSetSelection') return <span>{effectPreview.quantitiesByUse ? t(locale, 'ui.ruleResourceSetByUse', { counts: effectPreview.quantitiesByUse.join(' / '), amount: effectPreview.resourcesPerChoice }) : t(locale, 'ui.ruleResourceSetSelection', { min: effectPreview.minDistinct, max: effectPreview.maxDistinct, amount: effectPreview.resourcesPerChoice })}{': '}{effectPreview.choices.map(resource => t(locale, `resources.${resource}`)).join(', ')}{'; '}{t(locale, 'ui.ruleExtraGain')}{' '}<ResourceLine locale={locale} resources={effectPreview.extraGain} /></span>
  if (effectPreview.kind === 'familyGrowth') return <span>{t(locale, effectPreview.roomRequired ? 'ui.ruleGrowthRoomRequired' : 'ui.ruleGrowthWithoutRoom')}{effectPreview.heldOnCard ? ` (${t(locale, 'ui.ruleNewbornHeldOnCard', { card: getAnyCardDisplayName(locale, effectPreview.heldOnCard) })})` : ''}</span>
  if (effectPreview.kind === 'harvestFields') return t(locale, effectPreview.privatePhase ? 'ui.rulePrivateHarvestFields' : 'ui.ruleHarvestFields')
  if (effectPreview.kind === 'cardSelection') return <span>{t(locale, 'ui.ruleSelectCards', { types: effectPreview.types.map(type => t(locale, `ui.improvementKinds.${type}`)).join(' / ') })}
    {effectPreview.allowedCards ? ` (${t(locale, 'ui.ruleAllowedCards', { cards: effectPreview.allowedCards.map(id => getAnyCardDisplayName(locale, id)).join(', ') })})` : ''}
    {effectPreview.resourcesPaid ? <>{': '}<ResourceLine locale={locale} mode="payment" resources={effectPreview.resourcesPaid} emptyLabel={t(locale, 'ui.free')} /></> : null}
  </span>
  if (effectPreview.kind === 'bakeRecipes') return effectPreview.recipes.length ? <span>{t(locale, 'ui.chooseQuantity')}{': '}{effectPreview.recipes.map((recipe, index) => <span key={recipe.sourceCard}>
    {index ? '; ' : ''}{getAnyCardDisplayName(locale, recipe.sourceCard)}{': '}{renderEffectPreview(locale, recipe.exchange)}{` (${t(locale, 'ui.ruleQuantityLimit', { amount: recipe.quantityLimit })})`}
  </span>)}</span> : t(locale, 'ui.ruleUseAvailableBakeAbility')
  if (effectPreview.kind === 'fencePlan') return <span>{t(locale, 'ui.ruleChooseFenceLayout')}{': '}{effectPreview.segments.map((segment, index) => <span key={segment.kind}>
    {index ? '; ' : ''}{t(locale, `ui.fenceSegmentType.${segment.kind}`)}{' '}<ResourceLine locale={locale} mode="payment" resources={{ wood: segment.woodCost }} emptyLabel={t(locale, 'ui.free')} />{' '}{t(locale, 'ui.perUnit')}
    {segment.min !== undefined || segment.max !== undefined ? ` (${segment.min ?? 0}–${segment.max ?? '∞'})` : ''}
  </span>)}{effectPreview.totalBounds ? `; ${t(locale, 'ui.ruleTotalSegments')}: ${effectPreview.totalBounds.min ?? 0}–${effectPreview.totalBounds.max ?? '∞'}` : ''}
    {effectPreview.fixedWood > 0 ? <>{'; '}<ResourceLine locale={locale} mode="payment" resources={{ wood: effectPreview.fixedWood }} />{' '}{t(locale, 'ui.fixedFee')}</> : null}
    {effectPreview.freeFences > 0 ? `; ${t(locale, 'ui.ruleFreeFences', { amount: effectPreview.freeFences })}` : ''}
    {effectPreview.borrowed ? `; ${t(locale, 'ui.ruleBorrowedFences')}` : ''}
    {effectPreview.paymentBudget ? <>{'; '}{t(locale, 'ui.rulePaymentBudget')}{' '}<ResourceLine locale={locale} resources={effectPreview.paymentBudget} /></> : null}
    {'; '}{t(locale, 'ui.ruleConfirmLayoutCost')}
  </span>
  if (effectPreview.kind === 'resourceTransfer') return <span>
    {effectPreview.payer ? `${getPlayerDisplayName(locale, effectPreview.payer.name, effectPreview.payer.index, effectPreview.payer.nameIsDefault)} → ` : ''}
    {effectPreview.recipients.map((recipient, index) => <span key={recipient.playerId}>{index ? '; ' : ''}{getPlayerDisplayName(locale, recipient.name, recipient.index, recipient.nameIsDefault)}{': '}<ResourceLine locale={locale} resources={effectPreview.resources} /></span>)}
  </span>
  if (effectPreview.kind === 'ruleOperation') return renderRuleOperation(locale, effectPreview.operation)
  if (effectPreview.kind === 'fieldContents') {
    return <span>{effectPreview.sourceCard ? getAnyCardDisplayName(locale, effectPreview.sourceCard) : t(locale, 'ui.tileField')}{': '}
      <ResourceLine locale={locale} resources={effectPreview.resources} hideZero />
    </span>
  }
  if (effectPreview.kind === 'cardScore') {
    return <span data-card-score={effectPreview.delta}>{t(locale, 'ui.choiceCardScore', {
      card: getAnyCardDisplayName(locale, effectPreview.cardId),
      delta: `${effectPreview.delta >= 0 ? '+' : ''}${effectPreview.delta}`,
    })}</span>
  }
  if (effectPreview.kind === 'actionSpace') {
    return <span data-space-id={effectPreview.spaceId}>
      <strong>{t(locale, effectPreview.nameKey)}</strong>
      {effectPreview.description ? <span className="interaction-option-subtitle">{renderDescriptionPreview(locale, effectPreview.description)}</span> : null}
    </span>
  }
  if (effectPreview.kind === 'unitCost') return <span><ResourceLine locale={locale} resources={effectPreview.resourcesPaid} mode="payment" emptyLabel={t(locale, 'ui.free')} />{' → '}{t(locale, effectPreview.actionNameKey)}{effectPreview.unit ? ` (${t(locale, `ui.costPerUnit.${effectPreview.unit}`)})` : ''}{effectPreview.fixedFee ? <>{' + '}<ResourceLine locale={locale} resources={effectPreview.fixedFee} mode="payment" />{' '}{t(locale, 'ui.fixedFee')}</> : null}</span>
  if (effectPreview.kind === 'occupationFees') return <span>{effectPreview.food.map((food, index) => <span key={index}>
    {index ? '; ' : ''}{t(locale, index === effectPreview.food.length - 1 ? 'ui.occupationFeeFrom' : 'ui.occupationFeeNth', { number: index + 1 })}{': '}
    <ResourceLine locale={locale} resources={{ food }} mode="payment" emptyLabel={t(locale, 'ui.free')} />
  </span>)}</span>
  if (effectPreview.kind === 'timedOperation') return <span>{t(locale, `ui.timedOperations.${effectPreview.operation}`)}{effectPreview.actionNameKey ? `: ${t(locale, effectPreview.actionNameKey)}` : ''}</span>
  if (effectPreview.kind === 'rule') return renderDescriptionPreview(locale, effectPreview.description)
  if (effectPreview.kind === 'formulaGain') return <span>{Object.entries(effectPreview.resources).map(([resource, amount], index) => amount === undefined ? null : <span key={resource}>
    {index ? ', ' : ''}{typeof amount === 'number' ? <ResourceLine locale={locale} resources={{ [resource]: amount }} /> : <><ResourceLine locale={locale} resources={{ [resource]: 1 }} />{' × ('}{renderRuleAmount(locale, amount)}{')'}</>}
  </span>)}</span>
  if (effectPreview.kind === 'actionCosts') return <span>{t(locale, 'ui.chooseQuantity')}{': '}{effectPreview.options.map((option, index) => <span key={index}>
    {index ? '; ' : ''}{option.paymentOptions.map((payment, paymentIndex) => <span key={paymentIndex}>{paymentIndex ? ' / ' : ''}{renderEffectPreview(locale, payment)}</span>)}{' → '}{option.amount}{' '}{t(locale, effectPreview.actionNameKey)}
  </span>)}</span>
  if (effectPreview.kind === 'futureOffers') {
    return <span>{effectPreview.entries.map((entry, index) => <span key={index} className="interaction-description-part">
      {index > 0 ? '; ' : ''}{t(locale, 'ui.choiceScheduleRound', { round: entry.round })}{' '}
      {t(locale, 'ui.choiceOptionalPurchase')}{' '}
      <ResourceLine locale={locale} mode="payment" resources={entry.resourcesPaid} hideZero />
      <span aria-hidden="true"> → </span>
      {entry.actionNameKey ? t(locale, entry.actionNameKey) : <ResourceLine locale={locale} resources={entry.resources} hideZero />}
    </span>)}</span>
  }
  if (effectPreview.kind === 'resourceMovement') {
    const location = effectPreview.from.kind === 'card' ? effectPreview.from : effectPreview.to
    const name = location.kind === 'card' ? getAnyCardDisplayName(locale, location.cardId)
      : location.kind === 'actionSpace' ? t(locale, location.nameKey) : ''
    return <span>
      {t(locale, effectPreview.from.kind === 'card' ? 'ui.choiceTakeFromCard' : 'ui.choiceReturnToSpace', { target: name })}{' '}
      <ResourceLine locale={locale} resources={effectPreview.resources} hideZero />
    </span>
  }
  if (effectPreview.kind === 'futureSchedule') {
    return <span className="interaction-future-schedule">{effectPreview.entries.map((entry, index) => (
      <span key={index} className="interaction-description-part">
        {index > 0 ? '; ' : ''}{entry.endRound ? t(locale, 'ui.choiceScheduleRounds', { start: entry.round, end: entry.endRound }) : t(locale, 'ui.choiceScheduleRound', { round: entry.round })}{' '}
        <ResourceLine locale={locale} resources={entry.resources} hideZero />
        {entry.resourceCondition ? <span> ({t(locale, 'ui.choiceMinimumResource')} <ResourceLine locale={locale} resources={{ [entry.resourceCondition.resource]: entry.resourceCondition.amount }} hideZero />)</span> : null}
        {entry.roomType ? <span>{t(locale, 'ui.choiceFutureRoom', { room: t(locale, `resources.${entry.roomType}`) })}</span> : null}
        {entry.actions?.map((action) => <span key={action.kind}> {t(locale, `ui.choiceFuture${action.kind}`, { amount: action.amount })}{action.resourcesPaid ? <> — <ResourceLine locale={locale} mode="payment" resources={action.resourcesPaid} hideZero /></> : null}</span>)}
      </span>
    ))}</span>
  }
  if (effectPreview.kind === 'payment') {
    return (
      <span className="payment-option-content">
        {hasPositiveResources(effectPreview.resourcesPaid) ? (
          <ResourceLine locale={locale} mode="payment" resources={effectPreview.resourcesPaid ?? {}} hideZero />
        ) : (
          <span>{t(locale, 'ui.interactionPaymentFree')}</span>
        )}
        {!!effectPreview.cardUsed && (
          <span className="payment-option-card">
            {' '}
            ({t(locale, 'ui.interactionPaymentReturn')} {getAnyCardDisplayName(locale, effectPreview.cardUsed)})
          </span>
        )}
        {renderPaymentSourceCards(locale, effectPreview.sourceCards)}
      </span>
    )
  }
  if (effectPreview.kind === 'resourceExchange') {
    return (
      <span className="interaction-resource-exchange">
        {effectPreview.resourcesPaid ? <>
          {hasPositiveResources(effectPreview.resourcesPaid) ? <ResourceLine locale={locale} mode="payment" resources={effectPreview.resourcesPaid} hideZero /> : <span>{t(locale, 'ui.interactionPaymentFree')}</span>}
          <span className="interaction-resource-exchange-arrow" aria-hidden="true"><span className="res-icon res-icon-arrow" /></span>
        </> : null}
        <ResourceLine
          locale={locale}
          resources={effectPreview.resourcesGained ?? {}}
          bonusVp={effectPreview.bonusVp ?? 0}
          hideZero
        />
      </span>
    )
  }
  return renderResourceAwareText(effectPreview.text)
}

const renderDescriptionAction = (
  locale: Locale,
  preview: Extract<ChoiceDescriptionPreview, { kind: 'action' }>,
  labelOverride?: string,
): ReactNode => {
  const label = labelOverride ?? translateCardText(
    locale,
    preview.labelKey,
    preview.labelParams as Record<string, string | number> | undefined,
  )
  if (!preview.effectPreview) return renderResourceAwareText(label)
  return (
    <span className="interaction-description-action">
      <span className="interaction-description-action-main">
        {renderEffectPreview(locale, preview.effectPreview)}
      </span>
      <>{preview.showLabel !== false || labelOverride ? <span className="interaction-option-subtitle">{renderResourceAwareText(label)}</span> : null}</>
    </span>
  )
}

export const renderDescriptionPreview = (
  locale: Locale,
  preview: ChoiceDescriptionPreview,
  labelOverride?: string,
): ReactNode => {
  const actor = preview.actor
  const prefix = <>
    {preview.optional ? <span className="action-description-optional">{t(locale, 'ui.actionPreviewOptional')}{' '}</span> : null}
    {actor ? <span className="action-description-actor">{getPlayerDisplayName(locale, actor.name, actor.index, actor.nameIsDefault)}{': '}</span> : null}
  </>
  if (preview.kind === 'conditional') return <span>{prefix}{t(locale, 'ui.actionPreviewIf')}{renderRuleCondition(locale, preview.condition)}{t(locale, 'ui.actionPreviewThen')}{renderDescriptionPreview(locale, preview.body)}</span>
  if (preview.kind === 'action') return <span className="action-description">{prefix}{renderDescriptionAction(locale, preview, labelOverride)}</span>
  const operatorKeys = {
    sequence: 'ui.actionPreviewSequence', xor: 'ui.actionPreviewXor',
    or: 'ui.actionPreviewOr', parallel: 'ui.actionPreviewParallel',
  }
  return (
    <span className="action-description-group" data-flow-operator={preview.operator}>
      {prefix}{preview.labelKey ? <>{renderResourceAwareText(translateCardText(locale, preview.labelKey, preview.labelParams as Record<string, string | number> | undefined))}{': '}</> : null}{t(locale, operatorKeys[preview.operator])}{' ('}
      {preview.parts.map((part, index) => (
        <span key={index} className="interaction-description-part">
          {index > 0 ? (
            <span className="interaction-description-separator">
              {preview.separator}
            </span>
          ) : null}
          {renderDescriptionPreview(locale, part)}
        </span>
      ))}
      {')'}
    </span>
  )
}
