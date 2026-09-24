/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  rules: {
    'media-feature-range-notation': 'prefix',
  },
};
