"use client";

import React, { useState } from "react";
import { Mic, Paperclip, Send } from "lucide-react";
import { useUiProyectosStore } from "@/stores/use-ui-proyectos-store";

interface IaCreationBarProps {
  onEnviarAsistido?: (prompt: string) => void;
}

/**
 * Barra IA del modelo Dashboard: input + adjuntar + voz + enviar.
 *
 * Cada control abre el mismo modal con una intención distinta: el texto lo
 * precarga, el clip dispara el selector de imagen y el micrófono deja el foco
 * en el prompt con el dictado listo.
 */
export function IaCreationBar({ onEnviarAsistido }: IaCreationBarProps) {
  const abrirCrear = useUiProyectosStore((s) => s.abrirCrear);
  const [valor, setValor] = useState("");

  const handleEnviar = () => {
    const limpio = valor.trim();
    if (onEnviarAsistido) onEnviarAsistido(limpio);
    else abrirCrear(limpio !== "" ? "prompt" : "normal");
    setValor("");
  };

  return (
    <section aria-label="Creación asistida por IA" className="mb-10">
      <div className="bg-white rounded-xl p-2 flex items-center border border-[#EDE6DD] focus-within:border-[#8C432A] transition-colors">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleEnviar();
          }}
          placeholder="Generar plano de casa de 2 pisos..."
          aria-label="Describe tu diseño para generarlo con IA"
          className="flex-grow bg-transparent border-none outline-none text-sm text-[#2B2A28] placeholder-[#A3978E] px-4 py-3"
        />
        <div className="flex items-center gap-1 pr-2 text-[#7C6E64]">
          <button
            type="button"
            aria-label="Adjuntar imagen"
            onClick={() => abrirCrear("imagen")}
            className="p-2 hover:bg-[#F2ECE3] rounded-full transition-colors"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Dictar por voz"
            onClick={() => abrirCrear("voz")}
            className="p-2 hover:bg-[#F2ECE3] rounded-full transition-colors"
          >
            <Mic className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Enviar a IA"
            onClick={handleEnviar}
            className="bg-[#8C432A] hover:bg-[#783721] text-white p-3 rounded-full transition-colors ml-2"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
