// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.verify-build/*'],
  },
  {
    rules: {
      // Underscore-prefixed bindings are intentional: the `_setTypes`-style
      // compile-time union checks in i18n/hu.ts exist only to fail typecheck when
      // a domain union grows, so they are never read at runtime.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
]);
