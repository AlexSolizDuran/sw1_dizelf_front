"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DictationButton } from "@/components/ia/dictation-button";
import { useProyectosStore } from "@/stores/use-proyectos-store";
import { insertarDictado } from "@/lib/ia/stt";
import {
  cargarPerfilesProyecto,
  comprimirImagen,
  ErrorPlan,
  guardarPlanEnEspera,
  solicitarPlanProyecto,
  type PerfilProyectoInfo,
} from "@/lib/ia/proyecto/cliente";

export type ModoAperturaCrear = "normal" | "prompt" | "imagen" | "voz";

interface CrearProyectoModalProps {
  open: boolean;
  onClose: () => void;
  promptInicial?: string;
  modoInicial?: ModoAperturaCrear;
}

type Tab = "vacio" | "asistido";

const MENSAJES_GENERACION = [
  "Analizando el pedido…",
  "Distribuyendo ambientes…",
  "Creando el plano…",
];

/**
 * Modal "Crear proyecto / Nuevo diseño".
 *
 * Dos caminos: proyecto vacío o generación asistida. La generación asistida
 * pide el plano a `/api/ia/proyecto` y **solo crea el proyecto si el plan
 * llegó válido**: si falla, el modal queda abierto para reintentar o crear uno
 * vacío. El plano viaja al editor por `sessionStorage` y lo ejecuta el runner.
 */
export function CrearProyectoModal({
  open,
  onClose,
  promptInicial = "",
  modoInicial = "normal",
}: CrearProyectoModalProps) {
  const router = useRouter();
  const crear = useProyectosStore((s) => s.crear);

  const [tab, setTab] = useState<Tab>("vacio");
  const [nombre, setNombre] = useState("");
  const [prompt, setPrompt] = useState(promptInicial);
  const [imagen, setImagen] = useState<File | null>(null);
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [perfiles, setPerfiles] = useState<PerfilProyectoInfo[]>([]);
  const [perfil, setPerfil] = useState("equilibrado");
  const [cargandoPerfiles, setCargandoPerfiles] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mensajeGeneracion, setMensajeGeneracion] = useState(
    MENSAJES_GENERACION[0]
  );
  const [error, setError] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cursorRef = useRef(0);

  /* Al abrir: prompt inicial, pestaña correcta y perfil por defecto. */
  useEffect(() => {
    if (!open) return;
    setPrompt(promptInicial);
    setError(null);
    setProblemas([]);
    setTab(modoInicial !== "normal" || promptInicial.trim() !== "" ? "asistido" : "vacio");
  }, [open, promptInicial, modoInicial]);

  /* Cargar perfiles cada vez que se abre. */
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setCargandoPerfiles(true);
    cargarPerfilesProyecto()
      .then((respuesta) => {
        if (!vivo) return;
        setPerfiles(respuesta.perfiles);
        if (respuesta.perfiles.length > 0) {
          const existe = respuesta.perfiles.some(
            (item) => item.id === respuesta.defecto
          );
          setPerfil(existe ? respuesta.defecto : respuesta.perfiles[0].id);
        }
      })
      .catch(() => {
        if (vivo) setPerfiles([]);
      })
      .finally(() => {
        if (vivo) setCargandoPerfiles(false);
      });
    return () => {
      vivo = false;
    };
  }, [open]);

  /* Intención de apertura: imagen abre el selector; voz enfoca el prompt. */
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (modoInicial === "imagen") fileRef.current?.click();
      if (modoInicial === "voz" || modoInicial === "prompt") {
        textareaRef.current?.focus();
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [open, modoInicial]);

  /* Mensajes de progreso mientras el proveedor responde. */
  useEffect(() => {
    if (!isLoading) return;
    let indice = 0;
    setMensajeGeneracion(MENSAJES_GENERACION[0]);
    const timer = setInterval(() => {
      indice = Math.min(indice + 1, MENSAJES_GENERACION.length - 1);
      setMensajeGeneracion(MENSAJES_GENERACION[indice]);
    }, 2_500);
    return () => clearInterval(timer);
  }, [isLoading]);

  /* Liberar la vista previa al cambiar o desmontar. */
  useEffect(() => {
    return () => {
      if (imagenPreview) URL.revokeObjectURL(imagenPreview);
    };
  }, [imagenPreview]);

  function validarNombre(valor: string): string | null {
    const limpio = valor.trim();
    if (limpio.length < 3) return "El nombre debe tener al menos 3 caracteres.";
    if (limpio.length > 100) return "El nombre no puede superar 100 caracteres.";
    return null;
  }

  function limpiarImagen() {
    if (imagenPreview) URL.revokeObjectURL(imagenPreview);
    setImagenPreview(null);
    setImagen(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function cerrar() {
    if (isLoading) return;
    setNombre("");
    setPrompt("");
    setError(null);
    setProblemas([]);
    limpiarImagen();
    onClose();
  }

  async function handleCrearVacio() {
    const errorNombre = validarNombre(nombre);
    if (errorNombre) {
      setError(errorNombre);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const id = await crear({ nombre: nombre.trim() });
      setNombre("");
      limpiarImagen();
      onClose();
      router.push(`/editor/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el proyecto.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerar() {
    const errorNombre = validarNombre(nombre);
    if (errorNombre) {
      setError(errorNombre);
      return;
    }
    if (prompt.trim() === "" && imagen === null) {
      setError("Escribí una descripción o adjuntá una imagen para generar el diseño.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setProblemas([]);
    try {
      const generado = await solicitarPlanProyecto({
        prompt: prompt.trim(),
        perfil,
        imagen,
      });

      // Recién acá se crea el proyecto: si el plan falla, no queda basura.
      const id = await crear({ nombre: nombre.trim() });

      guardarPlanEnEspera(id, {
        plan: generado.plan,
        prompt: prompt.trim(),
        perfil: generado.perfil,
        modelo: generado.modelo,
      });

      setNombre("");
      setPrompt("");
      limpiarImagen();
      onClose();
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
      setIsLoading(false);
    }
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
        setImagenPreview(URL.createObjectURL(comprimida));
      })
      .catch(() => {
        setError("No se pudo procesar la imagen. Probá con otra.");
      })
      .finally(() => setComprimiendo(false));
  }

  function onDictado(texto: string) {
    const cursor = textareaRef.current?.selectionStart ?? cursorRef.current;
    const resultado = insertarDictado(prompt, texto, cursor);
    setPrompt(resultado.texto);
    cursorRef.current = resultado.cursor;
    requestAnimationFrame(() => {
      const area = textareaRef.current;
      if (!area) return;
      area.focus();
      area.setSelectionRange(resultado.cursor, resultado.cursor);
    });
  }

  const tabBtn = (activo: boolean) =>
    `px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
      activo ? "bg-[#8C432A] text-white" : "text-[#5A4E46] hover:bg-[#F2ECE3]"
    }`;

  const perfilActual = perfiles.find((item) => item.id === perfil);
  const deshabilitado =
    isLoading ||
    comprimiendo ||
    (prompt.trim() === "" && imagen === null);

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title="Nuevo diseño"
      subtitle="Creá un proyecto vacío o generá un plano completo con IA a partir de texto, una imagen o ambos."
      maxWidth="max-w-xl"
    >
      <div className="flex gap-2 p-1 bg-[#FAF7F2] border border-[#EDE6DD] rounded-lg">
        <button
          type="button"
          onClick={() => setTab("vacio")}
          className={tabBtn(tab === "vacio")}
          disabled={isLoading}
        >
          Proyecto vacío
        </button>
        <button
          type="button"
          onClick={() => setTab("asistido")}
          className={tabBtn(tab === "asistido")}
          disabled={isLoading}
        >
          Asistido por IA
        </button>
      </div>

      <div className="mt-4">
        <Input
          label="Nombre del proyecto"
          placeholder="Ej. Casa de un piso"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={100}
          disabled={isLoading}
        />
      </div>

      {tab === "vacio" && (
        <div className="mt-4">
          <p className="text-xs text-[#7A6D63]">
            Se crea al instante con la escena inicial y podés empezar a
            diagramar.
          </p>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={cerrar}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void handleCrearVacio()}
              isLoading={isLoading}
            >
              Crear proyecto
            </Button>
          </div>
        </div>
      )}

      {tab === "asistido" && (
        <div className="mt-4">
          <label
            htmlFor="prompt-ia"
            className="text-xs font-medium text-[#6B5E55]"
          >
            Describe tu diseño
          </label>
          <textarea
            ref={textareaRef}
            id="prompt-ia"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onSelect={(e) =>
              (cursorRef.current = e.currentTarget.selectionStart)
            }
            rows={4}
            maxLength={4000}
            disabled={isLoading}
            placeholder="Casa con 3 dormitorios, cocina integrada y patio. O adjuntá una imagen del croquis."
            className="mt-1.5 w-full bg-[#FAF7F7] text-sm text-[#2B2A28] placeholder-[#A3978E] border border-[#E5DFD7] focus:border-[#8C432A] rounded-lg p-3 outline-none transition-colors disabled:opacity-60"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DictationButton
              onTexto={onDictado}
              disabled={isLoading}
              title="Dictar el prompt por voz"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={isLoading || comprimiendo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#EDE6DD] rounded-md text-[#5A4E46] hover:bg-[#FAF7F2] disabled:opacity-50"
            >
              {comprimiendo ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ImagePlus className="w-3.5 h-3.5" />
              )}
              {comprimiendo ? "Comprimiendo…" : "Adjuntar imagen"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onArchivo}
            />
            <span className="text-[11px] text-[#8D8077]">
              La voz se transcribe al prompt.
            </span>
          </div>

          {imagenPreview && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-[#EDE6DD] bg-[#FAF7F2] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagenPreview}
                alt="Imagen adjunta"
                className="h-16 w-16 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[#4A3E38]">
                  {imagen?.name ?? "Imagen adjunta"}
                </p>
                <p className="text-[11px] text-[#8D8077]">
                  {imagen ? `${Math.round(imagen.size / 1024)} KB` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={limpiarImagen}
                disabled={isLoading}
                aria-label="Quitar imagen"
                className="rounded-full p-1.5 text-[#7C6E64] hover:bg-[#F2ECE3]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="mt-4">
            <label
              htmlFor="perfil-ia"
              className="text-xs font-medium text-[#6B5E55]"
            >
              Perfil de modelo
            </label>
            <select
              id="perfil-ia"
              value={perfil}
              onChange={(e) => setPerfil(e.target.value)}
              disabled={isLoading || cargandoPerfiles}
              className="mt-1.5 w-full rounded-lg border border-[#E5DFD7] bg-white px-3 py-2 text-sm text-[#2B2A28] outline-none focus:border-[#8C432A] disabled:opacity-60"
            >
              {(perfiles.length > 0
                ? perfiles
                : [
                    {
                      id: "equilibrado",
                      nombre: "Equilibrado",
                      descripcion: "",
                      modelo: "",
                      soportaImagen: true,
                      precioEntradaUsdMillon: null,
                      precioSalidaUsdMillon: null,
                    },
                  ]
              ).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                  {item.precioEntradaUsdMillon !== null
                    ? ` · USD ${item.precioEntradaUsdMillon.toFixed(2)}/M entrada`
                    : ""}
                </option>
              ))}
            </select>
            {perfilActual && (
              <p className="mt-1 text-[11px] text-[#8D8077]">
                {perfilActual.descripcion}
              </p>
            )}
          </div>

          <p className="mt-3 rounded-lg border border-[#EDE6DD] bg-[#FAF7F2] px-3 py-2 text-[11px] text-[#7A6D63]">
            V1 genera ambientes rectangulares: hasta 8 por nivel y 3 niveles.
            Después podés editar cualquier pared, puerta o ventana.
          </p>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-red-700">
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </p>
              {problemas.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-[11px] text-red-700">
                  {problemas.slice(0, 5).map((problema, indice) => (
                    <li key={`${indice}-${problema}`}>{problema}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cerrar}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void handleGenerar()}
              isLoading={isLoading}
              disabled={deshabilitado && !isLoading}
              icon={isLoading ? undefined : <Sparkles className="w-4 h-4" />}
            >
              Generar diseño
            </Button>
          </div>

          {isLoading && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#7A6D63]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {mensajeGeneracion} No cierres esta ventana.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
