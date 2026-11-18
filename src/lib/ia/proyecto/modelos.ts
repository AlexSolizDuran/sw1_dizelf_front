/**
 * Perfiles de modelo para generar proyectos.
 *
 * El cliente manda un **perfil**, nunca un ID de modelo. Así el navegador no
 * puede disparar un modelo caro desde la consola y cambiar de modelo es solo
 * cambiar una variable de entorno.
 *
 * Todos los defaults están hardcodeados: la app funciona sin `.env`. Las
 * variables `OPENROUTER_MODEL_PROYECTO_*` los pisan cuando existen.
 */

export const PERFILES_PROYECTO = [
  "gratuito",
  "economico",
  "equilibrado",
  "precision",
] as const;

export type PerfilProyecto = (typeof PERFILES_PROYECTO)[number];

interface DefinicionPerfil {
  nombre: string;
  descripcion: string;
  variable: string;
  modelo: string;
  /** Posición en la cadena de fallback: menor = más barato. */
  nivel: number;
}

/**
 * Fallback solo hacia perfiles más baratos. Si falla `gratuito` no se sube a
 * uno pago: se devuelve el error y se sugiere cambiar de perfil, para que no
 * haya costos sorpresa.
 */
const DEFINICIONES: Record<PerfilProyecto, DefinicionPerfil> = {
  gratuito: {
    nombre: "Gratuito",
    descripcion: "Sin costo. Ideal para probar y para uso ocasional.",
    variable: "OPENROUTER_MODEL_PROYECTO_GRATIS",
    modelo: "nvidia/nemotron-3.5-super-vl:free",
    nivel: 0,
  },
  economico: {
    nombre: "Económico",
    descripcion: "Rápido y de bajo costo para viviendas simples.",
    variable: "OPENROUTER_MODEL_PROYECTO_ECONOMICO",
    modelo: "anthropic/claude-haiku-4.5",
    nivel: 1,
  },
  equilibrado: {
    nombre: "Equilibrado",
    descripcion: "Mejor relación entre calidad y costo. Opción recomendada.",
    variable: "OPENROUTER_MODEL_PROYECTO_EQUILIBRADO",
    modelo: "anthropic/claude-sonnet-5.5",
    nivel: 2,
  },
  precision: {
    nombre: "Precisión",
    descripcion: "Planos complejos o imágenes difíciles. Es el más costoso.",
    variable: "OPENROUTER_MODEL_PROYECTO_PRECISION",
    modelo: "openai/gpt-5.5",
    nivel: 3,
  },
};

export interface PerfilInfo {
  id: PerfilProyecto;
  nombre: string;
  descripcion: string;
  modelo: string;
  soportaImagen: true;
  precioEntradaUsdMillon: number | null;
  precioSalidaUsdMillon: number | null;
}

export function esPerfilProyecto(valor: unknown): valor is PerfilProyecto {
  return (
    typeof valor === "string" &&
    (PERFILES_PROYECTO as readonly string[]).includes(valor)
  );
}

/** Modelo configurado para un perfil (env opcional, default hardcodeado). */
export function modeloDePerfil(perfil: PerfilProyecto): string {
  const definicion = DEFINICIONES[perfil];
  const configurado = process.env[definicion.variable]?.trim();
  return configurado && configurado.length > 0
    ? configurado
    : definicion.modelo;
}

export function perfilPorDefecto(): PerfilProyecto {
  const configurado = process.env.OPENROUTER_PERFIL_PROYECTO_DEFECTO?.trim();
  return esPerfilProyecto(configurado) ? configurado : "equilibrado";
}

/**
 * Cadena de fallback para un perfil: el propio perfil y los más baratos.
 *
 * `precision` prueba primero `equilibrado`, después `economico` y al final
 * `gratuito`; `gratuito` no tiene alternativa.
 */
export function cadenaDePerfiles(perfil: PerfilProyecto): PerfilProyecto[] {
  const nivel = DEFINICIONES[perfil].nivel;
  return PERFILES_PROYECTO.filter(
    (candidato) => DEFINICIONES[candidato].nivel <= nivel
  ).sort((a, b) => DEFINICIONES[b].nivel - DEFINICIONES[a].nivel);
}

export function perfilesDisponibles(
  precios: Map<string, { entrada: number; salida: number }> | null = null
): PerfilInfo[] {
  return PERFILES_PROYECTO.map((id) => {
    const definicion = DEFINICIONES[id];
    const modelo = modeloDePerfil(id);
    const precio = precios?.get(modelo);
    return {
      id,
      nombre: definicion.nombre,
      descripcion: definicion.descripcion,
      modelo,
      soportaImagen: true as const,
      precioEntradaUsdMillon: precio?.entrada ?? null,
      precioSalidaUsdMillon: precio?.salida ?? null,
    };
  });
}

/** Precios públicos de OpenRouter, con cache de 1 h. */
const TTL_PRECIOS_MS = 3_600_000;
let cachePrecios:
  | { expiraEn: number; datos: Map<string, { entrada: number; salida: number }> }
  | null = null;

export async function preciosOpenRouter(): Promise<Map<
  string,
  { entrada: number; salida: number }
> | null> {
  if (cachePrecios && cachePrecios.expiraEn > Date.now()) {
    return cachePrecios.datos;
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return cachePrecios?.datos ?? null;

    const json = (await res.json()) as {
      data?: Array<{ id?: string; pricing?: { prompt?: string; completion?: string } }>;
    };

    const datos = new Map<string, { entrada: number; salida: number }>();
    for (const item of json.data ?? []) {
      if (typeof item.id !== "string") continue;
      const entrada = Number(item.pricing?.prompt ?? 0) * 1_000_000;
      const salida = Number(item.pricing?.completion ?? 0) * 1_000_000;
      if (!Number.isFinite(entrada) || !Number.isFinite(salida)) continue;
      datos.set(item.id, { entrada, salida });
    }

    cachePrecios = { expiraEn: Date.now() + TTL_PRECIOS_MS, datos };
    return datos;
  } catch {
    return cachePrecios?.datos ?? null;
  }
}
