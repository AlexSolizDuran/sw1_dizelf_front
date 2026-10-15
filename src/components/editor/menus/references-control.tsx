"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  type AnyNodeId,
  type GuideNode,
  type LevelNode,
  type ScanNode,
  useScene,
} from "@pascal-app/core";
import { useViewer } from "@pascal-app/viewer";
import { useEditor } from "@pascal-app/editor";
import { useShallow } from "zustand/react/shallow";
import {
  Check,
  Eye,
  EyeOff,
  FileImage,
  Scan,
  Trash2,
  Upload,
} from "lucide-react";
import { crearGuiaLocal } from "@/lib/editor/guide-image";
import { Popover, PopoverBody, PopoverChevron, PopoverTrigger } from "./ui/popover";
import s from "../editor.module.css";

const TIPOS_ACEPTADOS = "image/jpeg,image/png,image/webp,image/gif";

/**
 * Nodos de referencia que cuelgan del nivel actual.
 *
 * El selector devuelve **un solo array plano**, no un objeto `{ escaneos,
 * guias }`. `useShallow` compara el resultado elemento a elemento, así que con
 * un array de nodos (que son referencias estables del store) la comparación da
 * igual aunque `.filter()` cree un array nuevo cada vez. Con un objeto, en
 * cambio, sus dos valores serían arrays distintos en cada llamada: el snapshot
 * nunca coincidiría y Zustand dispararía un render infinito.
 *
 * Por eso el reparto por tipo va afuera, en `useMemo`.
 */
function useReferenciasDelNivel() {
  const nivelId = useViewer((st) => st.selection.levelId);

  const nodos = useScene(
    useShallow((state) => {
      if (!nivelId) return [] as (ScanNode | GuideNode)[];
      const nivel = state.nodes[nivelId];
      if (!nivel || nivel.type !== "level") return [] as (ScanNode | GuideNode)[];
      return (nivel as LevelNode).children
        .map((id) => state.nodes[id])
        .filter(
          (n): n is ScanNode | GuideNode =>
            n?.type === "scan" || n?.type === "guide"
        );
    })
  );

  const escaneos = useMemo(
    () => nodos.filter((n) => n.type === "scan"),
    [nodos]
  );
  const guias = useMemo(() => nodos.filter((n) => n.type === "guide"), [nodos]);

  return { escaneos, guias };
}

/**
 * Control de referencias: un botón partido que muestra/oculta todo y abre un
 * panel con los escaneos y las imágenes guía del nivel.
 *
 * Réplica de `ReferencesControl` del `view-toggles.tsx` del paquete.
 *
 * **Los escaneos `.glb` quedan deshabilitados a propósito.** Subirlos requiere
 * un `uploadHandler` que registre la aplicación host
 * (`useUploadStore.registerUploadHandler`), y hoy nadie lo registra: el paquete
 * tampoco lo hace y el backend no tiene endpoint de subida. Mostrar un botón
 * que no hace nada sería peor que decir por qué no está.
 */
export function ReferencesControl() {
  const { escaneos, guias } = useReferenciasDelNivel();
  const mostrarEscaneos = useViewer((st) => st.showScans);
  const setMostrarEscaneos = useViewer((st) => st.setShowScans);
  const mostrarGuias = useViewer((st) => st.showGuides);
  const setMostrarGuias = useViewer((st) => st.setShowGuides);
  const setSelection = useViewer((st) => st.setSelection);
  const setReferenciaSeleccionada = useEditor((st) => st.setSelectedReferenceId);
  const referenciaSeleccionada = useEditor((st) => st.selectedReferenceId);
  const updateNode = useScene((st) => st.updateNode);
  const deleteNode = useScene((st) => st.deleteNode);
  const nivelId = useViewer((st) => st.selection.levelId);

  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  const total = escaneos.length + guias.length;
  const algunaVisible = mostrarEscaneos || mostrarGuias;

  const alternarTodo = useCallback(() => {
    const siguiente = !algunaVisible;
    setMostrarEscaneos(siguiente);
    setMostrarGuias(siguiente);
  }, [algunaVisible, setMostrarEscaneos, setMostrarGuias]);

  const elegir = (id: AnyNodeId, mostrar: (v: boolean) => void) => {
    mostrar(true);
    setReferenciaSeleccionada(id);
    setSelection({ selectedIds: [], zoneId: null });
  };

  const borrar = (e: React.MouseEvent, id: AnyNodeId) => {
    e.stopPropagation();
    deleteNode(id);
    if (referenciaSeleccionada === id) setReferenciaSeleccionada(null);
  };

  const cambiarOpacidad = (id: AnyNodeId, valor: number) => {
    updateNode(id, { opacity: Math.round(Math.min(100, Math.max(0, valor))) });
  };

  const alElegirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo || !nivelId) return;

    setError(null);
    if (!archivo.type.startsWith("image/")) {
      setError("Solo se aceptan imágenes (jpg, png, webp, gif).");
      return;
    }

    setSubiendo(true);
    try {
      const guia = await crearGuiaLocal({ archivo, nivelId });
      setMostrarGuias(true);
      setReferenciaSeleccionada(guia.id as AnyNodeId);
      setSelection({ selectedIds: [], zoneId: null });
    } catch {
      // IndexedDB puede estar bloqueado en navegación privada.
      setError("No se pudo guardar la imagen en este navegador.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Popover>
      {({ abierto }) => (
        <>
          <button
            aria-label={`Referencias: ${algunaVisible ? "visibles" : "ocultas"}`}
            className={`${s.menuBtn} ${s.menuBtnSplit}`}
            data-active={algunaVisible}
            onClick={alternarTodo}
            title={`Referencias: ${algunaVisible ? "visibles" : "ocultas"}`}
            type="button"
          >
            <Scan className="h-5 w-5" />
            {total > 0 ? <span className={s.menuBadge}>{total}</span> : null}
          </button>

          <PopoverTrigger
            className={`${s.menuBtn} ${s.menuChevron} ${algunaVisible ? s.menuBtnOn : ""}`}
            label="Ajustes de referencias"
          >
            <PopoverChevron abierto={abierto} />
          </PopoverTrigger>

          <PopoverBody Icon={FileImage} titulo="Referencias">
            {error ? <p className={s.popoverError}>{error}</p> : null}

            {/* Escaneos */}
            <section className={s.refSection}>
              <header className={s.refHead}>
                <Scan className="h-3.5 w-3.5 shrink-0" />
                <span className={s.techLabel}>Escaneos</span>
                <span className={s.panelSectionN}>{escaneos.length}</span>
                <button
                  aria-label={mostrarEscaneos ? "Ocultar escaneos" : "Mostrar escaneos"}
                  className={s.refToggle}
                  onClick={() => setMostrarEscaneos(!mostrarEscaneos)}
                  title={mostrarEscaneos ? "Ocultar" : "Mostrar"}
                  type="button"
                >
                  {mostrarEscaneos ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </header>

              {escaneos.length === 0 ? (
                <p className={s.refEmpty}>
                  Sin escaneos. La subida de archivos <code>.glb</code> todavía
                  no está disponible.
                </p>
              ) : (
                <ul aria-label="Escaneos del nivel" className={s.refList} role="region" tabIndex={0}>
                  {escaneos.map((n, i) => (
                    <FilaReferencia
                      activo={referenciaSeleccionada === n.id}
                      id={n.id as AnyNodeId}
                      key={n.id}
                      nombre={n.name || `Escaneo ${i + 1}`}
                      opacidad={n.opacity}
                      onBorrar={(e) => borrar(e, n.id as AnyNodeId)}
                      onElegir={() => elegir(n.id as AnyNodeId, setMostrarEscaneos)}
                      onOpacidad={(v) => cambiarOpacidad(n.id as AnyNodeId, v)}
                    />
                  ))}
                </ul>
              )}
            </section>

            <div className={s.techDivider} />

            {/* Imágenes guía */}
            <section className={s.refSection}>
              <header className={s.refHead}>
                <FileImage className="h-3.5 w-3.5 shrink-0" />
                <span className={s.techLabel}>Imágenes guía</span>
                <span className={s.panelSectionN}>{guias.length}</span>
                <button
                  aria-label={mostrarGuias ? "Ocultar imágenes guía" : "Mostrar imágenes guía"}
                  className={s.refToggle}
                  onClick={() => setMostrarGuias(!mostrarGuias)}
                  title={mostrarGuias ? "Ocultar" : "Mostrar"}
                  type="button"
                >
                  {mostrarGuias ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  aria-label="Subir imagen guía"
                  className={s.refToggle}
                  disabled={subiendo}
                  onClick={() => inputRef.current?.click()}
                  title="Subir imagen guía"
                  type="button"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
                <input
                  accept={TIPOS_ACEPTADOS}
                  className="hidden"
                  onChange={alElegirArchivo}
                  ref={inputRef}
                  type="file"
                />
              </header>

              {guias.length === 0 ? (
                <p className={s.refEmpty}>
                  Sin imágenes guía. Subí una foto del plano para tenerla de
                  referencia al dibujar.
                </p>
              ) : (
                <ul aria-label="Imágenes guía del nivel" className={s.refList} role="region" tabIndex={0}>
                  {guias.map((n, i) => (
                    <FilaReferencia
                      activo={referenciaSeleccionada === n.id}
                      id={n.id as AnyNodeId}
                      key={n.id}
                      nombre={n.name || `Imagen guía ${i + 1}`}
                      opacidad={n.opacity}
                      onBorrar={(e) => borrar(e, n.id as AnyNodeId)}
                      onElegir={() => elegir(n.id as AnyNodeId, setMostrarGuias)}
                      onOpacidad={(v) => cambiarOpacidad(n.id as AnyNodeId, v)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </PopoverBody>
        </>
      )}
    </Popover>
  );
}

/* ── Fila ────────────────────────────────────────────────────────────────── */

function FilaReferencia({
  id,
  nombre,
  opacidad,
  activo,
  onElegir,
  onBorrar,
  onOpacidad,
}: {
  id: AnyNodeId;
  nombre: string;
  opacidad: number;
  activo: boolean;
  onElegir: () => void;
  onBorrar: (e: React.MouseEvent) => void;
  onOpacidad: (v: number) => void;
}) {
  return (
    <li className={s.refItem} data-active={activo}>
      <div className="flex items-center gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={onElegir} type="button">
          <span className={s.refName}>{nombre}</span>
        </button>
        {activo ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
        <button
          aria-label={`Borrar ${nombre}`}
          className={s.refBorrar}
          onClick={onBorrar}
          title="Borrar"
          type="button"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <label className={s.refOpacity}>
        <span>Opacidad</span>
        <input
          aria-label={`Opacidad de ${nombre}`}
          className={s.propsRange}
          max={100}
          min={0}
          onChange={(e) => onOpacidad(Number(e.target.value))}
          step={1}
          type="range"
          value={opacidad ?? 50}
        />
        <span className={s.propsUnit}>{opacidad ?? 50}%</span>
      </label>
      <span className="sr-only">{id}</span>
    </li>
  );
}