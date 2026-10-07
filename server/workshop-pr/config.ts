export const workshopPrConfig = {
  enabled: process.env.WORKSHOP_PR_ENABLED === 'true',
  mockMode: process.env.NODE_ENV !== 'production' && process.env.WORKSHOP_PR_MOCK_MODE === 'true',
}
