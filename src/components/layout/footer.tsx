import React from "react";

export function Footer() {
  return (
    <footer className="w-full bg-[#FAF7F2] border-t border-[#EFEAE2] py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-xs text-[#8C7D73]">
          © {new Date().getFullYear()} DIZELF. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
