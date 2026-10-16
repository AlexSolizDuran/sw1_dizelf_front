"use client";

import { useCallback, useState } from "react";
import { History, Pencil, RotateCcw, Trash2 } from "lucide-react";
import {
  apiEliminarVersion,
  apiListarVersiones,
  apiRenombrarVersion,
  apiRestaurarVersion,
} from "@/lib/projects";
import type { Version } from "@/types/proyecto";
import { Popover, PopoverBody, PopoverTrigger } from "./menus/ui/popover";
import s from "./editor.module.css";

/**
 * Historial de guardados manuales.
 *
 * Solo aparece con permiso de edición: un LECTOR no puede guardar y por lo
 * tanto tampoco tiene nada que restaurar.
 *
 * RESTAURAR YA NO RECARGA EL EDITOR
 * ----------------------------------
 * Antes sí: sin `aplicarRestauracion` en el gateway, el `Y.Doc` en memoria
 * seguía con la escena vieja y la volvía a pisar. Ahora el backend re-siembra
 * ese doc y difunde `sync:inicial`, y el cliente lo aplica con `setScene`
 * (reemplazo total). La escena en vivo se actualiza sola; `alRestaurar` solo
 * avisa y descarta el autosave encolado.
 *
 * RENOMBRAR Y ELIMINAR
 * --------------------
 * Son operaciones sobre la FILA del historial, no sobre el plano. Renombrar
 * cambia solo la etiqueta; eliminar quita el punto de restauración sin tocar el
 * documento vivo. La lista se actualiza en memoria con la respuesta, sin
 * recargar.
 */
export function PanelVersiones({
  proyectoId,
  puedeEditar,
  alRestaurar,
}: {
  proyectoId: string;
  puedeEditar: boolean;
  alRestaurar: () => void;
}) {
  const [versiones, setVersiones] = useState<Version[]>([]);
  const [cargando, setCargando] = useState(false);
  const [restaurando, setRestaurando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setVersiones(await apiListarVersiones(proyectoId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el historial.");
    } finally {
      setCargando(false);
    }
  }, [proyectoId]);

  const restaurar = async (version: Version) => {
    const ok = window.confirm(
      "Restaurar este guardado. Se va a reemplazar la escena actual por la de esa versión; lo que hiciste desde entonces queda en el historial."
    );
    if (!ok) return;

    setRestaurando(version.id);
    setError(null);
    try {
      await apiRestaurarVersion(proyectoId, version.id);
      // Recarga completa: ver la nota del componente.
      alRestaurar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo restaurar.");
    } finally {
      setRestaurando(null);
    }
  };

  const renombrar = async (version: Version) => {
    const entrada = window.prompt(
      "Nuevo nombre de la versión:",
      version.nombre ?? ""
    );
    if (entrada === null) return;
    const nombre = entrada.trim();
    if (!nombre) return;

    setError(null);
    try {
      const actualizada = await apiRenombrarVersion(
        proyectoId,
        version.id,
        nombre
      );
      setVersiones((prev) =>
        prev.map((v) => (v.id === actualizada.id ? actualizada : v))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo renombrar.");
    }
  };

  const eliminar = async (version: Version) => {
    const etiqueta = version.nombre ?? `Versión ${version.id}`;
    const ok = window.confirm(
      `Eliminar «${etiqueta}». No se puede deshacer y no afecta al plano actual.`
    );
    if (!ok) return;

    setError(null);
    try {
      await apiEliminarVersion(proyectoId, version.id);
      setVersiones((prev) => prev.filter((v) => v.id !== version.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  };

  if (!puedeEditar) return null;

  return (
    <Popover>
      {({ abierto }) => (
        <>
          <PopoverTrigger
            className={s.iconBtn}
            label="Historial de versiones"
            onClick={() => {
              if (!abierto) void cargar();
            }}
          >
            <History className="h-3.5 w-3.5" />
          </PopoverTrigger>

          <PopoverBody Icon={History} titulo="Versiones guardadas">
            {error ? <p className={s.popoverError} role="alert">{error}</p> : null}

            {cargando && versiones.length === 0 ? (
              <p className={s.refEmpty}>Cargando…</p>
            ) : versiones.length === 0 ? (
              <p className={s.refEmpty}>
                Todavía no hay versiones. Usá el botón de guardar del editor
                para crear la primera.
              </p>
            ) : (
              <ul className={s.colabLista}>
                {versiones.map((v) => (
                  <li className={s.colabFila} key={v.id}>
                    <span className={s.colabDatos}>
                      <span className={s.colabNombre}>
                        {v.nombre ?? `Versión ${v.id}`}
                      </span>
                      <span className={s.colabRol} data-lector="true">
                        {new Date(v.fecha).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </span>
                    <button
                      aria-label={`Restaurar la versión del ${new Date(v.fecha).toLocaleString("es-AR")}`}
                      className={s.refBorrar}
                      disabled={restaurando !== null}
                      onClick={() => restaurar(v)}
                      title="Restaurar este guardado"
                      type="button"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <button
                      aria-label={`Renombrar la versión del ${new Date(v.fecha).toLocaleString("es-AR")}`}
                      className={s.refEditar}
                      onClick={() => renombrar(v)}
                      title="Renombrar"
                      type="button"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      aria-label={`Eliminar la versión del ${new Date(v.fecha).toLocaleString("es-AR")}`}
                      className={s.refBorrar}
                      onClick={() => eliminar(v)}
                      title="Eliminar"
                      type="button"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverBody>
        </>
      )}
    </Popover>
  );
}