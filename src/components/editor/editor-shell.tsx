"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Editor, type SceneGraph, useEditor } from "@pascal-app/editor";
import { useScene } from "@pascal-app/core";
import { useProjectStore } from "@/stores/use-project-store";
import { BuildTab } from "./build-tab";
import { EditorNavbar, type TonoGuardado } from "./editor-navbar";
import { EstructuraTab } from "./estructura-tab";
import { LevelBootstrap } from "./level-bootstrap";
import { MaterialesTab } from "./materiales-tab";
import { MueblesTab } from "./muebles-tab";
import { BottomBar } from "./menus/bottom-bar";
import { LevelSelector } from "./menus/level-selector";
import { PropertiesPanel } from "./properties-panel";
import { bootstrapRegistry } from "./icons/registry-patch";
import { useDeleteOnClick } from "@/hooks/use-delete-on-click";
import { Braces, Hammer, Paintbrush, Sofa } from "./icons/glyphs";
import s from "./editor.module.css";

const TEMA_KEY = "dizelf-editor-tema";

/** Terreno de 30×30 m con un edificio y un nivel, para empezar de cero. */
function createDefaultScene(): SceneGraph {
  const siteId = "site_default";
  const buildingId = "building_default";
  const levelId = "level_default";

  return {
    nodes: {
      [siteId]: {
        id: siteId,
        type: "site",
        polygon: {
          type: "polygon",
          points: [
            [-15, -15],
            [15, -15],
            [15, 15],
            [-15, 15],
          ],
        },
        children: [buildingId],
      },
      [buildingId]: {
        id: buildingId,
        type: "building",
        children: [levelId],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
      [levelId]: {
        id: levelId,
        type: "level",
        level: 0,
        children: [],
      },
    },
    rootNodeIds: [siteId],
  } as SceneGraph;
}

interface Props {
  proyectoId: string;
  nombreProyecto: string;
}

export function EditorShell({ proyectoId, nombreProyecto }: Props) {
  const guardar = useProjectStore((st) => st.guardar);
  const guardarVersion = useProjectStore((st) => st.guardarVersion);
  const proyecto = useProjectStore((st) => st.proyecto);

  useDeleteOnClick();

  const [registroListo, setRegistroListo] = useState(false);
  const [escenaCargando, setEscenaCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tema, setTema] = useState<"claro" | "oscuro">("claro");
  const [tono, setTono] = useState<TonoGuardado>("idle");
  const [aviso, setAviso] = useState<string | null>(null);

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
   * acá no se vuelve a pedir. Si aún no hay nada, se arranca con el terreno por
   * defecto y la primera edición lo persiste.
   */
  const onLoad = useCallback(async (): Promise<SceneGraph> => {
    const documento = useProjectStore.getState().documento;
    return documento?.scene ?? createDefaultScene();
  }, []);

  const onSave = useCallback(
    async (scene: SceneGraph, opciones?: { keepalive?: boolean }) => {
      // Un LECTOR no escribe: el backend rechaza el PATCH con 403 y, sin este
      // corte, el editor intentaría guardar cada segundo para que el navbar
      // quedara parpadeando en rojo.
      if (useProjectStore.getState().proyecto?.puedeEditar === false) return;
      await guardar(
        {
          version: 1,
          scene,
          vista: useEditor.getState().viewMode === "3d" ? "3d" : "2d",
        },
        opciones
      );
    },
    [guardar]
  );

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
      className={tema === "oscuro" ? s.shellDark : s.shell}
      style={{ position: "fixed", inset: 0, overflow: "hidden" }}
    >
      {registroListo && (
        <Editor
          layoutVersion="v2"
          navbarSlot={
            <EditorNavbar
              mensajeGuardado={aviso}
              nombreProyecto={nombreProyecto}
              onGuardarVersion={async () => {
                const ok = await guardarVersion();
                if (ok) {
                  setTono("saved");
                  setAviso("Versión guardada: se puede volver a este punto.");
                } else {
                  setTono("error");
                  setAviso("No se pudo guardar la versión.");
                }
              }}
              onToggleTema={toggleTema}
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
