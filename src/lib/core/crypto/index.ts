// Criptografía de Apunte (ver docs/plans/0005-cifrado-extremo-a-extremo.md y ADR 0005).
// No se re-exporta desde `core/index.ts` para no cargar Argon2 (WASM) donde no hace falta.
export * from './bytes.js';
export * from './sealed.js';
export * from './padding.js';
export * from './kdf.js';
export * from './keys.js';
export * from './recovery-key.js';
