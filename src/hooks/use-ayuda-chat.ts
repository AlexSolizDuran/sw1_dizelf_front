"use client";

import { create } from "zustand";
import {
  apiAgregarColaborador,
  apiCrearProyecto,
  apiListarProyectos,
} from "@/lib/projects";
import { entryPorId, normalizar, searchHelp } from "@/lib/ayuda/knowledge";
import {
  borrarAyuda,
  cargarAyuda,
  guardarAyuda,
  type MensajeAyuda,
  type ProyectoAyuda,
} from "@/lib/ayuda/storage";
import {
  HELP_TOOL_NAMES,
  detectQuickIntent,
  esPregunta,
  type HelpAiResult,
  type HelpToolName,
  type QuickIntent,
} from "@/lib/ia/helpPrompt";

interface AyudaState {
  usuarioId: number | null;
  mensajes: MensajeAyuda[];
  pensando: boolean;
  error: string | null;
  online: boolean | null;
  checking: boolean;
  proyectos: ProyectoAyuda[];
  /** Ruta que el widget debe abrir; la consume el componente con `router`. */
  destino: string | null;

  setContexto: (usuarioId: number | null) => void;
  cargarProyectos: () => Promise<void>;
  verificarOnline: () => Promise<void>;
  enviar: (texto: string) => Promise<void>;
  mostrarTema: (entryId: string) => void;
  elegirProyecto: (mensajeId: string, proyectoId: string) => Promise<void>;
  limpiarDestino: () => void;
  reiniciar: () => void;
}

let secuencia = 0;
function nuevoId(): string {
  secuencia += 1;
  return `ayuda-${Date.now()}-${secuencia}`;
}

function mensajeDeError(error: unknown, status?: number): string {
  if (status === 401) {
    return "Tu sesión venció. Vuelve a iniciar sesión para usar el chat de ayuda.";
  }
  if (status === 429) {
    return "Alcanzaste el límite de uso del asistente. Espera unos segundos y vuelve a intentarlo.";
  }
  return error instanceof Error
    ? error.message
    : "El asistente de ayuda no está disponible en este momento.";
}

function resolverProyecto(
  proyectos: ProyectoAyuda[],
  opciones: { id?: unknown; nombre?: unknown }
): ProyectoAyuda | null {
  const id =
    typeof opciones.id === "string"
      ? opciones.id.trim()
      : typeof opciones.id === "number"
        ? String(opciones.id)
        : "";
  if (id !== "") {
    const porId = proyectos.find((proyecto) => proyecto.id === id);
    if (porId) return porId;
  }

  if (typeof opciones.nombre !== "string" || opciones.nombre.trim() === "") {
    return null;
  }
  const buscado = normalizar(opciones.nombre.trim());
  const exacto = proyectos.filter(
    (proyecto) => normalizar(proyecto.nombre) === buscado
  );
  if (exacto.length === 1) return exacto[0];
  const parcial = proyectos.filter((proyecto) =>
    normalizar(proyecto.nombre).includes(buscado)
  );
  return parcial.length === 1 ? parcial[0] : null;
}

function listaParaElegir(proyectos: ProyectoAyuda[]): ProyectoAyuda[] {
  return proyectos.slice(0, 12);
}

export const useAyudaChat = create<AyudaState>((set, get) => {
  const push = (mensaje: Omit<MensajeAyuda, "id">) => {
    const estado = get();
    const entrada: MensajeAyuda = { id: nuevoId(), ...mensaje };
    const mensajes = [...estado.mensajes, entrada];
    guardarAyuda(estado.usuarioId, mensajes);
    set({ mensajes });
    return entrada;
  };

  const pushError = (texto: string) => {
    push({ role: "assistant", content: texto, notice: "error" });
  };

  const pedirProyecto = (
    texto: string,
    entrada: Omit<MensajeAyuda, "id" | "role" | "content"> = {}
  ) => {
    const proyectos = listaParaElegir(get().proyectos);
    if (proyectos.length === 0) {
      push({
        role: "assistant",
        content:
          "Todavía no tienes proyectos. Puedo crear uno si me dices un nombre: «crea un proyecto llamado casa».",
        entries: ["crear-proyecto"],
      });
      return;
    }
    push({
      role: "assistant",
      content: texto,
      proyectos,
      entries: ["abrir-proyecto"],
      ...entrada,
    });
  };

  const abrir = (proyecto: ProyectoAyuda, texto?: string) => {
    push({
      role: "assistant",
      content: texto ?? `Abriendo **${proyecto.nombre}** en el editor…`,
    });
    set({ destino: `/editor/${proyecto.id}` });
  };

  const invitar = async (
    proyecto: ProyectoAyuda,
    identificador: string,
    rol: "EDITOR" | "LECTOR"
  ) => {
    if (proyecto.miRol && proyecto.miRol !== "CREADOR") {
      pushError(
        `Solo el creador de **${proyecto.nombre}** puede invitar colaboradores.`
      );
      return;
    }
    try {
      await apiAgregarColaborador(proyecto.id, { identificador, rol });
      push({
        role: "assistant",
        content: `Invitación enviada: **${identificador}** ahora es **${rol === "EDITOR" ? "editor" : "lector"}** de **${proyecto.nombre}**.`,
        entries: ["colaboradores-roles"],
      });
      void get().cargarProyectos();
    } catch (error: unknown) {
      pushError(
        `No se pudo invitar a **${identificador}**: ${mensajeDeError(error)}`
      );
    }
  };

  const crear = async (nombre: string | null, origen?: string) => {
    const nombreSeguro =
      nombre &&
      origen &&
      !normalizar(origen).includes(normalizar(nombre))
        ? null
        : nombre;
    if (!nombreSeguro) {
      push({
        role: "assistant",
        content:
          "¿Cómo quieres llamar al proyecto? Escríbelo y lo creo. Por ejemplo: «crea un proyecto llamado casa».",
        entries: ["crear-proyecto"],
      });
      return;
    }
    try {
      const proyecto = await apiCrearProyecto({ nombre: nombreSeguro });
      push({
        role: "assistant",
        content: `Proyecto **${proyecto.nombre}** creado. Abriendo el editor…`,
        entries: ["crear-proyecto"],
      });
      set({ destino: `/editor/${proyecto.id}` });
      void get().cargarProyectos();
    } catch (error: unknown) {
      pushError(`No se pudo crear el proyecto: ${mensajeDeError(error)}`);
    }
  };

  const respuestaLocal = (textoUsuario: string, motivo?: string) => {
    const encontrados = searchHelp(textoUsuario, 4);
    const principal = encontrados[0] ?? null;
    const content = principal
      ? principal.respuesta
      : "No encontré ese tema en la guía local. Prueba con «crear proyecto», «niveles», «muebles», «materiales», «colaboradores» o «atajos».";
    push({
      role: "assistant",
      content,
      ...(encontrados.length > 0 ? { entries: encontrados.map((item) => item.id) } : {}),
      ...(motivo
        ? { notice: `Asistente online no disponible (${motivo}). Respondiendo con la guía local.` }
        : {}),
    });
  };

  const ejecutar = async (
    resultado: HelpAiResult,
    textoUsuario: string,
    fallbacks?: number
  ) => {
    const { proyectos } = get();
    const avisoRespaldo =
      fallbacks && fallbacks > 0
        ? "Respondió un proveedor de respaldo."
        : undefined;

    const conAviso = (mensaje: Omit<MensajeAyuda, "id">) =>
      push({
        ...mensaje,
        ...(avisoRespaldo && mensaje.notice === undefined
          ? { notice: avisoRespaldo }
          : {}),
      });

    if (resultado.tool === "explicar") {
      const entries =
        resultado.helpIds.length > 0
          ? resultado.helpIds
          : searchHelp(textoUsuario, 3).map((item) => item.id);
      conAviso({
        role: "assistant",
        content: resultado.text,
        ...(entries.length > 0 ? { entries } : {}),
      });
      return;
    }

    if (resultado.tool === "ir_a_proyectos") {
      conAviso({ role: "assistant", content: resultado.text });
      set({ destino: "/proyectos" });
      return;
    }

    if (resultado.tool === "crear_proyecto") {
      const nombreCrudo = resultado.args.nombre ?? resultado.args.name;
      const nombre =
        typeof nombreCrudo === "string" && nombreCrudo.trim() !== ""
          ? nombreCrudo.trim().slice(0, 60)
          : null;
      await crear(nombre, textoUsuario);
      return;
    }

    if (resultado.tool === "abrir_proyecto") {
      const proyecto = resolverProyecto(proyectos, {
        id: resultado.projectId ?? resultado.args.proyectoId,
        nombre: resultado.args.nombre,
      });
      if (proyecto) {
        abrir(proyecto, resultado.text);
        return;
      }
      pedirProyecto(resultado.text || "¿Cuál de tus proyectos abro?");
      return;
    }

    if (resultado.tool === "invitar_colaborador") {
      const identificadorCrudo =
        resultado.args.identificador ??
        resultado.args.username ??
        resultado.args.correo;
      const identificador =
        typeof identificadorCrudo === "string" ? identificadorCrudo.trim() : "";
      const rol: "EDITOR" | "LECTOR" =
        resultado.args.rol === "EDITOR" ? "EDITOR" : "LECTOR";
      const proyecto = resolverProyecto(proyectos, {
        id: resultado.projectId ?? resultado.args.proyectoId,
        nombre: resultado.args.nombreProyecto,
      });

      if (identificador === "") {
        conAviso({
          role: "assistant",
          content:
            "Para invitar necesito el correo o el usuario de la persona. Por ejemplo: «invita a ana@correo.com como lectora».",
          entries: ["invitar-colaborador"],
        });
        return;
      }
      if (!normalizar(textoUsuario).includes(normalizar(identificador))) {
        conAviso({
          role: "assistant",
          content:
            "Necesito el correo o el usuario exacto de la persona para invitarla. No puedo inventarlo. Por ejemplo: «invita a ana@correo.com como lectora».",
          entries: ["invitar-colaborador"],
        });
        return;
      }
      if (proyecto) {
        await invitar(proyecto, identificador, rol);
        return;
      }
      pedirProyecto(
        resultado.text ||
          `¿En cuál de tus proyectos quieres invitar a **${identificador}**?`,
        { pendiente: { tipo: "invitar", identificador, rol } }
      );
    }
  };

  const ejecutarRapida = async (intent: QuickIntent) => {
    const { proyectos } = get();

    if (intent.intent === "ir_a_proyectos") {
      push({
        role: "assistant",
        content: "Te llevo a **Mis Proyectos**.",
        entries: ["abrir-proyecto"],
      });
      set({ destino: "/proyectos" });
      return;
    }

    if (intent.intent === "crear_proyecto") {
      await crear(intent.nombre);
      return;
    }

    if (intent.intent === "abrir_proyecto") {
      const proyecto = resolverProyecto(proyectos, { nombre: intent.nombre });
      if (proyecto) {
        abrir(proyecto);
        return;
      }
      pedirProyecto(
        intent.nombre
          ? `No encontré un proyecto llamado **${intent.nombre}**. Elige uno:`
          : "¿Cuál de tus proyectos abro?"
      );
      return;
    }

    if (intent.intent === "invitar_colaborador") {
      const proyecto = resolverProyecto(proyectos, {
        nombre: intent.nombreProyecto,
      });
      if (proyecto) {
        await invitar(proyecto, intent.identificador, intent.rol);
        return;
      }
      pedirProyecto(
        `¿En cuál de tus proyectos quieres invitar a **${intent.identificador}** como ${intent.rol === "EDITOR" ? "editor" : "lector"}?`,
        {
          pendiente: {
            tipo: "invitar",
            identificador: intent.identificador,
            rol: intent.rol,
          },
        }
      );
    }
  };

  return {
    usuarioId: null,
    mensajes: [],
    pensando: false,
    error: null,
    online: null,
    checking: false,
    proyectos: [],
    destino: null,

    setContexto: (usuarioId) => {
      const anterior = get().usuarioId;
      set({ usuarioId, ...(anterior !== usuarioId ? { mensajes: cargarAyuda(usuarioId) } : {}) });
      if (anterior === usuarioId || usuarioId === null) return;
      set({ error: null });
      void get().cargarProyectos();
      void get().verificarOnline();
    },

    cargarProyectos: async () => {
      if (get().usuarioId === null) return;
      try {
        const respuesta = await apiListarProyectos(1, 50);
        const proyectos: ProyectoAyuda[] = (respuesta.datos ?? [])
          .filter((proyecto) => typeof proyecto.id === "string")
          .map((proyecto) => ({
            id: proyecto.id,
            nombre: proyecto.nombre,
            miRol: proyecto.miRol,
          }));
        set({ proyectos });
      } catch {
        // Sin backend la ayuda sigue funcionando con la guía local.
      }
    },

    verificarOnline: async () => {
      if (get().checking) return;
      set({ checking: true });
      try {
        const respuesta = await fetch("/api/ia/health", { cache: "no-store" });
        const datos = (await respuesta.json().catch(() => null)) as
          | { ok?: unknown }
          | null;
        set({ online: respuesta.ok && datos?.ok === true, checking: false });
      } catch {
        set({ online: false, checking: false });
      }
    },

    enviar: async (texto) => {
      const contenido = texto.trim();
      const estado = get();
      if (contenido === "" || estado.pensando) return;

      push({ role: "user", content: contenido });
      set({ pensando: true, error: null });

      try {
        const rapida = detectQuickIntent(contenido);
        if (rapida) {
          await ejecutarRapida(rapida);
          return;
        }

        const actual = get();
        const historial = actual.mensajes.slice(-10).map((mensaje) => ({
          role: mensaje.role,
          content: mensaje.content,
        }));

        let respuesta: Response;
        try {
          respuesta = await fetch("/api/ia/help", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: historial,
              projects: actual.proyectos.map((proyecto) => ({
                proyectoId: proyecto.id,
                nombre: proyecto.nombre,
                miRol: proyecto.miRol,
              })),
              pagina:
                typeof window !== "undefined" ? window.location.pathname : "/proyectos",
            }),
          });
        } catch {
          respuestaLocal(contenido, "sin conexión");
          return;
        }

        const datos = (await respuesta.json().catch(() => ({}))) as
          | (Partial<HelpAiResult> & { error?: string; fallbacks?: unknown[] })
          | Record<string, never>;

        if (!respuesta.ok) {
          respuestaLocal(
            contenido,
            mensajeDeError(
              new Error(
                typeof (datos as { error?: string }).error === "string"
                  ? (datos as { error: string }).error
                  : undefined
              ),
              respuesta.status
            )
          );
          return;
        }

        const crudo = datos as Partial<HelpAiResult> & { fallbacks?: unknown[] };
        const herramienta = (HELP_TOOL_NAMES as readonly string[]).includes(
          String(crudo.tool)
        )
          ? (crudo.tool as HelpToolName)
          : "explicar";

        const resultado: HelpAiResult = {
          tool: herramienta,
          args:
            typeof crudo.args === "object" && crudo.args !== null
              ? crudo.args
              : {},
          text:
            typeof crudo.text === "string" && crudo.text.trim() !== ""
              ? crudo.text
              : "Te ayudo con eso.",
          projectId:
            typeof crudo.projectId === "string"
              ? crudo.projectId
              : typeof crudo.projectId === "number"
                ? String(crudo.projectId)
                : null,
          helpIds: Array.isArray(crudo.helpIds)
            ? crudo.helpIds.filter(
                (id): id is string => typeof id === "string" && entryPorId(id) !== null
              )
            : [],
        };

        if (esPregunta(contenido) && resultado.tool !== "explicar") {
          respuestaLocal(contenido);
          return;
        }

        await ejecutar(resultado, contenido, crudo.fallbacks?.length ?? 0);
      } catch (error: unknown) {
        respuestaLocal(contenido, mensajeDeError(error));
      } finally {
        set({ pensando: false });
      }
    },

    mostrarTema: (entryId) => {
      const entrada = entryPorId(entryId);
      if (!entrada) return;
      push({
        role: "assistant",
        content: entrada.respuesta,
        entries: [entrada.id],
      });
    },

    elegirProyecto: async (mensajeId, proyectoId) => {
      const estado = get();
      if (estado.pensando) return;
      const mensaje = estado.mensajes.find((item) => item.id === mensajeId);
      const proyecto = estado.proyectos.find((item) => item.id === proyectoId);
      if (!proyecto) return;

      if (mensaje?.pendiente?.tipo === "invitar") {
        await invitar(
          proyecto,
          mensaje.pendiente.identificador,
          mensaje.pendiente.rol
        );
        const mensajes = get().mensajes.map((item) =>
          item.id === mensajeId ? { ...item, pendiente: undefined } : item
        );
        guardarAyuda(get().usuarioId, mensajes);
        set({ mensajes });
        return;
      }

      abrir(proyecto);
    },

    limpiarDestino: () => set({ destino: null }),

    reiniciar: () => {
      borrarAyuda(get().usuarioId);
      set({ mensajes: [], error: null, pensando: false });
    },
  };
});
