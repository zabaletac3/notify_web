// Utilidades de criptografía **solo** para pruebas y para el generador de vectores
// (`scripts/generate-vectors.ts`). No forman parte de la API pública de la app: `index.ts` no las
// re-exporta, así que el código de producción no puede importarlas por accidente.
//
// `sealWithIv` existe para cifrar de forma reproducible (IV fijo) y poder fijar vectores compartidos
// con las apps nativas. La app siempre usa `seal`, que genera un IV aleatorio.
export { sealWithIv } from './sealed.js';
