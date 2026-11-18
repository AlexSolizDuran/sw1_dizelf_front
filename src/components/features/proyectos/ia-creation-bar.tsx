"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Mic, Send, Square, X } from "lucide-react";
import { useDictadoVoz } from "@/hooks/use-dictado-voz";
import { insertarDictado } from "@/lib/ia/stt";
import {
  comprimirImagen,
  ErrorPlan,
  guardarPlanEnEspera,
  solicitarPlanProyecto,
} from "@/lib/ia/proyecto/cliente";
import { tituloProyectoUnico } from "@/lib/ia/proyecto/nombre";
import { apiListarNombresProyectos } from "@/lib/projects";
import { useProyectosStore } from "@/stores/use-proyectos-store";

const MENSAJES_GENERACION = [
  "Analizando el pedido…",
  "Distribuyendo ambientes…",
  "Creando el plano…",
];

/**
 * Barra IA del dashboard: input + imagen + dictado + enviar.
 *
 * Es un flujo completo y no un acceso al modal: al enviar pide el plan a la
 * API, crea el proyecto con un título automático (sin repetir los del usuario)
 * y navega al editor, donde el runner ejecuta el plano. La imagen y el dictado
 * viven en la propia barra.
 */
export function IaCreationBar() {
  const router = useRouter();
  const crear = useProyectosStore((s) => s.crear);
  const proyectos = useProyectosStore((s) => s.proyectos);

  const [valor, setValor] = useState("");
  const [imagen, setImagen] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState(MENSAJES_GENERACION[0]);
  const [error, setError] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const valorRef = useRef("");
  const cursorRef = useRef(0);

  /* El dictado se inserta en el cursor, igual que en el modal. */
  const onTexto = useCallback((texto: string) => {
    const cursor = inputRef.current?.selectionStart ?? cursorRef.current;
    const resultado = insertarDictado(valorRef.current, texto, cursor);
    valorRef.current = resultado.texto;
    cursorRef.current = resultado.cursor;
    setValor(resultado.texto);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(resultado.cursor, resultado.cursor);
    });
  }, []);

  const {
    grabando,
    transcribiendo,
    solicitando,
    error: errorVoz,
    alternar,
    limpiarError,
  } = useDictadoVoz({ onTexto });

  useEffect(() => {
    if (errorVoz === null) return;
    const timer = setTimeout(() => limpiarError(), 7000);
    return () => clearTimeout(timer);
  }, [errorVoz, limpiarError]);

  /* La vista previa se libera al cambiarla o al desmontar. */
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  /* Mensajes de progreso mientras el proveedor responde. */
  useEffect(() => {
    if (!enviando) return;
    let indice = 0;
    setMensaje(MENSAJES_GENERACION[0]);
    const timer = setInterval(() => {
      indice = Math.min(indice + 1, MENSAJES_GENERACION.length - 1);
      setMensaje(MENSAJES_GENERACION[indice]);
    }, 2_500);
    return () => clearInterval(timer);
  }, [enviando]);

  function limpiarImagen() {
    setImagen(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    setError(null);

    if (!archivo.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen JPEG, PNG o WebP.");
      return;
    }

    setComprimiendo(true);
    void comprimirImagen(archivo)
      .then((comprimida) => {
        limpiarImagen();
        setImagen(comprimida);
        setPreview(URL.createObjectURL(comprimida));
      })
      .catch(() => {
        setError("No se pudo procesar la imagen. Probá con otra.");
      })
      .finally(() => setComprimiendo(false));
  }

  const sinContenido = valor.trim() === "" && imagen === null;
  const ocupado =
    enviando || comprimiendo || grabando || transcribiendo || solicitando;
  const puedeEnviar = !sinContenido && !ocupado;

  async function enviar() {
    if (!puedeEnviar) return;
    const texto = valor.trim();
    setEnviando(true);
    setError(null);
    setProblemas([]);

    try {
      // Los títulos se piden en paralelo con el plan: no suman latencia.
      const nombres = apiListarNombresProyectos().catch(() =>
        proyectos.map((proyecto) => proyecto.nombre)
      );

      const generado = await solicitarPlanProyecto({ prompt: texto, imagen });

      // Recién con el plan válido se crea el proyecto.
      const titulo = tituloProyectoUnico(
        generado.plan.nombreSugerido,
        await nombres
      );
      const id = await crear({ nombre: titulo });

      guardarPlanEnEspera(id, {
        plan: generado.plan,
        prompt: texto,
        perfil: generado.perfil,
        modelo: generado.modelo,
      });

      valorRef.current = "";
      cursorRef.current = 0;
      setValor("");
      limpiarImagen();
      router.push(`/editor/${id}`);
    } catch (e) {
      if (e instanceof ErrorPlan) {
        setError(e.message);
        setProblemas(e.problemas);
      } else {
        setError(
          e instanceof Error ? e.message : "No se pudo generar el diseño."
        );
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-label="Creación asistida por IA" className="mb-10">
      <div className="bg-white rounded-xl p-2 flex items-center border border-[#EDE6DD] focus-within:border-[#8C432A] transition-colors">
        {preview && (
          <div className="relative ml-1 mr-2 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Imagen adjunta"
              className="h-10 w-10 rounded-md border border-[#EDE6DD] object-cover"
            />
            <button
              type="button"
              onClick={limpiarImagen}
              disabled={enviando}
              aria-label="Quitar imagen"
              className="absolute -right-1.5 -top-1.5 rounded-full bg-[#2B2A28] p-0.5 text-white transition-colors hover:bg-[#5A4E46] disabled:opacity-50"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          value={valor}
          onChange={(e) => {
            valorRef.current = e.target.value;
            setValor(e.target.value);
            if (error) setError(null);
          }}
          onSelect={(e) =>
            (cursorRef.current =
              e.currentTarget.selectionStart ?? cursorRef.current)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void enviar();
            }
          }}
          disabled={enviando}
          placeholder="Describí tu casa o adjuntá una foto del plano..."
          aria-label="Describe tu diseño para generarlo con IA"
          className="min-w-0 flex-grow bg-transparent border-none outline-none text-sm text-[#2B2A28] placeholder-[#A3978E] px-4 py-3 disabled:opacity-60"
        />

        <div className="flex shrink-0 items-center gap-1 pr-2 text-[#7C6E64]">
          <button
            type="button"
            aria-label="Adjuntar imagen"
            title="Adjuntar imagen"
            onClick={() => fileRef.current?.click()}
            disabled={enviando || comprimiendo}
            className="p-2 hover:bg-[#F2ECE3] rounded-full transition-colors disabled:opacity-50"
          >
            {comprimiendo ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ImagePlus className="w-5 h-5" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onArchivo}
          />

          <button
            type="button"
            aria-label={
              grabando
                ? "Detener y transcribir"
                : transcribiendo
                  ? "Transcribiendo…"
                  : solicitando
                    ? "Pidiendo micrófono…"
                    : "Dictar por voz"
            }
            title="Dictar por voz"
            onClick={alternar}
            disabled={enviando || transcribiendo || solicitando}
            className={`p-2 rounded-full transition-colors disabled:opacity-50 ${
              grabando
                ? "bg-[#8C432A] text-white hover:bg-[#783721]"
                : "hover:bg-[#F2ECE3]"
            }`}
          >
            {solicitando || transcribiendo ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : grabando ? (
              <Square className="w-4 h-4" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          <button
            type="button"
            aria-label="Generar el plano con IA"
            title={
              sinContenido
                ? "Escribí una descripción o adjuntá una imagen"
                : "Generar el plano"
            }
            onClick={() => void enviar()}
            disabled={!puedeEnviar}
            className="bg-[#8C432A] hover:bg-[#783721] text-white p-3 rounded-full transition-colors ml-2 disabled:bg-[#C9B6AA] disabled:hover:bg-[#C9B6AA] disabled:cursor-not-allowed"
          >
            {enviando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {grabando && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#8C432A]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8C432A]" />
          Grabando… tocá el micrófono para detener y transcribir.
        </p>
      )}

      {enviando && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#7A6D63]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {mensaje} No cierres esta pestaña.
        </p>
      )}

      {(error || errorVoz) && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs font-medium text-red-700">
            {error ?? errorVoz}
          </p>
          {problemas.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[11px] text-red-700">
              {problemas.slice(0, 3).map((problema, indice) => (
                <li key={`${indice}-${problema}`}>{problema}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
