"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Mic, Sparkles, Square } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProyectosStore } from "@/stores/use-proyectos-store";
import { construirDocumentoAsistidoIA } from "@/lib/ia-proyecto";

interface CrearProyectoModalProps {
  open: boolean;
  onClose: () => void;
  promptInicial?: string;
}

type Tab = "vacio" | "asistido";
type SubTab = "prompt" | "voz" | "imagen";

/**
 * Modal "Crear proyecto / Nuevo diseño": proyecto vacío directo
 * o asistido por IA (prompt, voz, imagen). El asistido crea el proyecto
 * con esquemaJson marcado pendiente-IA (ver lib/ia.ts).
 */
export function CrearProyectoModal({
  open,
  onClose,
  promptInicial = "",
}: CrearProyectoModalProps) {
  const router = useRouter();
  const crear = useProyectosStore((s) => s.crear);
  const [tab, setTab] = useState<Tab>("vacio");
  const [sub, setSub] = useState<SubTab>("prompt");
  const [nombre, setNombre] = useState("");
  const [prompt, setPrompt] = useState(promptInicial);
  const [imagenNombre, setImagenNombre] = useState<string>("");
  const [grabando, setGrabando] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (open) {
      setPrompt(promptInicial);
      setError(null);
      if (promptInicial.trim()) setTab("asistido");
    }
  }, [open, promptInicial]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignorar limpieza de voz
      }
    };
  }, []);

  function validarNombre(v: string): string | null {
    const t = v.trim();
    if (t.length < 3) return "El nombre debe tener al menos 3 caracteres.";
    if (t.length > 100) return "El nombre no puede superar 100 caracteres.";
    return null;
  }

  async function handleCrearVacio() {
    const msg = validarNombre(nombre);
    if (msg) {
      setError(msg);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // Sin `esquemaJson`: `apiCrearProyecto` manda la escena por defecto.
      const id = await crear({ nombre: nombre.trim() });
      onClose();
      setNombre("");
      router.push(`/editor/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el proyecto.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCrearAsistido() {
    const msgNombre = validarNombre(nombre);
    if (msgNombre) {
      setError(msgNombre);
      return;
    }
    if (!prompt.trim()) {
      setError("Describe tu diseño para la generación asistida.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const id = await crear({
        nombre: nombre.trim(),
        esquemaJson: construirDocumentoAsistidoIA({
          modo: sub,
          prompt: prompt.trim(),
          ...(imagenNombre ? { imagenNombre } : {}),
        }),
      });
      onClose();
      setNombre("");
      setPrompt("");
      router.push(`/editor/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el proyecto.");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleVoz() {
    if (grabando) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // noop
      }
      setGrabando(false);
      return;
    }
    const SR =
      (window as unknown as {
        SpeechRecognition?: new () => {
          lang: string;
          onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        };
        webkitSpeechRecognition?: new () => {
          lang: string;
          onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        };
      }).SpeechRecognition ??
      (window as unknown as {
        webkitSpeechRecognition?: new () => {
          lang: string;
          onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        };
      }).webkitSpeechRecognition;
    if (!SR) {
      setError("Tu navegador no soporta dictado por voz. Escribe el prompt.");
      return;
    }
    const rec = new SR();
    rec.lang = "es-ES";
    rec.onresult = (ev) => {
      const texto = Array.from(ev.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ");
      setPrompt((p) => (p ? `${p} ${texto}` : texto));
    };
    rec.onend = () => setGrabando(false);
    recognitionRef.current = rec;
    rec.start();
    setGrabando(true);
  }

  const tabBtn = (activo: boolean) =>
    `px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
      activo
        ? "bg-[#8C432A] text-white"
        : "text-[#5A4E46] hover:bg-[#F2ECE3]"
    }`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo diseño"
      subtitle="Crea un proyecto vacío o con ayuda de IA (prompt, voz o imagen)."
      maxWidth="max-w-xl"
    >
      <div className="flex gap-2 p-1 bg-[#FAF7F2] border border-[#EDE6DD] rounded-lg">
        <button
          type="button"
          onClick={() => setTab("vacio")}
          className={tabBtn(tab === "vacio")}
        >
          Proyecto vacío
        </button>
        <button
          type="button"
          onClick={() => setTab("asistido")}
          className={tabBtn(tab === "asistido")}
        >
          Asistido por IA
        </button>
      </div>

      <div className="mt-4">
        <Input
          label="Nombre del proyecto"
          placeholder="Ej. Casa de 2 pisos"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={100}
        />
      </div>

      {tab === "vacio" && (
        <div className="mt-4">
          <p className="text-xs text-[#7A6D63]">
            Se crea al instante con la escena inicial y puedes empezar a
            diagramar.
          </p>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void handleCrearVacio()} isLoading={isLoading}>
              Crear proyecto
            </Button>
          </div>
        </div>
      )}

      {tab === "asistido" && (
        <div className="mt-4">
          <div className="flex gap-2">
            {(["prompt", "voz", "imagen"] as SubTab[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSub(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  sub === m
                    ? "bg-[#F5ECE8] border-[#DFCFC3] text-[#8C432A]"
                    : "border-[#EDE6DD] text-[#7A6D63] hover:bg-[#FAF7F2]"
                }`}
              >
                {m === "prompt" ? "Prompt" : m === "voz" ? "Voz" : "Imagen"}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-lg border border-[#EDE6DD] bg-[#FAF7F2] px-3 py-2 text-[11px] text-[#7A6D63]">
            La generación con IA todavía no está conectada: el proyecto se crea
            con la escena inicial y tu descripción queda guardada para cuando el
            backend la exponga.
          </div>

          <div className="mt-3">
            <label
              htmlFor="prompt-ia"
              className="text-xs font-medium text-[#6B5E55]"
            >
              Describe tu diseño
            </label>
            <textarea
              id="prompt-ia"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Generar plano de casa de 2 pisos con 3 dormitorios..."
              className="mt-1.5 w-full bg-[#FAF7F7] text-sm text-[#2B2A28] placeholder-[#A3978E] border border-[#E5DFD7] focus:border-[#8C432A] rounded-lg p-3 outline-none transition-colors"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleVoz}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#EDE6DD] rounded-md text-[#5A4E46] hover:bg-[#FAF7F2]"
              >
                {grabando ? (
                  <Square className="w-3.5 h-3.5" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
                {grabando ? "Detener dictado" : "Dictar por voz"}
              </button>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#EDE6DD] rounded-md text-[#5A4E46] hover:bg-[#FAF7F2] cursor-pointer">
                <ImagePlus className="w-3.5 h-3.5" />
                {imagenNombre || "Subir imagen"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    setImagenNombre(e.target.files?.[0]?.name ?? "")
                  }
                />
              </label>
            </div>
          </div>

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void handleCrearAsistido()}
              isLoading={isLoading}
              icon={
                isLoading ? undefined : <Sparkles className="w-4 h-4" />
              }
            >
              Generar diseño
            </Button>
          </div>
          {isLoading && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#7A6D63]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creando proyecto...
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
