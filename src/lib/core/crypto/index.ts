// Criptografía de AxoNote (ver docs/plans/0005-cifrado-extremo-a-extremo.md y ADR 0005).
// No se re-exporta desde `core/index.ts` para no cargar Argon2 (WASM) donde no hace falta.
export * from './bytes.js';
// Explícito (no `export *`) para que `sealWithIv`, solo para vectores y pruebas, no sea API pública.
export { DecryptError, isSealed, open, seal, type Sealed } from './sealed.js';
export * from './padding.js';
export * from './kdf.js';
export * from './keys.js';
export * from './recovery-key.js';
