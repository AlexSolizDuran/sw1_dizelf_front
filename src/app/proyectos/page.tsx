"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Plus, FolderKanban, Trash2, Loader2, ArrowRight, Users } from "lucide-react";
import { useAuthStore } from "@/stores/use-auth-store";
import { apiCrearProyecto, apiEliminarProyecto, apiListarProyectos } from "@/lib/projects";
import type { ProyectoLista } from "@/types/proyecto";

export default function ProyectosPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  const [proyectos, setProyectos] = useState<ProyectoLista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.push("/login");
    }
  }, [isInitialized, isAuthenticated, router]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiListarProyectos(1, 50);
      setProyectos(res.datos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los proyectos");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void cargar();
  }, [isAuthenticated, cargar]);

  const crear = async () => {
    setCreando(true);
    setError(null);
    try {
      const nombre = window.prompt("Nombre del proyecto", "Mi proyecto");
      if (!nombre) {
        setCreando(false);
        return;
      }
      const proyecto = await apiCrearProyecto({ nombre });
      router.push(`/editor/${proyecto.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el proyecto");
      setCreando(false);
    }
  };

  const eliminar = async (proyecto: ProyectoLista) => {
    if (!window.confirm(`¿Eliminar “${proyecto.nombre}”? No se puede deshacer.`)) return;
    try {
      await apiEliminarProyecto(proyecto.id);
      setProyectos((prev) => prev.filter((p) => p.id !== proyecto.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2B2A28]">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-[#ECE5DD]">
          <div>
            <h1 className="text-3xl font-extrabold text-[#6A3825]">Mis Proyectos</h1>
            <p className="mt-1 text-sm text-[#7A6D63]">
              {user
                ? `Bienvenido, ${user.persona?.nombre || user.username}. Diseñá tus planos en 2D y 3D.`
                : "Cargando tus proyectos..."}
            </p>
          </div>

          <button
            type="button"
            onClick={crear}
            disabled={creando}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#8C432A] hover:bg-[#783721] disabled:opacity-60 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            {creando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>Nuevo Proyecto</span>
          </button>
        </div>

        {error && (
          <p className="mt-6 border border-[#E9DDD5] bg-[#F5ECE8] px-4 py-3 text-xs text-[#8C432A]">
            {error}
          </p>
        )}

        {cargando ? (
          <div className="mt-16 flex items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[#8C432A]" />
            <p className="text-xs text-[#7A6D63]">Cargando proyectos…</p>
          </div>
        ) : proyectos.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-[#EDE6DD] shadow-sm max-w-xl mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-[#F5ECE8] border border-[#E9DDD5] flex items-center justify-center text-[#8C432A] mb-5">
              <FolderKanban className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-[#2B2A28]">No tienes proyectos aún</h2>
            <p className="mt-2 text-xs sm:text-sm text-[#7A6D63] max-w-sm">
              Creá tu primer plano para abrir el editor 2D/3D.
            </p>
            <button
              type="button"
              onClick={crear}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-[#8C432A] hover:bg-[#783721] text-white text-xs font-semibold rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Proyecto</span>
            </button>
          </div>
        ) : (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {proyectos.map((proyecto) => (
              <li key={proyecto.id}>
                <div className="group flex items-center gap-3 rounded-xl border border-[#EDE6DD] bg-white p-4 hover:border-[#E0D3C7]">
                  <Link
                    href={`/editor/${proyecto.id}`}
                    className="min-w-0 flex-1"
                  >
                    <span className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 shrink-0 text-[#8C432A]" />
                      <span className="truncate text-sm font-semibold text-[#2B2A28]">
                        {proyecto.nombre}
                      </span>
                    </span>
                    <span className="mt-2 flex items-center gap-3 text-[11px] text-[#7A6D63]">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {proyecto.totalColaboradores + 1}
                      </span>
                      <span className="rounded bg-[#F2E8E2] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]">
                        {proyecto.miRol === "CREADOR" ? "Creador" : "Invitado"}
                      </span>
                    </span>
                  </Link>

                  <div className="flex shrink-0 items-center gap-1">
                    {proyecto.miRol === "CREADOR" && (
                      <button
                        aria-label={`Eliminar ${proyecto.nombre}`}
                        onClick={() => eliminar(proyecto)}
                        className="p-1.5 text-[#6B5E55] hover:bg-[#F5ECE8] hover:text-[#B3261E]"
                        title="Eliminar"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <Link
                      aria-label={`Abrir ${proyecto.nombre}`}
                      href={`/editor/${proyecto.id}`}
                      className="p-1.5 text-[#6B5E55] hover:bg-[#F2E8E2] hover:text-[#8C432A]"
                      title="Abrir en el editor"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
}
