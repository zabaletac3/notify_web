import type { Preview } from '@storybook/sveltekit';
import '../src/routes/layout.css';

/** Aplica el tema claro/oscuro de AxoNote (clase `.dark`, igual que mode-watcher). */
const applyTheme = (theme: string) => {
	document.documentElement.classList.toggle('dark', theme === 'dark');
};

const preview: Preview = {
	globalTypes: {
		theme: {
			description: 'Tema',
			toolbar: {
				title: 'Tema',
				icon: 'mirror',
				items: [
					{ value: 'light', title: 'Claro' },
					{ value: 'dark', title: 'Oscuro' }
				],
				dynamicTitle: true
			}
		}
	},
	initialGlobals: { theme: 'light' },
	// Sincroniza el tema antes de pintar cada historia.
	beforeEach: ({ globals }) => {
		applyTheme(globals.theme);
	},
	parameters: {
		layout: 'centered',
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i
			}
		},
		backgrounds: { disabled: true },
		a11y: {
			// 'todo' = mostrar violaciones de accesibilidad solo en la interfaz de Storybook
			test: 'todo'
		}
	}
};

export default preview;
