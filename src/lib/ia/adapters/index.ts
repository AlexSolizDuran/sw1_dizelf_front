import type {
  HealthResult,
  IAChatRequestBody,
  IAChatResponse,
  IAProvider,
} from "../types";
import * as hfSpace from "./hfSpace";
import * as huggingface from "./huggingface";
import * as openrouter from "./openrouter";

export interface IAAdapter {
  health: () => Promise<HealthResult>;
  listModels: () => Promise<string[]>;
  chat: (req: IAChatRequestBody) => Promise<IAChatResponse>;
}

export function getAdapter(provider: IAProvider): IAAdapter {
  switch (provider) {
    case "hf-space":
      return hfSpace;
    case "huggingface":
      return huggingface;
    case "openrouter":
      return openrouter;
  }
}
