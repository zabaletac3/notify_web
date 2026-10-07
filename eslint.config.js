// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

/** Prohíbe importar archivos internos de una feature (solo su index). */
const deepFeatureImport = {
	group: ['\\#lib/features/*/*', '\\#lib/features/*/*/**'],
	message: 'Importa la feature desde su index: #lib/features/<nombre>/index.js'
};

/** Prohíbe que una capa dependa de capas superiores. */
const layer = (name, forbidden) => ({
	group: forbidden.flatMap((f) => [`\\#lib/${f}`, `\\#lib/${f}/**`]),
	message: `La capa "${name}" no puede depender de: ${forbidden.join(', ')}`
});

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	...storybook.configs['flat/recommended'],
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Límites de arquitectura (ver docs/architecture.md):
		// una feature solo se consume por su index.ts, nunca por sus carpetas internas.
		files: ['src/**/*.{ts,js,svelte}'],
		rules: {
			'no-restricted-imports': ['error', { patterns: [deepFeatureImport] }]
		}
	},
	{
		// domain: tipos puros, no depende de nada de la app.
		files: ['src/lib/domain/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: [layer('domain', ['features', 'components', 'data', 'core'])] }
			]
		}
	},
	{
		// core: infraestructura transversal, no conoce UI, features ni datos.
		files: ['src/lib/core/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: [deepFeatureImport, layer('core', ['features', 'components', 'data'])] }
			]
		}
	},
	{
		// data: contratos e implementaciones de datos, no conoce la UI.
		files: ['src/lib/data/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: [deepFeatureImport, layer('data', ['features', 'components'])] }
			]
		}
	},
	{
		// components/ui (shadcn): genérico, no conoce features ni datos.
		files: ['src/lib/components/ui/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{ patterns: [deepFeatureImport, layer('components/ui', ['features', 'data', 'domain'])] }
			]
		}
	}
);
