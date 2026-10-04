import React from "react";

export function SoftwarePreview() {
  return (
    <div className="w-full relative flex items-center justify-center">
      {/* Marco de Ventana de la Aplicación */}
      <div className="w-full max-w-xl bg-white rounded-xl shadow-[0_20px_50px_rgba(106,56,37,0.08)] border border-[#EAE3DA] overflow-hidden">
        {/* Barra Superior de la Aplicación */}
        <div className="bg-[#FAF8F5] border-b border-[#ECE5DD] px-4 py-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E57A60]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#E5BA60]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#87C268]" />
            <span className="ml-2 font-bold text-[#6A3825]">NullSoft</span>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-[11px] text-[#7A6D63]">
            <span>Products</span>
            <span>Solutions</span>
            <span>Pricing</span>
            <span>Resources</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#7A6D63]">Log In</span>
            <span className="px-2.5 py-1 text-[11px] bg-[#8C432A] text-white rounded font-medium">
              Get Started
            </span>
          </div>
        </div>

        {/* Contenido Principal de la Maqueta */}
        <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-gradient-to-br from-white to-[#FDFBF7]">
          {/* Lado Izquierdo del Preview */}
          <div className="space-y-3">
            <h3 className="text-xl sm:text-2xl font-bold text-[#2B2A28] leading-tight">
              Precision in Architecture & Software.
            </h3>
            <p className="text-xs text-[#7A6D63] leading-relaxed">
              Modern, scalable solutions built for the future of digital design.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <span className="px-3 py-1.5 text-xs bg-[#8C432A] text-white rounded font-medium shadow-sm">
                Get Started
              </span>
              <span className="px-3 py-1.5 text-xs border border-[#DDD5CB] text-[#5A4E46] rounded hover:bg-[#F8F5F0]">
                Learn More
              </span>
            </div>
          </div>

          {/* Lado Derecho: Arte Gráfico 3D Arquitectónico de Capas */}
          <div className="relative h-48 sm:h-56 flex items-center justify-center">
            <svg
              viewBox="0 0 240 220"
              className="w-full h-full drop-shadow-md"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Capa Base Sombreada */}
              <polygon
                points="120,40 200,90 120,140 40,90"
                fill="#E8DDD3"
                opacity="0.8"
              />
              {/* Planos 3D Escalonados (Estética Arquitectónica) */}
              <polygon
                points="130,20 210,70 150,110 70,60"
                fill="#C9886D"
                opacity="0.65"
              />
              <polygon
                points="110,60 190,110 130,150 50,100"
                fill="#A6543A"
                opacity="0.75"
              />
              <polygon
                points="100,80 170,125 110,165 40,120"
                fill="#D89A80"
                opacity="0.5"
              />
              {/* Capa Traslúcida Central */}
              <polygon
                points="125,50 185,90 135,125 75,85"
                fill="#FAF0E8"
                opacity="0.85"
              />
              {/* Líneas Estructurales de Diagrama y Planos */}
              <line x1="120" y1="40" x2="120" y2="170" stroke="#8C432A" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
              <line x1="40" y1="90" x2="200" y2="90" stroke="#8C432A" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
              <circle cx="120" cy="140" r="4" fill="#8C432A" />
              <circle cx="200" cy="90" r="3" fill="#A6543A" />
              <circle cx="40" cy="90" r="3" fill="#C9886D" />
            </svg>
          </div>
        </div>

        {/* Pie de Página de la Maqueta */}
        <div className="bg-[#FAF8F5] border-t border-[#ECE5DD] px-4 py-2 flex items-center justify-between text-[10px] text-[#A89C93]">
          <span>Search...</span>
          <span>© 2026 NullSoft / DIZELF</span>
        </div>
      </div>
    </div>
  );
}
