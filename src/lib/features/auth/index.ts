// API pública de la feature "auth". Importar siempre desde aquí, nunca desde sus carpetas internas.
export {
	AuthState,
	MAX_UNLOCK_ATTEMPTS,
	RESEND_COOLDOWN_SECONDS,
	type PasswordResetChoice
} from './state/auth.svelte.js';
