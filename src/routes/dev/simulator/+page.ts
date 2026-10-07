import { error } from '@sveltejs/kit';

// Panel del simulador de escenarios: solo disponible en desarrollo.
export const ssr = false;

export const load = () => {
	if (!import.meta.env.DEV) error(404, 'Not found');
};
