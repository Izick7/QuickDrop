export default [{
  files: ['src/**/*.js', 'src/**/*.jsx'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
    globals: { window: 'readonly', localStorage: 'readonly', URL: 'readonly', fetch: 'readonly', Intl: 'readonly', import: 'readonly' },
  },
}];
