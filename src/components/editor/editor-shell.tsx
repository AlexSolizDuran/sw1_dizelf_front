"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Editor, type SceneGraph, useEditor } from "@pascal-app/editor";
import { useScene } from "@pascal-app/core";
import { useProjectStore } from "@/stores/use-project-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { createDefaultScene } from "@/lib/editor/default-scene";
import { AssistantPanel } from "@/components/ia/asistente-panel";
import { HelpAssistant } from "@/components/ayuda/help-assistant";
import type { DocumentoProyecto } from "@/types/proyecto";
import { BuildTab } from "./build-tab";
import { EditorNavbar, type TonoGuardado } from "./editor-navbar";
import { EstructuraTab } from "./estructura-tab";
import { LevelBootstrap } from "./level-bootstrap";
import { MaterialesTab } from "./materiales-tab";
import { MueblesTab } from "./muebles-tab";
import { BottomBar } from "./menus/bottom-bar";
import { LevelSelector } from "./menus/level-selector";
import { PropertiesPanel } from "./properties-panel";
import { PanelPresupuesto } from "./presupuesto/panel-presupuesto";
import { bootstrapRegistry } from "./icons/registry-patch";
import { useDeleteOnClick } from "@/hooks/use-delete-on-click";
import { useSincronizacion } from "@/hooks/use-sincronizacion";
import { Braces, Hammer, Paintbrush, Sofa } from "./icons/glyphs";
import s from "./editor.module.css";

const TEMA_KEY = "dizelf-editor-tema";

interface Props {
  proyectoId: string;
  nombreProyecto: string;
}

export function EditorShell({ proyectoId, nombreProyecto }: Props) {
  const guardarVersion = useProjectStore((st) => st.guardarVersion);
  const proyecto = useProjectStore((st) => st.proyecto);
  const usuarioId = useAuthStore((st) => st.user?.id ?? null);

  useDeleteOnClick();
  // LECTOR incluido: el plano se ve en vivo, pero el hook no lo deja escribir.
  const sync = useSincronizacion(proyectoId, proyecto?.puedeEditar === true);

  const [registroListo, setRegistroListo] = useState(false);
  const [escenaCargando, setEscenaCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tema, setTema] = useState<"claro" | "oscuro">("claro");
  const [tono, setTono] = useState<TonoGuardado>("idle");
  const [aviso, setAviso] = useState<string | null>(null);
  const [presupuestoAbierto, setPresupuestoAbierto] = useState(false);

  const soloLectura = proyecto?.puedeEditar === false;

  /**
   * Un LECTOR entra en modo lectura.
   *
   * `setReadOnly` vive en el store de escena del paquete, no en un estado de
   * React: sin él, las herramientas siguen activas y el usuario arma
   * un plano que el backend le va a rechazar con 403 en cada guardado.
   */
  useEffect(() => {
    useScene.getState().setReadOnly(soloLectura);
    return () => useScene.getState().setReadOnly(false);
  }, [soloLectura]);

  useEffect(() => {
    const guardado = localStorage.getItem(TEMA_KEY);
    setTema(guardado === "oscuro" ? "oscuro" : "claro");
  }, []);

  useEffect(() => {
    let vivo = true;
    bootstrapRegistry()
      .then(() => {
        if (vivo) setRegistroListo(true);
      })
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e.message : "Falló el registro de nodos");
      });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * El documento ya lo trajo `editor-loader` antes de montar el shell, así que
   * acá no se vuelve a pedir.
   *
   * Si no hay documento —o la escena guardada está vacía, como en los proyectos
   * creados antes de que `apiCrearProyecto` persistiera la escena inicial— se
   * arranca con el terreno por defecto. Sin ese fallback la escena queda sin
   * building/level y el floorplan muestra "Switch to a building level…".
   */
  const onLoad = useCallback(async (): Promise<SceneGraph> => {
    const documento = useProjectStore.getState().documento;
    const escena = documento?.scene;
    if (!escena || Object.keys(escena.nodes ?? {}).length === 0) {
      return createDefaultScene();
    }
    return escena;
  }, []);

  /**
   * Documento actual para el guardado manual. Se arma desde `useScene` para
   * incluir colecciones, materiales y plugins, que también forman parte del
   * documento aunque no sean nodos.
   */
  const documentoActual = useCallback((): DocumentoProyecto => {
    const { nodes, rootNodeIds, collections, materials, installedPlugins } =
      useScene.getState();

    return {
      version: 1,
      scene: {
        nodes,
        rootNodeIds,
        collections,
        materials,
        installedPlugins,
      } as SceneGraph,
      vista: useEditor.getState().viewMode === "3d" ? "3d" : "2d",
    };
  }, []);

  /**
   * El autosave del paquete ya no escribe el documento: el gateway lo persiste
   * por el socket. El callback queda para que el paquete marque su estado local
   * como guardado; no hay request.
   */
  const onSave = useCallback(async () => {}, []);

  const onSaveStatusChange = useCallback((estado: string) => {
    // El paquete bloquea el guardado si la escena cae de más de 4 nodos a 4 o
    // menos (cree que fue un borrado accidental). Se marca `error` y conviene
    // decirlo, porque si no parece que el guardado no funciona.
    if (estado === "error") {
      setAviso(
        "El paquete bloqueó el guardado: la escena pasó a tener muy pocos nodos. Duplicá algo antes de guardar."
      );
      setTono("error");
      return;
    }
    setAviso(null);
    switch (estado) {
      case "pending":
      case "saving":
        setTono("working");
        break;
      case "saved":
        setTono("saved");
        break;
      case "idle":
        setTono("idle");
        break;
      default:
        break;
    }
  }, []);

  const handleLoaderChange = useCallback((visible: boolean) => {
    setEscenaCargando(visible);
    if (!visible) {
      requestAnimationFrame(() => {
        useEditor.setState({ navigationSyncPose: null });
        useEditor.getState().setViewMode("2d");
      });
    }
  }, []);

  const toggleTema = useCallback(() => {
    setTema((prev) => {
      const next = prev === "oscuro" ? "claro" : "oscuro";
      localStorage.setItem(TEMA_KEY, next);
      return next;
    });
  }, []);

  const sidebarTabs = useMemo(
    () => [
      {
        id: "build",
        label: "Construir",
        icon: <Hammer className="h-6 w-6" />,
        component: BuildTab,
      },
      {
        id: "muebles",
        label: "Muebles",
        icon: <Sofa className="h-6 w-6" />,
        component: MueblesTab,
      },
      {
        id: "materiales",
        label: "Materiales",
        icon: <Paintbrush className="h-6 w-6" />,
        component: MaterialesTab,
      },
      {
        id: "estructura",
        label: "Estructura",
        icon: <Braces className="h-6 w-6" />,
        component: EstructuraTab,
      },
    ],
    []
  );

  const cargando = !registroListo || escenaCargando;

  return (
    <div
      /*
       * `.shell` va SIEMPRE, y `.shellDark` se suma encima cuando toca.
       *
       * Casi todos los ajustes sobre los internos del paquete (ocultar sus
       * menús duplicados, radios, tipografía, reduced-motion) están scopeados
       * a `.shell`. Si en oscuro se pone solo `.shellDark`, esas reglas dejan
       * de aplicar y reaparecen el ActionMenu y el selector de pisos del
       * paquete junto a los propios. Los tokens oscuros ganan igual porque
       * `.shellDark` se declara después de `.shell` en el CSS.
       */
      className={`${s.shell}${tema === "oscuro" ? ` ${s.shellDark}` : ""}`}
      style={{ position: "fixed", inset: 0, overflow: "hidden" }}
    >
      {registroListo && (
        <Editor
          layoutVersion="v2"
          navbarSlot={
            <EditorNavbar
              estadoSync={sync.estado}
              mensajeGuardado={aviso}
              mensajeSync={sync.mensaje}
              nombreProyecto={nombreProyecto}
              onGuardarVersion={async (nombre) => {
                const ok = await guardarVersion(documentoActual(), nombre);
                if (ok) {
                  setTono("saved");
                  setAviso("Versión guardada: se puede volver a este punto.");
                } else {
                  setTono("error");
                  setAviso("No se pudo guardar la versión.");
                }
              }}
              onAbrirPresupuesto={() => setPresupuestoAbierto(true)}
              onRestaurar={() => {
                // Sin recarga: el backend re-siembra el doc del gateway y
                // difunde `sync:inicial`, que reemplaza la escena en vivo (ver
                // use-sincronizacion).
                setTono("saved");
                setAviso("Versión restaurada.");
              }}
              onToggleTema={toggleTema}
              miRol={proyecto?.miRol ?? "CREADOR"}
              proyectoId={proyectoId}
              soloLectura={soloLectura}
              tema={tema}
              tonoGuardado={tono}
            />
          }
          onLoad={onLoad}
          onLoaderChange={handleLoaderChange}
          onSave={onSave}
          onSaveStatusChange={onSaveStatusChange as never}
          projectId={proyectoId}
          sidebarTabs={sidebarTabs as never}
        />
      )}

      {/* Error definitivo de sync (sesión, acceso o expulsión): reconectar no
          sirve, así que se avisa sin bloquear el resto de la UI. */}
      {sync.fatal && (
        <div
          className="fixed left-1/2 top-16 z-50 max-w-md -translate-x-1/2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-center text-sm text-red-800 shadow-lg"
          role="alert"
        >
          <p className="font-medium">Se cerró la sincronización</p>
          <p className="mt-1">
            {sync.mensaje ?? "El servidor cerró la conexión."} Volvé a abrir el
            proyecto para continuar.
          </p>
        </div>
      )}

      {/* Los menús van como hermanos del `<Editor>`, no en `stageOverlay`.
          El paquete envuelve ese slot en `<div className="absolute inset-0 z-10">`
          SIN `pointer-events-none` (editor-layout-v2.tsx:191), así que se
          convierte en una capa que captura todos los clics del lienzo. El
          único síntoma era el paneo con espacio: la cámara es la única pieza del
          paquete que valida `gl.domElement.contains(event.target)`
          (custom-camera-controls.tsx:816). El resto de herramientas escuchan en
          `window` y no lo notan. */}
      <LevelSelector />
      <BottomBar />

      <LevelBootstrap />
      <PropertiesPanel />
      <AssistantPanel
        puedeEditar={!soloLectura}
        proyectoId={proyectoId}
        usuarioId={usuarioId}
      />
      <HelpAssistant usuarioId={usuarioId} />
      <PanelPresupuesto
        abierto={presupuestoAbierto}
        miRol={proyecto?.miRol ?? "CREADOR"}
        nombreProyecto={nombreProyecto}
        onCerrar={() => setPresupuestoAbierto(false)}
        proyectoId={proyectoId}
        puedeEditar={!soloLectura}
      />

      {(cargando || error) && (
        <div className={s.boot}>
          {error ? (
            <>
              <p className={s.bootErr}>{error}</p>
              <p className={s.bootMsg}>No se pudo iniciar el editor</p>
            </>
          ) : (
            <>
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
              <p className={s.bootMsg}>
                {!registroListo ? "Cargando módulos…" : "Cargando proyecto…"}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
