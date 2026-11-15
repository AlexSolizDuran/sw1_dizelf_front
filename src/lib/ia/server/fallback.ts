import {
  HF_TOKEN,
  IA_CADENA_FALLBACK,
  IA_CHAT_TIMEOUT_MS,
  IA_FALLBACK_TIMEOUT_MS,
  OPENROUTER_API_KEYS,
  modeloPorDefecto,
} from "../config";
import { getAdapter } from "../adapters";
import type {
  FallbackIA,
  IAChatRequestBody,
  IAChatResponse,
  IAProvider,
} from "../types";
import { ErrorProveedor } from "./errors";

export interface Tramo {
  provider: IAProvider;
  model: string;
}

/** Un reintento por tramo, igual que el proyecto de referencia. */
const MAX_INTENTOS = 2;
const ESPERA_REINTENTO_MS = 400;
const MAX_RETRY_AFTER_MS = 5000;

/**
 * Enfriamiento por proveedor tras un 429.
 *
 * Sin esto, cada ronda del loop vuelve a intentar dos veces contra el mismo
 * proveedor: seis rondas terminan en doce 429 idénticos antes de que responda
 * el respaldo. Con el cooldown se salta directo al siguiente tramo.
 */
const COOLDOWN_429_MS = 60_000;
const enfriamiento = new Map<IAProvider, number>();

function enCooldown(provider: IAProvider): boolean {
  const hasta = enfriamiento.get(provider);
  if (hasta === undefined) return false;
  if (Date.now() >= hasta) {
    enfriamiento.delete(provider);
    return false;
  }
  return true;
}

function tieneCredenciales(provider: IAProvider): boolean {
  if (provider === "openrouter") return OPENROUTER_API_KEYS.length > 0;
  if (provider === "huggingface") return HF_TOKEN.length > 0;
  return true;
}

/**
 * Ajusta el modelo al proveedor. Un ID de otro proveedor (por ejemplo un tag
 * de HF Space enviado a OpenRouter) haría que el proveedor responda 400.
 */
export function resolverModelo(provider: IAProvider, solicitado: string): string {
  const modelo = solicitado.trim();
  if (provider === "openrouter") {
    if (modelo === "" || !modelo.includes("/")) return modeloPorDefecto(provider);
    return modelo;
  }
  if (provider === "huggingface") {
    if (modelo === "" || (!modelo.includes("/") && !/^https?:\/\//i.test(modelo))) {
      return modeloPorDefecto(provider);
    }
    return modelo;
  }
  // HF Space: solo conoce sus propios IDs.
  if (modelo === "" || modelo === modeloPorDefecto("openrouter")) {
    return modeloPorDefecto(provider);
  }
  return modelo;
}

/** El proveedor elegido va primero; después la cadena de respaldo. */
export function construirCadena(
  provider: IAProvider,
  model: string,
  evitar?: IAProvider
): Tramo[] {
  const cadena: Tramo[] = [
    { provider, model: resolverModelo(provider, model) },
  ];
  for (const respaldo of IA_CADENA_FALLBACK) {
    if (respaldo === provider) continue;
    if (!tieneCredenciales(respaldo)) continue;
    cadena.push({
      provider: respaldo,
      model: modeloPorDefecto(respaldo),
    });
  }

  // Si el pedido pide evitar un proveedor, se quita de la cadena siempre que
  // quede al menos uno: un turno no puede quedarse sin proveedor.
  if (evitar) {
    const filtrada = cadena.filter((tramo) => tramo.provider !== evitar);
    if (filtrada.length > 0) return filtrada;
  }
  return cadena;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esReintentable(motivo: ErrorProveedor["motivo"]): boolean {
  return (
    motivo === "429" ||
    motivo === "5xx" ||
    motivo === "timeout" ||
    motivo === "red"
  );
}

function resumen(fallbacks: FallbackIA[]): string {
  return fallbacks.map((f) => `${f.proveedor}: ${f.motivo}`).join(", ");
}

export interface ResultadoCadena {
  respuesta: IAChatResponse;
  proveedorUsado: IAProvider;
  modeloUsado: string;
  fallbacks: FallbackIA[];
}

/**
 * Recorre la cadena con timeout total. El navegador hace una sola petición al
 * proxy; es el servidor quien cambia de proveedor.
 */
export async function chatConCadena(
  req: IAChatRequestBody
): Promise<ResultadoCadena> {
  const cadena = construirCadena(req.provider, req.model, req.evitarProveedor);
  const inicio = Date.now();
  const limite = inicio + Math.max(1, IA_FALLBACK_TIMEOUT_MS);
  const fallbacks: FallbackIA[] = [];
  let ultimoError: ErrorProveedor | null = null;

  for (let indice = 0; indice < cadena.length; indice++) {
    const tramo = cadena[indice];
    const hayRespaldo = indice < cadena.length - 1;
    // Si el proveedor acaba de dar 429, se salta directo al respaldo.
    if (hayRespaldo && enCooldown(tramo.provider)) continue;

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      if (Date.now() >= limite) {
        throw new ErrorProveedor(
          "timeout",
          `Se agotó el tiempo del turno. Intentos: ${resumen(fallbacks) || "ninguno"}.`
        );
      }

      try {
        const respuesta = await getAdapter(tramo.provider).chat({
          ...req,
          provider: tramo.provider,
          model: tramo.model,
        });
        return {
          respuesta,
          proveedorUsado: tramo.provider,
          modeloUsado: respuesta.model?.trim() || tramo.model,
          fallbacks,
        };
      } catch (error: unknown) {
        const proveedorError =
          error instanceof ErrorProveedor
            ? error
            : new ErrorProveedor("red", String(error));

        // Credenciales, petición inválida o respuesta inválida: no se reintenta.
        if (
          proveedorError.motivo === "4xx" ||
          proveedorError.motivo === "respuesta-invalida"
        ) {
          throw proveedorError;
        }

        ultimoError = proveedorError;
        fallbacks.push({
          proveedor: tramo.provider,
          modelo: tramo.model,
          motivo: proveedorError.motivo,
        });

        // Un 429 no se reintenta si hay respaldo: se enfría el proveedor y se
        // pasa al siguiente tramo.
        if (proveedorError.motivo === "429") {
          enfriamiento.set(tramo.provider, Date.now() + COOLDOWN_429_MS);
          if (hayRespaldo) break;
        }

        if (!esReintentable(proveedorError.motivo)) break;
        if (intento >= MAX_INTENTOS) break;

        if (
          proveedorError.motivo === "429" &&
          proveedorError.retryAfterMs !== undefined
        ) {
          if (proveedorError.retryAfterMs > MAX_RETRY_AFTER_MS) break;
          if (Date.now() + proveedorError.retryAfterMs >= limite) {
            throw new ErrorProveedor(
              "timeout",
              `Se agotó el tiempo del turno. Intentos: ${resumen(fallbacks)}.`
            );
          }
          await esperar(proveedorError.retryAfterMs);
          continue;
        }

        if (Date.now() + ESPERA_REINTENTO_MS >= limite) {
          throw new ErrorProveedor(
            "timeout",
            `Se agotó el tiempo del turno. Intentos: ${resumen(fallbacks)}.`
          );
        }
        await esperar(ESPERA_REINTENTO_MS);
      }
    }
  }

  throw (
    ultimoError ??
    new ErrorProveedor(
      "red",
      `Ningún proveedor respondió. Intentos: ${resumen(fallbacks) || "ninguno"}.`
    )
  );
}

export { IA_CHAT_TIMEOUT_MS };
