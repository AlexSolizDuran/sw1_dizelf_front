"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Plus, FolderKanban } from "lucide-react";
import { useAuthStore } from "@/stores/use-auth-store";

export default function ProyectosPage() {
  const router = useRouter();
  const { user, isAuthenticated, isInitialized } = useAuthStore();

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.push("/login");
    }
  }, [isInitialized, isAuthenticated, router]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2B2A28]">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-[#ECE5DD]">
          <div>
            <h1 className="text-3xl font-extrabold text-[#6A3825]">
              Mis Proyectos
            </h1>
            <p className="mt-1 text-sm text-[#7A6D63]">
              {user
                ? `Bienvenido, ${user.persona?.nombre || user.username}. Administra tus diagramas y diseños.`
                : "Cargando tus proyectos..."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => alert("El editor de diagramas (GoJS + Yjs) se integrará en el siguiente módulo.")}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#8C432A] hover:bg-[#783721] text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Diagrama</span>
          </button>
        </div>

        {/* Estado Vacío de Proyectos */}
        <div className="mt-16 flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-[#EDE6DD] shadow-sm max-w-xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-[#F5ECE8] border border-[#E9DDD5] flex items-center justify-center text-[#8C432A] mb-5">
            <FolderKanban className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-[#2B2A28]">
            No tienes proyectos aún
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-[#7A6D63] max-w-sm">
            Comienza a diseñar tu primer diagrama de clases UML o esquema de base de datos colaborativo en tiempo real.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link
              href="/"
              className="px-4 py-2 border border-[#DDD5CB] text-[#5A4E46] text-xs font-medium rounded-md hover:bg-[#F9F7F5]"
            >
              Volver al Inicio
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
