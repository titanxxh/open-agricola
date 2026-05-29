export const EXTRA_CROP_PLACEMENT_CONTEXT_KEY = 'extraCropPlacement' as const

export const extraCropPlacementActionContext = (
  actionContext?: Record<string, unknown>,
): Record<string, unknown> => ({
  ...(actionContext ?? {}),
  [EXTRA_CROP_PLACEMENT_CONTEXT_KEY]: true,
})

export const isExtraCropPlacementActionContext = (
  actionContext?: Record<string, unknown>,
) => actionContext?.[EXTRA_CROP_PLACEMENT_CONTEXT_KEY] === true
