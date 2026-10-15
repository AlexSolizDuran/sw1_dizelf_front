"use client";

import { useMemo, useState } from "react";
import { useScene, type AnyNode, type AnyNodeId } from "@pascal-app/core";
import { Check, Copy } from "lucide-react";
import { buildAiJson, buildEditorJson, type SceneStateLike } from "@/lib/editor/scene-json";
import s from "./editor.module.css";

type View = "editor" | "ai";

/**
 * Estructura de la escena en JSON, en dos representaciones.
 *
 * - `editor`: el `SceneGraph` crudo — la fuente de verdad que persiste el
 *   editor. Si algo falta, se está viendo acá.
 * - `ia`: resumen del plano reagrupado por categoría, con superficies,
 *   relaciones entre estancias y los datos de los objetos. Solo lectura.
 *
 * Ambas se recalculan desde `useScene`, así que acompañan cada edición del
 * plano. El texto va en `<pre>` con scroll: sin cortes.
 */
export function EstructuraTab() {
  const [view, setView] = useState<View>("ai");
  const [copied, setCopied] = useState(false);

  const nodes = useScene((st) => st.nodes) as Record<AnyNodeId, AnyNode>;
  const rootNodeIds = useScene((st) => st.rootNodeIds);
  const collections = useScene((st) => st.collections);
  const materials = useScene((st) => st.materials);
  const installedPlugins = useScene((st) => st.installedPlugins);

  const text = useMemo(() => {
    if (Object.keys(nodes).length === 0) return "(escena vacía)";
    const state: SceneStateLike = {
      nodes,
      rootNodeIds,
      collections: collections as Record<string, unknown>,
      materials: materials as Record<string, unknown>,
      installedPlugins,
    };
    return view === "editor" ? buildEditorJson(state) : buildAiJson(state);
  }, [nodes, rootNodeIds, collections, materials, installedPlugins, view]);

  const kb = useMemo(() => (new Blob([text]).size / 1024).toFixed(1), [text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // El portapapeles puede estar bloqueado por permisos: no es crítico.
    }
  };

  return (
    <div className={s.struct}>
      <div className={`${s.seg} w-full`}>
        <button
          className="flex-1 justify-center"
          data-active={view === "editor"}
          onClick={() => setView("editor")}
          type="button"
        >
          Del editor
        </button>
        <button
          className="flex-1 justify-center"
          data-active={view === "ai"}
          onClick={() => setView("ai")}
          type="button"
        >
          Para IA
        </button>
      </div>

      <div className={s.structBar}>
        <span className={s.techLabel}>
          {view === "editor" ? "SceneGraph crudo" : "manifiesto operable"}
        </span>
        <span className={s.toolKey}>{kb} KB</span>
        <button className={s.structCopy} onClick={copy} type="button">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      <pre className={s.structPre}>{text}</pre>

      <p className={s.hint}>
        {view === "editor"
          ? "El documento que persiste el editor: nodes, rootNodeIds, collections, materials e installedPlugins."
          : "Solo información del plano: resumen, estancias con superficies, aberturas, relaciones y objetos."}
      </p>
    </div>
  );
}
