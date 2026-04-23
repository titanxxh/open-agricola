/// <reference types="@testing-library/jest-dom" />
// Side-effect declaration: makes jest-dom matchers (toBeInTheDocument, toHaveTextContent,
// toBeDisabled, etc.) available to vitest's `expect()` in the editor LSP for any file the
// tsconfig.tests.json project includes. Runtime registration happens via the import in
// client/__tests__/setup.ts (`import '@testing-library/jest-dom/vitest'`).
export {}
