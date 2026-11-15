"use client";

import { create } from "zustand";
import { useScene } from "@pascal-app/core";
import { useViewer } from "@pascal-app/viewer";
import { aplicarPropuestas, runAgentLoop } from "@/lib/ia/agentLoop";
import {
  IA_DEFAULT_PROVIDER,
  IA_MAX_HISTORY_TURNS,
  IA_PROVIDER_LABEL,
  modeloPorDefecto,
} from "@/lib/ia/config";
import { resumirEscena } from "@/lib/ia/context";
import {
  formatearConformidad,
  leerConformidadCache,
  probarConformidad as ejecutarSonda,
  type ResultadoConformidad,
} from "@/lib/ia/conformidad";
import { construirSystemPrompt } from "@/lib/ia/prompt";
import { mensajeDeErrorIA, solicitarChat } from "@/lib/ia/proxy";
import {
  borrarChat,
  cargarChat,
  cargarPrefs,
  guardarChat,
  guardarPrefs,
  type EntradaChat,
  type PrefsIA,
} from "@/lib/ia/storage";
import type {
  FallbackIA,
  IAChatMessage,
  IAProvider,
  ModoIA,
  PendingProposal,
  TurnEvent,
  TurnTrace,
} from "@/lib/ia/types";

export interface ContextoAsistente {
  usuarioId: number | null;
  proyectoId: string | null;
  puedeEditar: boolean;
}

interface Salud {
  ok: boolean;
  error?: string;
}

interface IAState {
  usuarioId: number | null;
  proyectoId: string | null;
  puedeEditar: boolean;

  proveedor: IAProvider;
  modelo: string;
  modo: ModoIA;
  modelos: string[];
  salud: Salud | null;
  checking: boolean;

  mensajes: EntradaChat[];
  pensando: boolean;
  error: string | null;
  avisoFallback: string | null;
  propuestas: PendingProposal[];
  resolviendo: boolean;
  trace: TurnTrace[];
  /** Actividad detallada del turno en curso o del último turno. */
  actividad: TurnEvent[];

  conformidad: ResultadoConformidad | null;
  probandoConformidad: boolean;

  setContexto: (contexto: ContextoAsistente) => void;
  setProveedor: (proveedor: IAProvider) => void;
  setModelo: (modelo: string) => void;
  setModo: (modo: ModoIA) => void;

  cargarModelos: (proveedor?: IAProvider) => Promise<void>;
  verificarSalud: (proveedor?: IAProvider) => Promise<void>;
  probarConformidad: (forzar?: boolean) => Promise<void>;

  enviar: (texto: string) => Promise<void>;
  aprobarPropuestas: () => Promise<void>;
  rechazarPropuestas: () => void;
  detener: () => void;
  reiniciar: () => void;
}

let secuencia = 0;
function nuevoId(): string {
  secuencia += 1;
  return `msg-${Date.now()}-${secuencia}`;
}

let abortador: AbortController | null = null;

function prefsDe(estado: IAState): PrefsIA {
  return {
    proveedor: estado.proveedor,
    modelo: estado.modelo,
    modo: estado.modo,
  };
}

function esProveedor(valor: unknown): valor is IAProvider {
  return valor === "hf-space" || valor === "openrouter" || valor === "huggingface";
}

function historialDe(entradas: EntradaChat[]): IAChatMessage[] {
  const limite = Math.max(1, IA_MAX_HISTORY_TURNS) * 2;
  return entradas.slice(-limite).map((entrada) => ({
    role: entrada.role,
    content: entrada.content,
  }));
}

function avisoDeFallbacks(fallbacks: FallbackIA[]): string {
  if (fallbacks.length === 0) return "";
  const detalle = fallbacks
    .map((fallback) => {
      const veces =
        fallback.veces && fallback.veces > 1 ? ` ×${fallback.veces}` : "";
      return `${IA_PROVIDER_LABEL[fallback.proveedor]} (${fallback.motivo}${veces})`;
    })
    .join(", ");
  return `Respondió un proveedor de respaldo. Intentos fallidos: ${detalle}.`;
}

function contextoHerramientas(estado: IAState) {
  const nivelId = useViewer.getState().selection.levelId ?? null;
  return {
    ctx: {
      proyectoId: estado.proyectoId ?? "",
      puedeEditar: estado.puedeEditar,
      levelId: nivelId,
    },
    nivelActivo: nivelId,
  };
}

export const useIAChat = create<IAState>((set, get) => ({
  usuarioId: null,
  proyectoId: null,
  puedeEditar: false,

  proveedor: IA_DEFAULT_PROVIDER,
  modelo: modeloPorDefecto(IA_DEFAULT_PROVIDER),
  modo: "plan",
  modelos: [],
  salud: null,
  checking: false,

  mensajes: [],
  pensando: false,
  error: null,
  avisoFallback: null,
  propuestas: [],
  resolviendo: false,
  trace: [],
  actividad: [],

  conformidad: null,
  probandoConformidad: false,

  setContexto: ({ usuarioId, proyectoId, puedeEditar }) => {
    const anterior = get().usuarioId;
    if (anterior !== usuarioId) {
      const prefs = cargarPrefs(usuarioId);
      set({
        usuarioId,
        proyectoId,
        puedeEditar,
        mensajes: cargarChat(usuarioId),
        propuestas: [],
        error: null,
        avisoFallback: null,
        trace: [],
        actividad: [],
        ...(prefs
          ? { proveedor: prefs.proveedor, modelo: prefs.modelo, modo: prefs.modo }
          : {
              proveedor: IA_DEFAULT_PROVIDER,
              modelo: modeloPorDefecto(IA_DEFAULT_PROVIDER),
              modo: "plan" as ModoIA,
            }),
      });
      const { proveedor, modelo } = get();
      set({ conformidad: leerConformidadCache(proveedor, modelo) });
      return;
    }
    set({ proyectoId, puedeEditar });
  },

  setProveedor: (proveedor) => {
    const estado = get();
    if (!esProveedor(proveedor) || proveedor === estado.proveedor) return;
    const modelo = modeloPorDefecto(proveedor);
    set({
      proveedor,
      modelo,
      modelos: [],
      salud: null,
      conformidad: leerConformidadCache(proveedor, modelo),
    });
    if (estado.usuarioId !== null) {
      guardarPrefs(estado.usuarioId, {
        proveedor,
        modelo,
        modo: estado.modo,
      });
    }
    void get().verificarSalud(proveedor);
    void get().cargarModelos(proveedor);
  },

  setModelo: (modelo) => {
    const estado = get();
    set({
      modelo,
      conformidad: leerConformidadCache(estado.proveedor, modelo),
    });
    if (estado.usuarioId !== null) {
      guardarPrefs(estado.usuarioId, {
        proveedor: estado.proveedor,
        modelo,
        modo: estado.modo,
      });
    }
  },

  setModo: (modo) => {
    const estado = get();
    if (!estado.puedeEditar) return;
    set({ modo, propuestas: [] });
    if (estado.usuarioId !== null) {
      guardarPrefs(estado.usuarioId, {
        proveedor: estado.proveedor,
        modelo: estado.modelo,
        modo,
      });
    }
  },

  cargarModelos: async (proveedor) => {
    const objetivo = proveedor ?? get().proveedor;
    try {
      const res = await fetch(
        `/api/ia/models?provider=${encodeURIComponent(objetivo)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { models?: unknown };
      if (!Array.isArray(data.models)) return;
      const modelos = data.models.filter(
        (item): item is string => typeof item === "string" && item.trim() !== ""
      );
      if (modelos.length === 0 || get().proveedor !== objetivo) return;
      set((estado) => ({
        modelos,
        modelo:
          estado.modelo.trim() !== "" && modelos.includes(estado.modelo)
            ? estado.modelo
            : modelos[0],
      }));
    } catch {
      // sin red se mantiene el modelo escrito a mano
    }
  },

  verificarSalud: async (proveedor) => {
    const objetivo = proveedor ?? get().proveedor;
    set({ checking: true });
    try {
      const res = await fetch(
        `/api/ia/health?provider=${encodeURIComponent(objetivo)}`,
        { cache: "no-store" }
      );
      const data = (await res.json().catch(() => null)) as
        | { ok?: unknown; error?: unknown }
        | null;
      if (get().proveedor !== objetivo) return;
      set({
        salud: {
          ok: res.ok && data?.ok === true,
          ...(typeof data?.error === "string" ? { error: data.error } : {}),
        },
        checking: false,
      });
    } catch {
      if (get().proveedor !== objetivo) return;
      set({
        salud: { ok: false, error: "No se pudo consultar el estado del proveedor." },
        checking: false,
      });
    }
  },

  probarConformidad: async (forzar = false) => {
    const { proveedor, modelo } = get();
    if (modelo.trim() === "") return;
    set({ probandoConformidad: true });
    try {
      const resultado = await ejecutarSonda({ proveedor, modelo, forzar });
      set({ conformidad: resultado, probandoConformidad: false });
    } catch {
      set({ probandoConformidad: false });
    }
  },

  enviar: async (texto) => {
    const estado = get();
    const contenido = texto.trim();
    if (contenido === "" || estado.pensando) return;
    if (!estado.proyectoId) {
      set({ error: "Abrí un proyecto antes de usar el asistente." });
      return;
    }

    const entradaUsuario: EntradaChat = {
      id: nuevoId(),
      role: "user",
      content: contenido,
    };
    const previas = estado.mensajes;
    const mensajes = [...previas, entradaUsuario];
    const usuarioId = estado.usuarioId;
    guardarChat(usuarioId, mensajes);
    set({
      mensajes,
      pensando: true,
      error: null,
      avisoFallback: null,
      propuestas: [],
      trace: [],
      actividad: [],
    });

    const { ctx, nivelActivo } = contextoHerramientas(estado);
    const snapshot = resumirEscena(
      useScene.getState().nodes as never,
      nivelActivo
    );
    const systemPrompt = construirSystemPrompt({
      modo: estado.modo,
      puedeEditar: estado.puedeEditar,
      nivelActivo,
      snapshot,
    });

    const controlador = new AbortController();
    abortador = controlador;
    try {
      const resultado = await runAgentLoop({
        provider: estado.proveedor,
        model: estado.modelo,
        systemPrompt,
        userMessage: contenido,
        history: historialDe(previas),
        modo: estado.modo,
        puedeEditar: estado.puedeEditar,
        ctx,
        signal: controlador.signal,
        onTurn: (turn) => set((actual) => ({ trace: [...actual.trace, turn] })),
        onEvent: (event) =>
          set((actual) => ({ actividad: [...actual.actividad, event] })),
      });

      const aviso = avisoDeFallbacks(resultado.fallbacks ?? []);
      const propuestas = resultado.pendingProposals ?? [];
      // Modo Plan (o proyecto sin permiso): el turno no puede escribir nada, y
      // el modelo igual contesta "listo, lo hice". Lo desmiente la app.
      const soloLectura =
        estado.modo === "plan" || !estado.puedeEditar
          ? "Sólo lectura: no se aplicó ningún cambio en el plano."
          : "";
      const avisos = [aviso, soloLectura].filter(Boolean).join(" ");
      const actividad: TurnEvent[] = [
        ...get().actividad,
        {
          id: `ev-cierre-${Date.now()}`,
          kind: "cierre",
          round: -1,
          at: Date.now(),
          title: "Fin del turno",
          texto: [
            `${resultado.trace.length} ${resultado.trace.length === 1 ? "paso de herramienta" : "pasos de herramienta"}`,
            propuestas.length > 0
              ? `${propuestas.length} ${propuestas.length === 1 ? "propuesta pendiente" : "propuestas pendientes"}`
              : "sin propuestas pendientes",
            ...(resultado.respuestaTruncada ? ["respuesta cortada"] : []),
          ].join(" · "),
        },
      ];
      const entradaAsistente: EntradaChat = {
        id: nuevoId(),
        role: "assistant",
        content: resultado.finalContent,
        trace: resultado.trace,
        actividad,
        ...(avisos ? { notice: avisos } : {}),
        ...(resultado.contexto ? { contexto: resultado.contexto } : {}),
        ...(resultado.respuestaTruncada ? { truncada: true } : {}),
      };
      const siguientes = [...get().mensajes, entradaAsistente];
      guardarChat(usuarioId, siguientes);
      set({
        mensajes: siguientes,
        pensando: false,
        propuestas,
        avisoFallback: aviso || null,
        actividad,
      });
    } catch (error: unknown) {
      if (controlador.signal.aborted) {
        set({ pensando: false });
        return;
      }
      const mensaje = mensajeDeErrorIA(error);
      const entradaError: EntradaChat = {
        id: nuevoId(),
        role: "assistant",
        content: mensaje,
        trace: [],
        actividad: get().actividad,
        notice: "error",
      };
      const siguientes = [...get().mensajes, entradaError];
      guardarChat(usuarioId, siguientes);
      set({ mensajes: siguientes, pensando: false, error: mensaje });
    } finally {
      if (abortador === controlador) abortador = null;
    }
  },

  aprobarPropuestas: async () => {
    const estado = get();
    if (estado.propuestas.length === 0 || estado.resolviendo || !estado.proyectoId) {
      return;
    }
    set({ resolviendo: true, error: null });
    const { ctx } = contextoHerramientas(estado);
    const { trace, applied, errors } = await aplicarPropuestas(estado.propuestas, ctx);
    const resumen =
      errors.length === 0
        ? `Apliqué ${applied} ${applied === 1 ? "cambio" : "cambios"} en el plano.`
        : `Apliqué ${applied} ${applied === 1 ? "cambio" : "cambios"}; fallaron ${errors.length}: ${errors.join(" | ")}`;
    const entrada: EntradaChat = {
      id: nuevoId(),
      role: "assistant",
      content: resumen,
      trace,
      ...(errors.length > 0 ? { notice: "error" } : {}),
    };
    const siguientes = [...estado.mensajes, entrada];
    guardarChat(estado.usuarioId, siguientes);
    set({
      mensajes: siguientes,
      propuestas: [],
      resolviendo: false,
    });
  },

  rechazarPropuestas: () => {
    const estado = get();
    if (estado.propuestas.length === 0) return;
    const entrada: EntradaChat = {
      id: nuevoId(),
      role: "assistant",
      content: "Descarté las propuestas. No se modificó el plano.",
    };
    const siguientes = [...estado.mensajes, entrada];
    guardarChat(estado.usuarioId, siguientes);
    set({ mensajes: siguientes, propuestas: [] });
  },

  detener: () => {
    abortador?.abort();
    abortador = null;
    set({ pensando: false });
  },

  reiniciar: () => {
    const estado = get();
    abortador?.abort();
    abortador = null;
    borrarChat(estado.usuarioId);
    set({
      mensajes: [],
      propuestas: [],
      pensando: false,
      error: null,
      avisoFallback: null,
      trace: [],
      actividad: [],
    });
  },
}));
