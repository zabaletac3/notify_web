import type { Folder, Id, Note } from '#lib/domain/index.js';
import type { Dataset } from '../scenario.svelte.js';
import { createRandom } from './prng.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const DEMO_DEVICE_ID = 'd_laptop';

interface Seed {
	title: string;
	content: string;
	folder: string | null;
	tags?: string[];
	pinned?: boolean;
	/** Cuánto hace que se editó (ms). */
	age: number;
}

const BD2 = `La normalización organiza las tablas para evitar redundancia y anomalías al insertar, actualizar o borrar. Para el parcial entran las tres primeras formas normales, con el ejemplo de matrícula que vimos en clase.

## Formas normales

- **1FN:** valores atómicos, sin grupos repetidos.
- **2FN:** sin dependencias parciales de la clave.
- **3FN:** sin dependencias transitivas.

## Pendientes

- [x] Repasar ejemplos de dependencias funcionales
- [x] Hacer el taller 4 (diagramas ER)
- [ ] Preguntar al profe por BCNF
- [ ] Armar fichas para el viernes

> Una tabla está en 3FN si todo atributo no clave depende de la clave, de toda la clave y nada más que de la clave.`;

/** Notas escritas a mano: son las que aparecen en las pantallas del diseño. */
const HANDMADE: Seed[] = [
	{
		title: 'Plan del proyecto final',
		folder: 'Universidad',
		tags: ['proyecto-final'],
		pinned: true,
		age: 6 * DAY,
		content:
			'Entregables: prototipo en Figma, app en Tauri, API en Go y documentación.\n\n## Fechas\n\n- [x] Prototipo en Figma\n- [ ] App web con SvelteKit\n- [ ] Backend con Go y MongoDB\n- [ ] Sustentación'
	},
	{
		title: 'Lista de compras de la semana',
		folder: 'Personal',
		pinned: true,
		age: 2 * DAY,
		content: '- [ ] Leche\n- [ ] Pan\n- [x] Café\n- [ ] Tomates\n- [ ] Arroz'
	},
	{
		title: 'Resumen: Bases de datos II',
		folder: 'Universidad',
		tags: ['parcial', 'lecturas'],
		age: 42 * MIN,
		content: BD2
	},
	{
		title: 'Lectura — Diseño centrado en el usuario',
		folder: 'Universidad',
		tags: ['lecturas'],
		age: 1 * DAY + 3 * HOUR,
		content:
			'Capítulos 3 y 4. Ideas clave sobre modelos mentales y retroalimentación.\n\n- Los usuarios construyen **modelos mentales** a partir de experiencias previas.\n- Toda acción debe tener una respuesta visible.'
	},
	{
		title: 'Ejercicios de cálculo vectorial',
		folder: 'Universidad',
		tags: ['parcial'],
		age: 3 * DAY,
		content:
			'Taller 5: gradiente, divergencia y rotacional con ejemplos resueltos.\n\n1. Calcular el gradiente de f(x, y) = x²y.\n2. Hallar la divergencia de F = (x, y, z).'
	},
	{
		title: 'Notas de clase — Redes',
		folder: 'Universidad',
		tags: ['lecturas'],
		age: 4 * DAY,
		content: 'Modelo OSI vs TCP/IP, encapsulamiento y herramientas de diagnóstico.'
	},
	{
		title: 'Ideas para la exposición',
		folder: 'Ideas',
		pinned: true,
		age: 5 * DAY,
		content: 'Abrir con una demo en vivo, luego explicar la arquitectura y cerrar con preguntas.'
	},
	{
		title: 'Notas del taller de diseño',
		folder: 'Universidad',
		tags: ['proyecto-final'],
		age: 9 * DAY,
		content: 'Retroalimentación del prototipo: contraste del texto secundario y tamaños táctiles.'
	}
];

const POOLS: Record<string, { titles: string[]; texts: string[] }> = {
	Universidad: {
		titles: [
			'Apuntes de álgebra lineal',
			'Resumen: sistemas operativos',
			'Taller de estructuras de datos',
			'Guía de estudio — probabilidad',
			'Laboratorio de física II',
			'Preguntas para el examen',
			'Repaso de grafos',
			'Notas de ingeniería de software',
			'Cronograma del semestre'
		],
		texts: [
			'Repasar definiciones y los ejemplos de la clase del martes.',
			'Entregar antes del viernes. Revisar rúbrica y fuentes.',
			'Ideas principales y dudas para preguntar en la próxima sesión.'
		]
	},
	Personal: {
		titles: [
			'Metas del mes',
			'Regalos de cumpleaños',
			'Rutina de ejercicio',
			'Gastos de octubre',
			'Libros por leer',
			'Viaje de fin de año',
			'Citas médicas',
			'Ideas para el apartamento'
		],
		texts: [
			'Pendiente definir fechas y presupuesto.',
			'Anotar avances cada domingo.',
			'Revisar opciones y comparar precios.'
		]
	},
	Ideas: {
		titles: [
			'App de recordatorios de riego',
			'Idea de podcast universitario',
			'Mejoras para AxoNote',
			'Nombre para el proyecto'
		],
		texts: [
			'Boceto rápido: lo más importante primero, detalles después.',
			'Validar con tres compañeros antes de invertir tiempo.'
		]
	},
	Recetas: {
		titles: ['Arepas de queso', 'Sopa de lentejas', 'Brownies sin gluten', 'Ajiaco'],
		texts: [
			'Ingredientes y pasos. Cocinar a fuego medio.',
			'Ajustar la sal al final y servir caliente.'
		]
	},
	'': {
		titles: [
			'Contraseñas de WiFi',
			'Teléfonos útiles',
			'Pendientes sueltos',
			'Cosas por preguntar',
			'Enlaces para después',
			'Borrador de correo',
			'Ideas rápidas',
			'Recordatorio',
			'Lista de tareas',
			'Notas de la reunión del lunes',
			'Cuentas por pagar',
			'Plan de lectura',
			'Inventario',
			'Presupuesto',
			'Apuntes sueltos',
			'Agenda',
			'Para recordar',
			'Resumen semanal'
		],
		texts: [
			'Anotado para no olvidarlo.',
			'Revisar esto cuando haya tiempo.',
			'Cosas pendientes de la semana.'
		]
	}
};

/** Cuántas notas activas debe tener cada carpeta (los contadores del diseño). */
const FOLDER_TARGETS: Record<string, number> = {
	Universidad: 12,
	Personal: 9,
	Ideas: 5,
	Recetas: 4,
	'': 18 // sin carpeta
};

/** Cuántas notas llevan cada etiqueta (los contadores del diseño). */
const TAG_TARGETS: Record<string, number> = { parcial: 6, 'proyecto-final': 3, lecturas: 8 };

export interface BuiltFolders {
	folders: Folder[];
	byName: Record<string, Id>;
}

export function buildFolders(now: Date, dataset: Dataset): BuiltFolders {
	if (dataset === 'first-time') return { folders: [], byName: {} };
	const names = ['Universidad', 'Personal', 'Ideas', 'Recetas', 'Proyectos'];
	const created = new Date(now.getTime() - 90 * DAY).toISOString();
	const folders = names.map((name, i) => ({
		id: `f_${i + 1}`,
		name,
		createdAt: created,
		updatedAt: created
	}));
	return { folders, byName: Object.fromEntries(folders.map((f) => [f.name, f.id])) };
}

function toNote(seed: Seed, index: number, now: Date, byName: Record<string, Id>): Note {
	const updated = new Date(now.getTime() - seed.age).toISOString();
	return {
		id: `n_${index + 1}`,
		folderId: seed.folder ? (byName[seed.folder] ?? null) : null,
		title: seed.title,
		content: seed.content,
		tags: seed.tags ?? [],
		pinned: seed.pinned ?? false,
		createdAt: new Date(now.getTime() - seed.age - 3 * DAY).toISOString(),
		updatedAt: updated,
		deletedAt: null,
		revision: 1,
		syncStatus: 'synced',
		lastEditedDeviceId: DEMO_DEVICE_ID
	};
}

/** Notas de papelera: vencen a los 29, 16 y 9 días (como en el diseño). */
function trashSeeds(): (Seed & { deletedAgo: number })[] {
	return [
		{
			title: 'Borrador de informe',
			content: 'Introducción y objetivos del laboratorio…',
			folder: 'Universidad',
			age: 3 * DAY,
			deletedAgo: 1 * DAY
		},
		{
			title: 'Lista de compras',
			content: 'Leche, pan, tomates, café, arroz…',
			folder: 'Personal',
			age: 20 * DAY,
			deletedAgo: 14 * DAY
		},
		{
			title: 'Notas de la reunión',
			content: 'Revisar el cronograma y repartir tareas…',
			folder: null,
			age: 30 * DAY,
			deletedAgo: 21 * DAY
		}
	];
}

export function buildNotes(now: Date, dataset: Dataset, byName: Record<string, Id>): Note[] {
	if (dataset === 'first-time') return [];
	const rnd = createRandom(2026);
	const seeds: Seed[] = [...HANDMADE];

	if (dataset === 'large') {
		const all = Object.values(POOLS).flatMap((p) => p.titles);
		const folders = ['Universidad', 'Personal', 'Ideas', 'Recetas', null];
		for (let i = 0; i < 2000; i++) {
			seeds.push({
				title: `${rnd.pick(all)} ${i + 1}`,
				content: rnd.pick(POOLS[''].texts),
				folder: rnd.pick(folders),
				age: rnd.int(1, 400) * DAY + rnd.int(0, 23) * HOUR
			});
		}
	} else {
		// Completa cada carpeta hasta su objetivo con notas de los pools.
		const have: Record<string, number> = {};
		for (const s of HANDMADE) have[s.folder ?? ''] = (have[s.folder ?? ''] ?? 0) + 1;
		for (const [folder, target] of Object.entries(FOLDER_TARGETS)) {
			const pool = POOLS[folder];
			for (let i = have[folder] ?? 0, k = 0; i < target; i++, k++) {
				seeds.push({
					title: pool.titles[k % pool.titles.length] + (k >= pool.titles.length ? ' (2)' : ''),
					content: rnd.pick(pool.texts),
					folder: folder || null,
					age: (7 + rnd.int(0, 120)) * DAY + rnd.int(0, 23) * HOUR
				});
			}
		}
		// Asigna etiquetas hasta cumplir los contadores del diseño.
		const tagCount: Record<string, number> = {};
		for (const s of seeds) for (const t of s.tags ?? []) tagCount[t] = (tagCount[t] ?? 0) + 1;
		for (const [tag, target] of Object.entries(TAG_TARGETS)) {
			// Solo las notas generadas reciben etiquetas extra; las escritas a mano se quedan como están.
			for (const s of seeds.slice(HANDMADE.length)) {
				if ((tagCount[tag] ?? 0) >= target) break;
				if (s.tags?.includes(tag)) continue;
				s.tags = [...(s.tags ?? []), tag];
				tagCount[tag] = (tagCount[tag] ?? 0) + 1;
			}
		}
	}

	const notes = seeds.map((s, i) => toNote(s, i, now, byName));

	if (dataset === 'normal') {
		trashSeeds().forEach((s, i) => {
			const n = toNote(s, notes.length + i, now, byName);
			n.deletedAt = new Date(now.getTime() - s.deletedAgo).toISOString();
			notes.push(n);
		});
	}
	return notes;
}
