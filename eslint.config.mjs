import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Frontend (repo root) lint config: TypeScript + React + React Hooks.
// Backend, deploy tooling, docs, and build output are excluded.
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'backend/**',
      'deploy/**',
      'scripts/**',
      'docs/**',
      'artifacts/**',
      // macOS AppleDouble resource forks on the external volume
      '**/._*',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
  },
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs['recommended-latest'],
);
