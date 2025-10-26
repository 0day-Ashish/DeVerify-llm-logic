module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  parser: '@typescript-eslint/parser',
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  plugins: ['@typescript-eslint'],
  rules: {}
};
