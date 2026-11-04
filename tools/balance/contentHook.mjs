/**
 * Enganche del cargador de modulos de Node para los hilos de la herramienta de equilibrio: al cargar
 * el nucleo, src/core/content/active.ts (el contenido en uso) se sustituye por el de la variante que
 * se le pasa al registrarlo. Asi cada hilo juega con su contenido sin cambiar el de nadie (el nucleo
 * lo congela). Lo registra worker.ts antes de importar nada del nucleo.
 */
const ACTIVE_CONTENT_FILE = '/src/core/content/active.ts';
const VARIANT_URL = 'ilogic-variant:content';

/** Contenido de la variante (un GameContent, como JSON). */
let variantContent;

export function initialize(content) {
  variantContent = content;
}

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  return resolved.url.endsWith(ACTIVE_CONTENT_FILE) ? { url: VARIANT_URL, shortCircuit: true } : resolved;
}

export async function load(url, context, nextLoad) {
  if (url !== VARIANT_URL) return nextLoad(url, context);
  return { format: 'module', source: `export const ACTIVE_CONTENT = ${JSON.stringify(variantContent)};`, shortCircuit: true };
}
