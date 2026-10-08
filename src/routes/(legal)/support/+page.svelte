<script lang="ts">
	import { Banner } from '#lib/components/app/index.js';
	import { RESPONSIBLE } from '#lib/legal/meta.js';
	import { APP_VERSION } from '#lib/legal/version.js';

	const mailto = `mailto:${RESPONSIBLE.email}`;
</script>

<svelte:head>
	<title>Contacto y soporte · Apunte</title>
	<meta
		name="description"
		content="Cómo contactar con el equipo de Apunte, qué incluir en tu mensaje y dónde ejercer tus derechos sobre tus datos."
	/>
</svelte:head>

<article class="flex flex-col gap-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-title font-bold">Contacto y soporte</h1>
		<p class="text-body">
			¿Tienes un problema con Apunte o una duda? Escríbenos a
			<a
				href={mailto}
				class="font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				{RESPONSIBLE.email}
			</a>
			y te responderemos.
		</p>
	</header>

	<Banner
		message="Nunca te pediremos tu contraseña ni tu clave de recuperación. Si alguien te los pide en nombre de Apunte, no se los des."
	/>

	<section class="flex flex-col gap-2">
		<h2 class="text-heading font-semibold">Qué incluir en tu mensaje</h2>
		<ul class="flex list-disc flex-col gap-1.5 pl-5 text-body">
			<li>El correo de tu cuenta.</li>
			<li>La plataforma en la que usas Apunte (web, escritorio, iOS o Android).</li>
			<li>
				La versión de la app (versión {APP_VERSION}) y, si puedes, una descripción del problema.
			</li>
		</ul>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-heading font-semibold">Solicitudes sobre tus datos personales</h2>
		<p class="text-body">
			Las consultas y reclamos sobre tus datos personales (conocer, actualizar, rectificar o
			suprimir) también se envían a
			<a
				href={mailto}
				class="font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				{RESPONSIBLE.email}
			</a>. Los plazos y el procedimiento están en la
			<a
				href="/privacy"
				class="font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				Política de privacidad</a
			>.
		</p>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="text-heading font-semibold">Más información</h2>
		<ul class="flex list-disc flex-col gap-1.5 pl-5 text-body">
			<li>
				<a
					href="/terms"
					class="font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					Términos de uso</a
				>
			</li>
			<li>
				<a
					href="/privacy"
					class="font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					Política de privacidad</a
				>
			</li>
		</ul>
	</section>
</article>
