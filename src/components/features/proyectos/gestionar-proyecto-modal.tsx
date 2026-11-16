"use client";

import React, { useEffect, useState } from "react";
import { Search, Trash2, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProyectosStore } from "@/stores/use-proyectos-store";
import {
  apiAgregarColaborador,
  apiBuscarUsuarios,
  apiListarColaboradores,
  apiObtenerProyecto,
  apiQuitarColaborador,
} from "@/lib/projects";
import type {
  Colaborador,
  Proyecto,
  UsuarioBusqueda,
} from "@/types/proyecto";

interface GestionarProyectoModalProps {
  proyectoId: string | null;
  onClose: () => void;
}

type RolInvitacion = "LECTOR" | "EDITOR";

/**
 * Modal "Gestionar": renombrar el proyecto y administrar colaboradores.
 *
 * El flujo de invitación es en dos pasos: buscar (`GET /usuarios/buscar`) y
 * confirmar con el identificador exacto (`POST /proyectos/:id/colaboradores`).
 * El rol se elige antes de invitar; si se omite, el backend asigna LECTOR.
 */
export function GestionarProyectoModal({
  proyectoId,
  onClose,
}: GestionarProyectoModalProps) {
  const renombrar = useProyectosStore((s) => s.renombrar);
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [nombre, setNombre] = useState("");
  const [termino, setTermino] = useState("");
  const [resultados, setResultados] = useState<UsuarioBusqueda[]>([]);
  const [rol, setRol] = useState<RolInvitacion>("LECTOR");
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const abierto = proyectoId !== null;
  const esCreador = proyecto?.miRol === "CREADOR";

  useEffect(() => {
    if (!proyectoId) {
      setProyecto(null);
      setColaboradores([]);
      setNombre("");
      setTermino("");
      setResultados([]);
      setRol("LECTOR");
      setError(null);
      setAviso(null);
      return;
    }
    let vivo = true;
    setCargando(true);
    setError(null);
    Promise.all([
      apiObtenerProyecto(proyectoId),
      apiListarColaboradores(proyectoId),
    ])
      .then(([detalle, cols]) => {
        if (!vivo) return;
        setProyecto(detalle);
        setNombre(detalle.nombre);
        setColaboradores(cols);
      })
      .catch((e) => {
        if (!vivo) return;
        setError(
          e instanceof Error ? e.message : "No se pudo cargar el proyecto."
        );
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [proyectoId]);

  useEffect(() => {
    const t = termino.trim();
    if (t.length < 2 || !abierto) {
      setResultados([]);
      return;
    }
    const id = window.setTimeout(() => {
      apiBuscarUsuarios(t)
        .then(setResultados)
        .catch(() => setResultados([]));
    }, 300);
    return () => window.clearTimeout(id);
  }, [termino, abierto]);

  async function handleRenombrar() {
    if (!proyectoId) return;
    const t = nombre.trim();
    if (t.length < 3 || t.length > 100) {
      setError("El nombre debe tener entre 3 y 100 caracteres.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await renombrar(proyectoId, t);
      setProyecto((p) => (p ? { ...p, nombre: t } : p));
      setAviso("Nombre actualizado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo renombrar.");
    } finally {
      setGuardando(false);
    }
  }

  async function handleAgregar(identificador: string) {
    if (!proyectoId) return;
    setError(null);
    setAviso(null);
    try {
      const nuevo = await apiAgregarColaborador(proyectoId, {
        identificador,
        rol,
      });
      setColaboradores((c) => [...c, nuevo]);
      setTermino("");
      setResultados([]);
      setAviso(`${nuevo.username} agregado como ${rol.toLowerCase()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar.");
    }
  }

  async function handleQuitar(usuarioId: number, username: string) {
    if (!proyectoId) return;
    if (!window.confirm(`¿Quitar a ${username} del proyecto?`)) return;
    try {
      await apiQuitarColaborador(proyectoId, usuarioId);
      setColaboradores((c) => c.filter((x) => x.usuarioId !== usuarioId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar.");
    }
  }

  return (
    <Modal
      open={abierto}
      onClose={onClose}
      title="Gestionar proyecto"
      subtitle={proyecto ? proyecto.nombre : "Cargando..."}
      maxWidth="max-w-xl"
    >
      {cargando && <p className="text-xs text-[#7A6D63]">Cargando...</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {aviso && <p className="text-xs text-green-700">{aviso}</p>}

      {proyecto && (
        <div className="space-y-6">
          <div>
            <Input
              label="Renombrar proyecto"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={100}
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRenombrar()}
                isLoading={guardando}
              >
                Guardar nombre
              </Button>
            </div>
          </div>

          <div className="border-t border-[#F0EAE1] pt-4">
            <h3 className="text-sm font-bold text-[#2B2A28]">
              Colaboradores ({colaboradores.length})
            </h3>
            {!esCreador && (
              <p className="mt-1 text-[11px] text-[#7A6D63]">
                Eres invitado: puedes ver la lista, solo el creador puede
                invitar o quitar colaboradores.
              </p>
            )}

            <ul className="mt-3 divide-y divide-[#F0EAE1] border border-[#F0EAE1] rounded-lg overflow-hidden">
              {colaboradores.length === 0 && (
                <li className="px-4 py-3 text-xs text-[#7A6D63]">
                  Sin colaboradores todavía.
                </li>
              )}
              {colaboradores.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#2B2A28] truncate">
                      @{c.username}
                    </p>
                    <p className="text-[11px] text-[#7A6D63] truncate">
                      {c.gmail}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded bg-[#F2E8E2] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#6A3825]">
                      {c.permiso}
                    </span>
                    {esCreador && (
                      <button
                        type="button"
                        onClick={() => void handleQuitar(c.usuarioId, c.username)}
                        aria-label={`Quitar a ${c.username}`}
                        className="p-1.5 rounded-full text-[#7C6E64] hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {esCreador && (
              <div className="mt-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A7C73]" />
                    <input
                      value={termino}
                      onChange={(e) => setTermino(e.target.value)}
                      placeholder="Buscar por username o correo (mín. 2 letras)"
                      aria-label="Buscar usuarios para invitar"
                      className="w-full bg-[#FAF7F7] text-sm text-[#2B2A28] placeholder-[#A3978E] border border-[#E5DFD7] focus:border-[#8C432A] rounded-lg pl-9 pr-3 py-2.5 outline-none transition-colors"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#6B5E55]">
                    <span className="sr-only">Rol del invitado</span>
                    <select
                      value={rol}
                      onChange={(e) => setRol(e.target.value as RolInvitacion)}
                      className="bg-[#FAF7F7] text-sm text-[#2B2A28] border border-[#E5DFD7] focus:border-[#8C432A] rounded-lg px-2.5 py-2.5 outline-none"
                    >
                      <option value="LECTOR">Lector</option>
                      <option value="EDITOR">Editor</option>
                    </select>
                  </label>
                </div>
                {resultados.length > 0 && (
                  <ul className="mt-2 border border-[#EDE6DD] rounded-lg overflow-hidden">
                    {resultados.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-[#FAF7F2]"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">
                            @{u.username}
                          </p>
                          <p className="text-[11px] text-[#7A6D63] truncate">
                            {u.persona.nombre} {u.persona.apellido} ·{" "}
                            {u.persona.gmail}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleAgregar(u.username)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#8C432A] hover:bg-[#783721] rounded-md"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Añadir
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
