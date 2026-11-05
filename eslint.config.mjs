import tseslint from 'typescript-eslint';
import boundaries from './tooling/boundaries.mjs';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.turbo/**', 'spikes/**'] },
  {
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { architecture: { rules: { boundaries } }, '@typescript-eslint': tseslint.plugin },
    rules: { 'architecture/boundaries': 'error', '@typescript-eslint/no-explicit-any': 'error' },
  },
  { files: ['apps/api/**/*.{ts,tsx,mts,cts,js,mjs,cjs}', 'workers/**/*.{ts,tsx,mts,cts,js,mjs,cjs}', 'packages/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'], rules: { 'no-console': 'error' } },
];
