import type { IAProvider } from "./types";

export interface ProviderProfile {
  id: IAProvider;
  /** Ventana total declarada por el proveedor. */
  contextWindow: number;
  /** Tokens reservados para la respuesta. */
  maxOutput: number;
}

const PERFILES: Record<IAProvider, ProviderProfile> = {
  // 2048, no 4096: el Space genera dentro de un segmento de GPU de 120 s y
  // 4096 tokens lo excede. Es el doble del valor anterior, que se quedaba justo
  // cuando el modelo emitía muchas tools en una respuesta.
  "hf-space": { id: "hf-space", contextWindow: 16_384, maxOutput: 2048 },
  openrouter: { id: "openrouter", contextWindow: 262_144, maxOutput: 4096 },
  huggingface: { id: "huggingface", contextWindow: 32_768, maxOutput: 4096 },
};

export function perfilDeProveedor(provider: IAProvider): ProviderProfile {
  return PERFILES[provider];
}
