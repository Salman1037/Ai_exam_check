import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default defineConfig([
  js.configs.recommended,
  ...ts.configs.recommended,
  hooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        matchMedia: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        XMLHttpRequest: 'readonly',
        File: 'readonly',
        FileList: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        createImageBitmap: 'readonly',
        process: 'readonly',
        React: 'readonly',
        Event: 'readonly',
      },
    },
  },
  globalIgnores([
    '.next/**',
    'node_modules/**',
    '.npm-cache/**',
    'next-env.d.ts',
  ]),
]);
