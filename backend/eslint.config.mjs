import tseslint from 'typescript-eslint';

// Backend lint config. Lints the NestJS/TypeScript sources under src/.
// Generated code, build output, and Prisma artifacts are excluded.
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'prisma/**',
      '*.config.js',
      // macOS AppleDouble resource forks on the external volume
      '**/._*',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow the `const { secret: _secret, ...safe } = obj` omit pattern.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true },
      ],
    },
  },
);
