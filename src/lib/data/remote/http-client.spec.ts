import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppFailure } from '#lib/domain/index.js';
import { HttpClient, SESSION_HEADER, toFailure } from './http-client.js';
import { HttpAuthRepository, HttpShareRepository, describeDevice } from './http-repositories.js';
import {
	LocalStorageSessionMarker,
	LocalStorageTokenStore,
	MemorySessionMarker,
	MemoryTokenStore,
	SESSION_MARKER_KEY,
	TOKENS_KEY
} from './token-store.js';

type Call = { url: string; init: RequestInit };

/** fetch falso: responde según una función y guarda las llamadas. */
function fakeFetch(handler: (call: Call, n: number) => Response | Promise<Response>) {
	const calls: Call[] = [];
	const fn = (async (url: string, init: RequestInit) => {
		const call = { url, init };
		calls.push(call);
		return handler(call, calls.length);
	}) as unknown as typeof fetch;
	return { fn, calls };
}

const json = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
	new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

const tokens = (access = 'acc1', refresh = 'ref1') => {
	const store = new MemoryTokenStore();
	store.write({ accessToken: access, refreshToken: refresh, expiresAt: '2030-01-01T00:00:00Z' });
	return store;
};

const client = (store: MemoryTokenStore, f: typeof fetch, timeoutMs?: number) =>
	new HttpClient({ baseUrl: 'https://api.test', tokens: store, fetch: f, timeoutMs });

async function failureOf(p: Promise<unknown>): Promise<AppFailure> {
	try {
		await p;
	} catch (e) {
		if (e instanceof AppFailure) return e;
		throw e;
	}
	throw new Error('debía fallar');
}

describe('toFailure', () => {
	it('traduce cada tipo de error de la API', () => {
		expect(toFailure(401, { kind: 'unauthorized', code: 'invalid-credentials' }).error).toEqual({
			kind: 'unauthorized',
			code: 'invalid-credentials'
		});
		expect(toFailure(403, { kind: 'forbidden', code: 'email-not-verified' }).error).toEqual({
			kind: 'forbidden',
			code: 'email-not-verified'
		});
		expect(toFailure(401, { kind: 'session-expired' }).error.kind).toBe('session-expired');
		expect(toFailure(401, { kind: 'device-revoked' }).error.kind).toBe('device-revoked');
		expect(toFailure(404, { kind: 'not-found', entity: 'device' }).error).toEqual({
			kind: 'not-found',
			entity: 'device'
		});
		expect(
			toFailure(422, { kind: 'validation', fields: { email: 'invalid-email' } }).error
		).toEqual({
			kind: 'validation',
			fields: { email: 'invalid-email' }
		});
		expect(toFailure(429, { kind: 'rate-limited', retryAfterSec: 90 }).error).toEqual({
			kind: 'rate-limited',
			retryAfterSec: 90
		});
	});

	it('sin cuerpo reconocible decide por el estado y nunca muestra texto del servidor', () => {
		expect(toFailure(500, { kind: 'server' }).error).toEqual({ kind: 'server', status: 500 });
		expect(toFailure(502, '<html>secreto interno</html>').error).toEqual({
			kind: 'server',
			status: 502
		});
		expect(toFailure(429, undefined, '120').error).toEqual({
			kind: 'rate-limited',
			retryAfterSec: 120
		});
		expect(toFailure(401, null).error.kind).toBe('session-expired');
		expect(
			JSON.stringify(toFailure(500, { kind: 'x', message: 'password=hunter2' }).error)
		).not.toContain('hunter2');
	});

	it('un código desconocido no se hace pasar por uno conocido', () => {
		expect(toFailure(401, { kind: 'unauthorized', code: 'otro' }).error).toEqual({
			kind: 'unauthorized',
			code: undefined
		});
	});
});

describe('HttpClient', () => {
	it('manda el token, JSON y las cabeceras de privacidad', async () => {
		const { fn, calls } = fakeFetch(() => json(200, { ok: true }));
		await client(tokens(), fn).request('POST', '/sync', { body: { a: 1 } });
		const { url, init } = calls[0];
		expect(url).toBe('https://api.test/v1/sync');
		const h = init.headers as Record<string, string>;
		expect(h.Authorization).toBe('Bearer acc1');
		expect(h['Content-Type']).toBe('application/json');
		expect(init.credentials).toBe('omit');
		expect(init.referrerPolicy).toBe('no-referrer');
		expect(init.cache).toBe('no-store');
		expect(init.body).toBe('{"a":1}');
	});

	it('sin sesión no llama a la red y falla como sesión vencida', async () => {
		const { fn, calls } = fakeFetch(() => json(200, {}));
		const e = await failureOf(client(new MemoryTokenStore(), fn).request('GET', '/me'));
		expect(e.error.kind).toBe('session-expired');
		expect(calls).toHaveLength(0);
	});

	it('las rutas públicas no envían el token', async () => {
		const { fn, calls } = fakeFetch(() => json(200, { payload: 'x' }));
		await client(tokens(), fn).request('GET', '/public/notes/abc', { auth: false });
		expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
	});

	it('204 sin cuerpo devuelve undefined', async () => {
		const { fn } = fakeFetch(() => json(204));
		expect(await client(tokens(), fn).request('DELETE', '/devices/x')).toBeUndefined();
	});

	it('un fallo de red es `network`; un tiempo agotado también', async () => {
		const down = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
		expect((await failureOf(client(tokens(), down.fn).request('GET', '/me'))).error.kind).toBe(
			'network'
		);
		const slow = (async (_u: string, init: RequestInit) =>
			new Promise((_, reject) =>
				init.signal?.addEventListener('abort', () =>
					reject(new DOMException('abort', 'AbortError'))
				)
			)) as unknown as typeof fetch;
		expect((await failureOf(client(tokens(), slow, 20).request('GET', '/me'))).error.kind).toBe(
			'network'
		);
	});

	it('renueva una vez al vencer el acceso y reintenta con el token nuevo', async () => {
		const store = tokens();
		const { fn, calls } = fakeFetch((c) => {
			if (c.url.endsWith('/auth/refresh'))
				return json(200, {
					accessToken: 'acc2',
					refreshToken: 'ref2',
					expiresAt: '2031-01-01T00:00:00Z',
					user: {}
				});
			const bearer = (c.init.headers as Record<string, string>).Authorization;
			return bearer === 'Bearer acc2'
				? json(200, { ok: 1 })
				: json(401, { kind: 'session-expired' });
		});
		expect(await client(store, fn).request('GET', '/me')).toEqual({ ok: 1 });
		expect(store.read()).toMatchObject({ accessToken: 'acc2', refreshToken: 'ref2' });
		expect(calls.map((c) => c.url.replace('https://api.test/v1', ''))).toEqual([
			'/me',
			'/auth/refresh',
			'/me'
		]);
		expect(JSON.parse(String(calls[1].init.body))).toEqual({ refreshToken: 'ref1' });
	});

	it('varias peticiones a la vez comparten UNA sola renovación (reusar el token cerraría la sesión)', async () => {
		const store = tokens();
		const { fn, calls } = fakeFetch(async (c) => {
			if (c.url.endsWith('/auth/refresh')) {
				await new Promise((r) => setTimeout(r, 20));
				return json(200, {
					accessToken: 'acc2',
					refreshToken: 'ref2',
					expiresAt: '2031-01-01T00:00:00Z',
					user: {}
				});
			}
			return (c.init.headers as Record<string, string>).Authorization === 'Bearer acc2'
				? json(200, { ok: 1 })
				: json(401, { kind: 'session-expired' });
		});
		const http = client(store, fn);
		await Promise.all([
			http.request('GET', '/a'),
			http.request('GET', '/b'),
			http.request('GET', '/c')
		]);
		expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
	});

	it('si la renovación falla, borra los tokens y avisa de sesión vencida', async () => {
		const store = tokens();
		const { fn } = fakeFetch((c) =>
			c.url.endsWith('/auth/refresh')
				? json(401, { kind: 'session-expired' })
				: json(401, { kind: 'session-expired' })
		);
		const e = await failureOf(client(store, fn).request('GET', '/me'));
		expect(e.error.kind).toBe('session-expired');
		expect(store.read()).toBeNull();
	});

	it('si no hay red al renovar, conserva la sesión', async () => {
		const store = tokens();
		const { fn } = fakeFetch((c) =>
			c.url.endsWith('/auth/refresh')
				? Promise.reject(new TypeError('x'))
				: json(401, { kind: 'session-expired' })
		);
		const e = await failureOf(client(store, fn).request('GET', '/me'));
		expect(e.error.kind).toBe('network');
		expect(store.read()).not.toBeNull();
	});

	it('si otra pestaña ya renovó, usa sus tokens sin renovar de nuevo', async () => {
		const store = tokens('acc1', 'ref1');
		const { fn, calls } = fakeFetch((c) => {
			const bearer = (c.init.headers as Record<string, string>).Authorization;
			if (bearer === 'Bearer acc1') {
				store.write({
					accessToken: 'accOtraPestaña',
					refreshToken: 'refOtra',
					expiresAt: '2031-01-01T00:00:00Z'
				}); // otra pestaña renovó
				return json(401, { kind: 'session-expired' });
			}
			return json(200, { ok: 1 });
		});
		expect(await client(store, fn).request('GET', '/me')).toEqual({ ok: 1 });
		expect(calls.some((c) => c.url.endsWith('/auth/refresh'))).toBe(false);
	});

	it('un dispositivo quitado borra los tokens y no intenta renovar', async () => {
		const store = tokens();
		const { fn, calls } = fakeFetch(() => json(401, { kind: 'device-revoked' }));
		const e = await failureOf(client(store, fn).request('GET', '/me'));
		expect(e.error.kind).toBe('device-revoked');
		expect(store.read()).toBeNull();
		expect(calls).toHaveLength(1);
	});

	it('los errores de validación llevan los campos', async () => {
		const { fn } = fakeFetch(() =>
			json(422, { kind: 'validation', fields: { currentPassword: 'wrong-password' } })
		);
		const e = await failureOf(client(tokens(), fn).request('POST', '/me/password', { body: {} }));
		expect(e.error).toEqual({ kind: 'validation', fields: { currentPassword: 'wrong-password' } });
	});
});

describe('HttpAuthRepository', () => {
	const session = {
		user: {
			id: 'u1',
			email: 'a@b.com',
			fullName: 'Ana',
			emailVerified: true,
			createdAt: '2026-01-01T00:00:00Z'
		},
		expiresAt: '2026-01-01T00:15:00Z'
	};

	it('al iniciar sesión guarda los tokens y no los deja en lo que devuelve', async () => {
		const store = new MemoryTokenStore();
		const { fn, calls } = fakeFetch(() =>
			json(200, {
				...session,
				accessToken: 'A',
				refreshToken: 'R',
				keys: { wrappedMasterKey: 'k' }
			})
		);
		const repo = new HttpAuthRepository(client(store, fn), () => 'Chrome en Linux');
		const out = await repo.login({ email: 'a@b.com', authKey: 'x' });
		expect(store.read()).toMatchObject({ accessToken: 'A', refreshToken: 'R' });
		expect(JSON.stringify(out)).not.toContain('"R"');
		expect(out).not.toHaveProperty('accessToken');
		expect(out).not.toHaveProperty('refreshToken');
		expect(out.keys).toEqual({ wrappedMasterKey: 'k' });
		expect(JSON.parse(String(calls[0].init.body))).toEqual({
			email: 'a@b.com',
			authKey: 'x',
			device: { name: 'Chrome en Linux', platform: 'web' }
		});
	});

	it('verifyEmail guarda la sesión y devuelve el usuario', async () => {
		const store = new MemoryTokenStore();
		const { fn } = fakeFetch(() => json(200, { ...session, accessToken: 'A', refreshToken: 'R' }));
		const user = await new HttpAuthRepository(client(store, fn)).verifyEmail('a@b.com', '123456');
		expect(user.id).toBe('u1');
		expect(store.read()?.refreshToken).toBe('R');
	});

	it('cerrar sesión borra los tokens aunque el servidor no responda', async () => {
		const store = tokens();
		const { fn } = fakeFetch(() => Promise.reject(new TypeError('sin red')));
		await new HttpAuthRepository(client(store, fn)).logout();
		expect(store.read()).toBeNull();
	});

	it('sin tokens, currentSession es null y no llama a la red', async () => {
		const { fn, calls } = fakeFetch(() => json(200, session));
		expect(
			await new HttpAuthRepository(client(new MemoryTokenStore(), fn)).currentSession()
		).toBeNull();
		expect(calls).toHaveLength(0);
	});

	it('eliminar la cuenta pide la contraseña y cierra la sesión local', async () => {
		const a = tokens();
		const { fn, calls } = fakeFetch(() => json(202));
		await new HttpAuthRepository(client(a, fn)).deleteAccount('prueba');
		expect(calls[0].init.method).toBe('POST');
		expect(calls[0].url).toBe('https://api.test/v1/me/delete');
		expect(JSON.parse(String(calls[0].init.body))).toEqual({ authKey: 'prueba' });
		expect(a.read()).toBeNull();
	});

	it('si el servidor rechaza la contraseña, la sesión local se conserva', async () => {
		const store = tokens();
		const { fn } = fakeFetch(() =>
			json(422, { kind: 'validation', fields: { password: 'wrong-password' } })
		);
		await expect(new HttpAuthRepository(client(store, fn)).deleteAccount('mala')).rejects.toThrow(
			AppFailure
		);
		expect(store.read()).not.toBeNull();
	});

	it('restablecer la contraseña también cierra la sesión local', async () => {
		const b = tokens();
		await new HttpAuthRepository(client(b, fakeFetch(() => json(204)).fn)).resetPassword(
			{} as never
		);
		expect(b.read()).toBeNull();
	});

	it('el nombre del dispositivo se deduce del navegador', () => {
		expect(
			describeDevice('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36')
		).toBe('Chrome en Linux');
		expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/121.0')).toBe(
			'Firefox en Windows'
		);
		expect(describeDevice('')).toBe('Navegador');
	});
});

describe('HttpShareRepository', () => {
	it('«sin enlace» llega como null y el slug se codifica en la URL', async () => {
		const { fn, calls } = fakeFetch(() => new Response('null', { status: 200 }));
		const repo = new HttpShareRepository(client(tokens(), fn));
		expect(await repo.getLink('n1')).toBeNull();
		await repo.readPublic('a/b?c').catch(() => undefined);
		expect(calls[1].url).toBe('https://api.test/v1/public/notes/a%2Fb%3Fc');
	});
});

/** localStorage falso para probar el modo cookie sin un navegador. */
function fakeLocalStorage() {
	const map = new Map<string, string>();
	return {
		store: map,
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, String(v)),
		removeItem: (k: string) => void map.delete(k),
		clear: () => map.clear(),
		key: (i: number) => [...map.keys()][i] ?? null,
		get length() {
			return map.size;
		}
	};
}

/** Cliente en modo cookie: tokens en memoria (el store no se usa) + marcador. */
const cookieClient = (
	marker: MemorySessionMarker,
	f: typeof fetch,
	timeoutMs?: number
): HttpClient =>
	new HttpClient({
		baseUrl: 'https://api.test',
		tokens: new MemoryTokenStore(),
		sessionMode: 'cookie',
		marker,
		fetch: f,
		timeoutMs
	});

const cookieSession = {
	user: {
		id: 'u1',
		email: 'a@b.com',
		fullName: 'Ana',
		emailVerified: true,
		createdAt: '2026-01-01T00:00:00Z'
	},
	expiresAt: '2026-01-01T00:15:00Z'
};

describe('HttpClient en modo cookie', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('login guarda el marcador y NO deja el token en localStorage', async () => {
		const ls = fakeLocalStorage();
		vi.stubGlobal('localStorage', ls);
		const { fn, calls } = fakeFetch(() =>
			json(200, {
				...cookieSession,
				accessToken: 'ACCESS-SECRET-XYZ',
				keys: { wrappedMasterKey: 'k' }
			})
		);
		const http = new HttpClient({
			baseUrl: 'https://api.test',
			tokens: new LocalStorageTokenStore(),
			sessionMode: 'cookie',
			marker: new LocalStorageSessionMarker(),
			fetch: fn
		});
		const repo = new HttpAuthRepository(http, () => 'Chrome en Linux');
		await repo.login({ email: 'a@b.com', authKey: 'x' });

		expect(ls.getItem(SESSION_MARKER_KEY)).toBe('{"v":1}');
		expect(ls.getItem(TOKENS_KEY)).toBeNull();
		// Ninguna clave ni valor de localStorage contiene el token.
		for (const [key, value] of ls.store) {
			expect(key).not.toContain('ACCESS-SECRET-XYZ');
			expect(value).not.toContain('ACCESS-SECRET-XYZ');
		}
		const loginCall = calls[0];
		expect((loginCall.init.headers as Record<string, string>)[SESSION_HEADER]).toBe('cookie');
		expect(loginCall.init.credentials).toBe('include');
	});

	it('la cabecera X-Apunte-Session solo va en login, verify-email, refresh y logout', async () => {
		const marker = new MemorySessionMarker();
		const { fn, calls } = fakeFetch((c) => {
			if (c.url.endsWith('/auth/login'))
				return json(200, { ...cookieSession, accessToken: 'acc1' });
			if (c.url.endsWith('/auth/verify-email')) return json(200, { ...cookieSession });
			if (c.url.endsWith('/auth/refresh'))
				return json(200, { accessToken: 'acc2', expiresAt: 'x' });
			return json(200, { ok: 1 });
		});
		const http = cookieClient(marker, fn);
		const repo = new HttpAuthRepository(http);
		await repo.login({ email: 'a@b.com', authKey: 'x' });
		await repo.verifyEmail('a@b.com', '123456');
		await http.request('GET', '/me');
		await repo.logout();

		const header = (i: number) => (calls[i].init.headers as Record<string, string>)[SESSION_HEADER];
		expect(header(0)).toBe('cookie');
		expect(header(1)).toBe('cookie');
		expect(header(2)).toBeUndefined(); // /me
		expect(header(3)).toBe('cookie'); // logout
		expect(calls.every((c) => c.init.credentials === 'include')).toBe(true);
	});

	it('al arrancar con marcador renueva sin cuerpo y reintenta la petición', async () => {
		const marker = new MemorySessionMarker();
		marker.set();
		const { fn, calls } = fakeFetch((c) => {
			if (c.url.endsWith('/auth/refresh'))
				return json(200, { accessToken: 'acc-new', expiresAt: '2031-01-01T00:00:00Z' });
			return (c.init.headers as Record<string, string>).Authorization === 'Bearer acc-new'
				? json(200, { ok: 1 })
				: json(401, { kind: 'session-expired' });
		});
		expect(await cookieClient(marker, fn).request('GET', '/me')).toEqual({ ok: 1 });
		const refresh = calls.find((c) => c.url.endsWith('/auth/refresh'))!;
		expect(refresh.init.body).toBeUndefined();
		expect((refresh.init.headers as Record<string, string>)[SESSION_HEADER]).toBe('cookie');
		expect(calls.map((c) => c.url.replace('https://api.test/v1', ''))).toEqual([
			'/auth/refresh',
			'/me'
		]);
	});

	it('una petición con 401 renueva una vez y reintenta con el token nuevo', async () => {
		const marker = new MemorySessionMarker();
		const { fn, calls } = fakeFetch((c) => {
			if (c.url.endsWith('/auth/login'))
				return json(200, { ...cookieSession, accessToken: 'acc1' });
			if (c.url.endsWith('/auth/refresh'))
				return json(200, { accessToken: 'acc2', expiresAt: '2031-01-01T00:00:00Z' });
			return (c.init.headers as Record<string, string>).Authorization === 'Bearer acc2'
				? json(200, { ok: 1 })
				: json(401, { kind: 'session-expired' });
		});
		const http = cookieClient(marker, fn);
		await new HttpAuthRepository(http).login({ email: 'a@b.com', authKey: 'x' });
		expect(await http.request('GET', '/me')).toEqual({ ok: 1 });
		expect(calls.map((c) => c.url.replace('https://api.test/v1', ''))).toEqual([
			'/auth/login',
			'/me',
			'/auth/refresh',
			'/me'
		]);
	});

	it('varias peticiones comparten UNA sola renovación en modo cookie', async () => {
		const marker = new MemorySessionMarker();
		marker.set();
		const { fn, calls } = fakeFetch(async (c) => {
			if (c.url.endsWith('/auth/refresh')) {
				await new Promise((r) => setTimeout(r, 20));
				return json(200, { accessToken: 'acc2', expiresAt: '2031-01-01T00:00:00Z' });
			}
			return (c.init.headers as Record<string, string>).Authorization === 'Bearer acc2'
				? json(200, { ok: 1 })
				: json(401, { kind: 'session-expired' });
		});
		const http = cookieClient(marker, fn);
		await Promise.all([
			http.request('GET', '/a'),
			http.request('GET', '/b'),
			http.request('GET', '/c')
		]);
		expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
	});

	it('si no hay red al renovar, conserva el marcador', async () => {
		const marker = new MemorySessionMarker();
		marker.set();
		const { fn } = fakeFetch(() => Promise.reject(new TypeError('x')));
		const e = await failureOf(cookieClient(marker, fn).request('GET', '/me'));
		expect(e.error.kind).toBe('network');
		expect(marker.has()).toBe(true);
	});

	it('session-expired borra el marcador; device-revoked también', async () => {
		const expired = new MemorySessionMarker();
		expired.set();
		const e1 = await failureOf(
			cookieClient(expired, fakeFetch(() => json(401, { kind: 'session-expired' })).fn).request(
				'GET',
				'/me'
			)
		);
		expect(e1.error.kind).toBe('session-expired');
		expect(expired.has()).toBe(false);

		const revoked = new MemorySessionMarker();
		revoked.set();
		const e2 = await failureOf(
			cookieClient(revoked, fakeFetch(() => json(401, { kind: 'device-revoked' })).fn).request(
				'GET',
				'/me'
			)
		);
		expect(e2.error.kind).toBe('device-revoked');
		expect(revoked.has()).toBe(false);
	});

	it('ignora un refreshToken que llegara por error en el JSON del refresh', async () => {
		const marker = new MemorySessionMarker();
		marker.set();
		const { fn, calls } = fakeFetch((c) => {
			if (c.url.endsWith('/auth/refresh'))
				return json(200, {
					accessToken: 'acc2',
					refreshToken: 'SHOULD-IGNORE',
					expiresAt: '2031-01-01T00:00:00Z'
				});
			return (c.init.headers as Record<string, string>).Authorization === 'Bearer acc2'
				? json(200, { ok: 1 })
				: json(401, { kind: 'session-expired' });
		});
		expect(await cookieClient(marker, fn).request('GET', '/me')).toEqual({ ok: 1 });
		expect(JSON.stringify(calls)).not.toContain('SHOULD-IGNORE');
	});

	it('logout limpia el marcador aunque el servidor falle', async () => {
		const marker = new MemorySessionMarker();
		marker.set();
		const { fn } = fakeFetch(() => Promise.reject(new TypeError('sin red')));
		const http = cookieClient(marker, fn);
		const repo = new HttpAuthRepository(http);
		await repo.logout();
		expect(marker.has()).toBe(false);
	});

	it('la migración borra apunte.tokens pero no toca IndexedDB', () => {
		const ls = fakeLocalStorage();
		ls.setItem(TOKENS_KEY, JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresAt: 'x' }));
		vi.stubGlobal('localStorage', ls);
		const indexedDB = { open: vi.fn() };
		vi.stubGlobal('indexedDB', indexedDB);
		new LocalStorageSessionMarker();
		expect(ls.getItem(TOKENS_KEY)).toBeNull();
		expect(indexedDB.open).not.toHaveBeenCalled();
	});
});
