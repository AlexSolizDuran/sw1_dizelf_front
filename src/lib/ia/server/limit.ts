import { IA_LIMITE_CHAT_HORA, IA_LIMITE_CHAT_MINUTO } from "../config";

/** Cubo de fichas por usuario para el proxy de IA (minuto y hora). */

const VENTANA_MINUTO_MS = 60_000;
const VENTANA_HORA_MS = 3_600_000;

interface Cubo {
  capacidad: number;
  recargaPorMs: number;
  fichas: number;
  ultimaRecarga: number;
}

interface CubosUsuario {
  minuto: Cubo | null;
  hora: Cubo | null;
}

export interface ResultadoLimite {
  permitido: boolean;
  retryAfterSegundos: number;
  restantes: number;
  motivo?: "minuto" | "hora";
}

const cubos = new Map<string, CubosUsuario>();

function capacidad(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0;
}

function crearCubo(capacidadValor: number, ventanaMs: number): Cubo | null {
  if (capacidadValor <= 0) return null;
  return {
    capacidad: capacidadValor,
    recargaPorMs: capacidadValor / ventanaMs,
    fichas: capacidadValor,
    ultimaRecarga: Date.now(),
  };
}

function recargar(cubo: Cubo, ahora: number): void {
  const transcurrido = ahora - cubo.ultimaRecarga;
  if (transcurrido <= 0) return;
  cubo.fichas = Math.min(
    cubo.capacidad,
    cubo.fichas + transcurrido * cubo.recargaPorMs
  );
  if (cubo.capacidad - cubo.fichas < 1e-9) cubo.fichas = cubo.capacidad;
  cubo.ultimaRecarga = ahora;
}

function segundosHastaFicha(cubo: Cubo): number {
  if (cubo.fichas >= 1 - 1e-9) return 0;
  return Math.max(
    1,
    Math.ceil((1 - cubo.fichas) / cubo.recargaPorMs / 1000 - 1e-6)
  );
}

export function consumirLimite(clave: string): ResultadoLimite {
  const ahora = Date.now();
  let entrada = cubos.get(clave);
  if (!entrada) {
    entrada = {
      minuto: crearCubo(capacidad(IA_LIMITE_CHAT_MINUTO), VENTANA_MINUTO_MS),
      hora: crearCubo(capacidad(IA_LIMITE_CHAT_HORA), VENTANA_HORA_MS),
    };
    cubos.set(clave, entrada);
  }

  for (const cubo of [entrada.minuto, entrada.hora]) {
    if (cubo) recargar(cubo, ahora);
  }

  const bloqueado = [entrada.minuto, entrada.hora].find(
    (cubo) => cubo !== null && cubo !== undefined && cubo.fichas < 1
  );
  if (bloqueado) {
    return {
      permitido: false,
      retryAfterSegundos: segundosHastaFicha(bloqueado),
      restantes: 0,
      motivo: bloqueado === entrada.minuto ? "minuto" : "hora",
    };
  }

  if (entrada.minuto) entrada.minuto.fichas -= 1;
  if (entrada.hora) entrada.hora.fichas -= 1;

  const restantes = Math.floor(
    Math.min(
      entrada.minuto?.fichas ?? Number.POSITIVE_INFINITY,
      entrada.hora?.fichas ?? Number.POSITIVE_INFINITY
    )
  );
  return { permitido: true, retryAfterSegundos: 0, restantes };
}

export function respuestaLimite(resultado: ResultadoLimite): Response {
  return Response.json(
    {
      error: `Alcanzaste el límite de uso del asistente (${
        resultado.motivo ?? "minuto"
      }). Esperá ${resultado.retryAfterSegundos} s y volvé a intentarlo.`,
      motivo: "limite",
      retryAfterSegundos: resultado.retryAfterSegundos,
    },
    {
      status: 429,
      headers: { "Retry-After": String(resultado.retryAfterSegundos) },
    }
  );
}
