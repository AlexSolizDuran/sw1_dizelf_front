import React from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroSection } from "@/components/features/home/hero-section";
import { Capabilities } from "@/components/features/home/capabilities";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2B2A28]">
      {/* Barra de Navegación con estado de usuario y opción de Cerrar Sesión (HU 3) */}
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-start">
        {/* Sección Hero con texto, botón Comenzar y Maqueta de Software */}
        <HeroSection />

        {/* Sección Nuestras Capacidades (Diseño 2D/3D, IA Generativa, Estimación de Costos) */}
        <Capabilities />
      </main>

      {/* Pie de Página */}
      <Footer />
    </div>
  );
}
