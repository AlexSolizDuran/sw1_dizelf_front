"use client";

import React from "react";
import Link from "next/link";
import { SoftwarePreview } from "./software-preview";
import { useAuthStore } from "@/stores/use-auth-store";

export function HeroSection() {
  const { isAuthenticated } = useAuthStore();

  return (
    <section className="w-full py-12 md:py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
        {/* Contenido Izquierdo */}
        <div className="lg:col-span-6 space-y-6 text-left">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#6A3825] tracking-tight leading-[1.15]">
            Diseñar la casa de tus sueños nunca ha sido tan fácil
          </h1>

          <p className="text-base sm:text-lg text-[#6B5E55] leading-relaxed max-w-xl">
            DIZELF integra diseño 2D y vistas 3D, inteligencia artificial generativa y
            herramientas de estimación precisas para transformar tu visión en
            realidad.
          </p>

          <div className="pt-2">
            <Link
              href={isAuthenticated ? "/proyectos" : "/register"}
              className="inline-flex items-center justify-center px-8 py-3.5 bg-[#8C432A] hover:bg-[#783721] active:bg-[#682F1B] text-white text-base font-semibold rounded-lg shadow-sm transition-all duration-150 transform hover:-translate-y-0.5"
            >
              Comenzar
            </Link>
          </div>
        </div>

        {/* Maqueta / Preview Derecho */}
        <div className="lg:col-span-6 flex items-center justify-center">
          <SoftwarePreview />
        </div>
      </div>
    </section>
  );
}
