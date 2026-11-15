import { tarjetasSchema, type Tarjeta } from "./esquema";
import crudo from "./tarjetas.json";

/**
 * Hash FNV-1a del contenido canónico de las tarjetas.
 *
 * El script de indexado calcula el mismo valor. Si no coincide con el que
 * guardó `vectores.json`, el índice está viejo y la búsqueda pasa a léxica.
 * Se implementa a mano para no depender de `node:crypto` en un módulo que
 * también podría tocar el bundle del cliente.
 */
export function hashContenido(texto: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const TARJETAS: Tarjeta[] = tarjetasSchema.parse(crudo);

export const HASH_TARJETAS = hashContenido(JSON.stringify(crudo));

export const TARJETAS_POR_ID: ReadonlyMap<string, Tarjeta> = new Map(
  TARJETAS.map((tarjeta) => [tarjeta.id, tarjeta])
);
