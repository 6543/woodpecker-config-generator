import js from '@eslint/js';
import globals from 'globals';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier/flat';
import vue from 'eslint-plugin-vue';

export default ts.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      // Copied verbatim from the Go toolchain, must match the compiler.
      '**/public/wasm-exec.js',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['apps/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.config.ts', '**/*.test.ts', 'packages/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
