import React from "react";
import { Compass, Sparkles, Calculator } from "lucide-react";

export function Capabilities() {
  const capabilities = [
    {
      title: "Diseño 2D/3D",
      description:
        "Creación de modelos detallados y planos técnicos con precisión milimétrica. Interfaces intuitivas para visualizar espacios complejos.",
      icon: <Compass className="w-5 h-5 text-[#8C432A]" />,
    },
    {
      title: "IA Generativa",
      description:
        "Interacción natural mediante voz, texto o análisis de fotos. Automatiza tareas creativas y genera variaciones de diseño al instante.",
      icon: <Sparkles className="w-5 h-5 text-[#8C432A]" />,
    },
    {
      title: "Estimación de Costos",
      description:
        "Cálculos precisos y dinámicos basados en materiales, tiempo y recursos. Optimiza tu presupuesto desde la fase de conceptualización.",
      icon: <Calculator className="w-5 h-5 text-[#8C432A]" />,
    },
  ];

  return (
    <section className="w-full py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Encabezado de la Sección */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#2B2A28]">
            Nuestras Capacidades
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#7A6C62]">
            Herramientas diseñadas para la precisión y la innovación.
          </p>
        </div>

        {/* Cuadrícula de 3 Tarjetas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {capabilities.map((item, idx) => (
            <div
              key={idx}
              className="bg-[#FAF7F2] rounded-2xl p-7 sm:p-8 border border-[#EDE6DD] hover:border-[#DFCFC3] hover:shadow-md transition-all duration-200 flex flex-col justify-start"
            >
              {/* Contenedor del Icono */}
              <div className="w-10 h-10 rounded-xl bg-[#F2E8E2] border border-[#E9DDD5] flex items-center justify-center mb-6">
                {item.icon}
              </div>

              {/* Título de la Tarjeta */}
              <h3 className="text-lg font-bold text-[#2B2A28] mb-3">
                {item.title}
              </h3>

              {/* Descripción */}
              <p className="text-xs sm:text-sm text-[#6E6157] leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
