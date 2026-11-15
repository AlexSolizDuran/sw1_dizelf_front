import type { IAProvider } from "./types";

/**
 * Configuración del asistente.
 *
 * Las claves de proveedor viven solo en el servidor (rutas `/api/ia/*`). El
 * navegador únicamente conoce los defaults `NEXT_PUBLIC_*`, que no son secretos.
 */

export const IA_PROVIDERS: readonly IAProvider[] = [
  "hf-space",
  "openrouter",
  "huggingface",
];

export const IA_PROVIDER_LABEL: Record<IAProvider, string> = {
  "hf-space": "HF Space propio",
  openrouter: "OpenRouter",
  huggingface: "Hugging Face",
};

function leerProveedor(valor: string | undefined): IAProvider | null {
  if (valor === "hf-space" || valor === "openrouter" || valor === "huggingface") {
    return valor;
  }
  return null;
}

export const IA_DEFAULT_PROVIDER: IAProvider =
  leerProveedor(process.env.NEXT_PUBLIC_IA_DEFAULT_PROVIDER?.trim()) ??
  leerProveedor(process.env.IA_DEFAULT_PROVIDER?.trim()) ??
  "hf-space";

/* ── HF Space propio ─────────────────────────────────────────────────────── */

export const HF_SPACE_URL = (
  process.env.NEXT_PUBLIC_HF_SPACE_URL?.trim() ||
  process.env.HF_SPACE_URL?.trim() ||
  "https://alexsolizduran-img-to-text.hf.space"
).replace(/\/+$/, "");

export const HF_SPACE_MODEL =
  process.env.NEXT_PUBLIC_HF_SPACE_MODEL?.trim() ||
  process.env.HF_SPACE_MODEL?.trim() ||
  "Qwen/Qwen2.5-Coder-7B-Instruct";

export const HF_SPACE_MODELOS: readonly string[] = [HF_SPACE_MODEL];

/* ── Hugging Face Inference Providers ────────────────────────────────────── */

export const HF_BASE_URL = (
  process.env.HF_BASE_URL?.trim() || "https://router.huggingface.co"
).replace(/\/+$/, "");
export const HF_TOKEN = process.env.HF_TOKEN?.trim() ?? "";
export const HF_DEFAULT_MODEL =
  process.env.HF_DEFAULT_MODEL?.trim() || "Qwen/Qwen2.5-Coder-7B-Instruct";
export const HF_MODELS_URL = `${HF_BASE_URL}/v1/models`;

/* ── OpenRouter ─────────────────────────────────────────────────────────── */

export const OPENROUTER_BASE_URL = (
  process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai"
).replace(/\/+$/, "");
export const OPENROUTER_API_KEYS: readonly string[] = Array.from(
  new Set(
    [
      process.env.OPENROUTER_API_KEY,
      ...(process.env.OPENROUTER_API_KEYS ?? "").split(","),
    ]
      .map((key) => (typeof key === "string" ? key.trim() : ""))
      .filter((key) => key.length > 0)
  )
).slice(0, 3);
export const OPENROUTER_DEFAULT_MODEL =
  process.env.NEXT_PUBLIC_OPENROUTER_MODEL?.trim() ||
  process.env.OPENROUTER_MODEL?.trim() ||
  "google/gemma-4-31b-it:free";

/* ── Loop y contexto ────────────────────────────────────────────────────── */

const rondasConfiguradas = Number(
  // El loop corre en el navegador: solo las variables NEXT_PUBLIC_* llegan al
  // cliente, así que la pública manda y la del servidor queda como respaldo.
  process.env.NEXT_PUBLIC_IA_MAX_TOOL_ROUNDS ?? process.env.IA_MAX_TOOL_ROUNDS
);
export const IA_MAX_TOOL_ROUNDS =
  Number.isFinite(rondasConfiguradas) && rondasConfiguradas > 0
    ? rondasConfiguradas
    : 10;

// Un nudge consume una ronda: se usa solo cuando el modelo escribió una tool
// call como texto y quedó sin ejecutar. Si el último error fue de argumentos
// se concede uno más (ver `agentLoop`): ahí el modelo sí intentó.
const nudgesConfigurados = Number(
  process.env.NEXT_PUBLIC_IA_MAX_NUDGES ?? process.env.IA_MAX_NUDGES
);
export const IA_MAX_NUDGES =
  Number.isFinite(nudgesConfigurados) && nudgesConfigurados >= 0
    ? nudgesConfigurados
    : 2;

// Techo de tiempo por turno. Con diez rondas y un Space en CPU, sin esto una
// sesión podría quedar esperando varios minutos.
const deadlineConfigurado = Number(
  process.env.NEXT_PUBLIC_IA_TURN_DEADLINE_MS ??
    process.env.IA_TURN_DEADLINE_MS
);
export const IA_TURN_DEADLINE_MS =
  Number.isFinite(deadlineConfigurado) && deadlineConfigurado > 0
    ? deadlineConfigurado
    : 600_000;

export const IA_MAX_HISTORY_TURNS = Number(process.env.IA_MAX_HISTORY_TURNS ?? "6");
export const IA_CHAT_TIMEOUT_MS = Number(process.env.IA_CHAT_TIMEOUT_MS ?? "300000");
export const IA_FALLBACK_TIMEOUT_MS = Number(
  process.env.IA_FALLBACK_TIMEOUT_MS ?? String(IA_CHAT_TIMEOUT_MS * 2)
);
export const IA_CADENA_FALLBACK = (
  process.env.IA_CADENA_FALLBACK?.trim() || "openrouter,hf-space"
)
  .split(",")
  .map((parte) => leerProveedor(parte.trim()))
  .filter((provider): provider is IAProvider => provider !== null);

/* ── Límites del proxy ──────────────────────────────────────────────────── */

export const IA_LIMITE_CHAT_MINUTO = Number(process.env.IA_LIMITE_CHAT_MINUTO ?? "20");
export const IA_LIMITE_CHAT_HORA = Number(process.env.IA_LIMITE_CHAT_HORA ?? "200");

/* ── Dictado ────────────────────────────────────────────────────────────── */

export const HF_STT_SPACE_URL = (
  process.env.NEXT_PUBLIC_HF_STT_SPACE_URL?.trim() ||
  process.env.HF_STT_SPACE_URL?.trim() ||
  "https://alexsolizduran-ia-voztotext.hf.space"
).replace(/\/+$/, "");
export const IA_STT_TIMEOUT_MS = Number(process.env.IA_STT_TIMEOUT_MS ?? "180000");
export const IA_STT_MAX_BYTES = Number(
  process.env.IA_STT_MAX_BYTES ?? String(20 * 1024 * 1024)
);
export const IA_STT_MAX_DURACION_MS = Number(
  process.env.NEXT_PUBLIC_IA_STT_MAX_DURACION_MS ??
    process.env.IA_STT_MAX_DURACION_MS ??
    "60000"
);

/* ── Persistencia local ─────────────────────────────────────────────────── */

export const MAX_ENTRADAS_PRIVADAS = 100;
export const MAX_CARACTERES_PRIVADO = 180_000;

/** Modelo por defecto de cada proveedor. */
export function modeloPorDefecto(provider: IAProvider): string {
  if (provider === "openrouter") return OPENROUTER_DEFAULT_MODEL;
  if (provider === "huggingface") return HF_DEFAULT_MODEL;
  return HF_SPACE_MODEL;
}

export function esProveedorIA(valor: unknown): valor is IAProvider {
  return valor === "hf-space" || valor === "openrouter" || valor === "huggingface";
}
