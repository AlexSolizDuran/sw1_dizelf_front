/**
 * Tipos compartidos del módulo de conocimiento.
 *
 * Se mantienen separados de `esquema.ts` para que el cliente pueda importar
 * tipos sin arrastrar la validación de Zod ni el JSON de tarjetas.
 */

export interface RespuestaEmbeddings {
  embeddings: number[][];
  modelo: string;
  revision: string;
  dimensions: number;
}

export interface ArchivoVectores {
  modelo: string;
  revision: string;
  dimensions: number;
  hash: string;
  /** id de tarjeta → vector normalizado. */
  vectores: Record<string, number[]>;
}
