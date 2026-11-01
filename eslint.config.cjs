const parser = require('@typescript-eslint/parser');
const plugin = require('@typescript-eslint/eslint-plugin');

module.exports = [{
    files: ['src/**/*.ts'],
    languageOptions: { parser, parserOptions: { project: ['./tsconfig.json', './tsconfig.webview.json'] } },
    plugins: { '@typescript-eslint': plugin },
    rules: { ...plugin.configs.recommended.rules }
}, {
    // Existing renderer/extension code predates the typed feature boundary.
    files: ['src/webview/preview.ts', 'src/extension/extension.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': 'off' }
}];
