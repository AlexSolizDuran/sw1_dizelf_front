"use client";

import { useCallback, useState } from "react";
import { Trash2, UserPlus, Users } from "lucide-react";
import {
  apiAgregarColaborador,
  apiListarColaboradores,
  apiQuitarColaborador,
} from "@/lib/projects";
import type { Colaborador } from "@/types/proyecto";
import { Popover, PopoverBody, PopoverTrigger } from "./menus/ui/popover";
import s from "./editor.module.css";

/**
 * Quién está invitado al proyecto y con qué permiso.
 *
 * Solo el creador puede invitar o quitar; el resto ve la lista y nada más. La
 * condición sale de `proyecto.miRol`, que el backend ya resolvió.
 *
 * El permiso se elige explícitamente porque no es obvio: con `EDITOR` la otra
 * persona modifica tu plano, y esa decisión no debería taken por defecto.
 */
export function PanelColaboradores({
  proyectoId,
  miRol,
}: {
  proyectoId: string;
  miRol: string;
}) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identificador, setIdentificador] = useState("");
  const [rol, setRol] = useState<"EDITOR" | "LECTOR">("EDITOR");
  const [enviando, setEnviando] = useState(false);

  const esCreador = miRol === "CREADOR";

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setColaboradores(await apiListarColaboradores(proyectoId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la lista.");
    } finally {
      setCargando(false);
    }
  }, [proyectoId]);

  const invitar = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = identificador.trim();
    if (!limpio || enviando) return;

    setEnviando(true);
    setError(null);
    try {
      await apiAgregarColaborador(proyectoId, { identificador: limpio, rol });
      setIdentificador("");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo invitar.");
    } finally {
      setEnviando(false);
    }
  };

  const quitar = async (colaborador: Colaborador) => {
    const ok = window.confirm(
      `¿Quitar a ${colaborador.username} del proyecto? Va a perder el acceso.`
    );
    if (!ok) return;
    try {
      await apiQuitarColaborador(proyectoId, colaborador.usuarioId);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar.");
    }
  };

  return (
    <Popover>
      {({ abierto }) => (
        <>
          {/* El propio botón es el trigger: acá no hay acción partida como en Referencias. */}
          <PopoverTrigger
            className={s.iconBtn}
            label={`Colaboradores: ${colaboradores.length}`}
            onClick={() => {
              // La lista se pide al abrir, no al montar: el editor puede estar
              // horas abierto y las invitaciones cambian desde otro lado.
              if (!abierto) void cargar();
            }}
          >
            <Users className="h-3.5 w-3.5" />
          </PopoverTrigger>

          <PopoverBody Icon={Users} titulo="Colaboradores">
            {error ? <p className={s.popoverError} role="alert">{error}</p> : null}

            {cargando && colaboradores.length === 0 ? (
              <p className={s.refEmpty}>Cargando…</p>
            ) : colaboradores.length === 0 ? (
              <p className={s.refEmpty}>
                Todavía no hay colaboradores. Invitá a alguien por su usuario o
                correo.
              </p>
            ) : (
              <ul className={s.colabLista}>
                {colaboradores.map((c) => (
                  <li className={s.colabFila} key={c.id}>
                    <span className={s.colabAvatar} aria-hidden="true">
                      {(c.username?.[0] ?? "?").toUpperCase()}
                    </span>
                    <span className={s.colabDatos}>
                      <span className={s.colabNombre}>{c.username}</span>
                      <span className={s.colabRol} data-lector={!c.puedeEditar}>
                        {c.permiso === "LECTOR" ? "Solo lectura" : "Puede editar"}
                      </span>
                    </span>
                    {esCreador && (
                      <button
                        aria-label={`Quitar a ${c.username}`}
                        className={s.refBorrar}
                        onClick={() => quitar(c)}
                        title="Quitar del proyecto"
                        type="button"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {esCreador && (
              <form className={s.colabForm} onSubmit={invitar}>
                <label className={s.srOnly} htmlFor="invite-identificador">
                  Usuario o correo a invitar
                </label>
                <input
                  autoComplete="off"
                  className={s.colabInput}
                  id="invite-identificador"
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="usuario o correo"
                  value={identificador}
                />

                <label className={s.srOnly} htmlFor="invite-rol">
                  Permiso
                </label>
                <select
                  className={s.colabSelect}
                  id="invite-rol"
                  onChange={(e) => setRol(e.target.value as "EDITOR" | "LECTOR")}
                  value={rol}
                >
                  <option value="EDITOR">Puede editar</option>
                  <option value="LECTOR">Solo lectura</option>
                </select>

                <button
                  className={s.colabEnviar}
                  disabled={enviando || !identificador.trim()}
                  type="submit"
                >
                  <UserPlus className="h-3 w-3" />
                  {enviando ? "…" : "Invitar"}
                </button>
              </form>
            )}

            {!esCreador && (
              <p className={s.refEmpty}>
                Solo el creador puede invitar o quitar gente.
              </p>
            )}
          </PopoverBody>
        </>
      )}
    </Popover>
  );
}