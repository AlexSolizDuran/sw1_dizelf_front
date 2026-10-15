"use client";

import { useCallback, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { apiListarVersiones, apiRestaurarVersion } from "@/lib/projects";
import type { Version } from "@/types/proyecto";
import { Popover, PopoverBody, PopoverTrigger } from "./menus/ui/popover";
import s from "./editor.module.css";

/**
 * Historial de guardados manuales.
 *
 * Solo aparece con permiso de edición: un LECTOR no puede guardar y por lo
 * tanto tampoco tiene nada que restaurar.
 *
 * RESTAURAR RECARGA EL EDITOR, Y NO POR COSMETÍA
 * ----------------------------------------------
 * La restauración escribe en `documento_colaborativo`, pero al restoring sigue
 * abierto puede haber dos cosas desactualizadas: el `useScene` del cliente y el
 * `Y.Doc` que el gateway tiene en memoria. Si solo se recarga la lista, el
 * siguiente guardado del CRDT volvería a pisar lo que se restauró. Por eso
 * `alRestaurar` recarga la página: el cliente se desconecta, el gateway
 * libera el doc y el siguiente que entra lo siembra desde la base.
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
      "Restaurar este guardado. Se va a recargar el editor y perderás de la pantalla lo que hiciste desde entonces, aunque queda en el historial como un guardado nuevo."
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