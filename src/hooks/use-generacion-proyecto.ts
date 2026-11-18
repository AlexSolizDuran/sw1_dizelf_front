"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useViewer } from "@pascal-app/viewer";
import { executeTool } from "@/lib/ia/executor";
import type { ToolContext, ToolResult } from "@/lib/ia/tool-types";
import { ALTURA_POR_DEFECTO } from "@/lib/ia/proyecto/esquema";
import {
  tomarPlanEnEspera,
  type PlanEnEspera,
} from "@/lib/ia/proyecto/cliente";

/**
 * Ejecutor del plan generado en el modal.
 *
 * El modelo devolvió una distribución; acá se convierte en escena con las
 * tools existentes. Se espera a que el editor esté realmente listo (registro,
 * loader y sincronización) porque `sync:inicial` reemplaza la escena: escribir
 * antes de eso perdería el plano.
 */

export type FaseGeneracion =
  | "inactivo"
  | "preparando"
  | "creando"
  | "validando"
  | "listo"
  | "error";

interface NivelResumen {
  id: string;
  level: number;
  buildingId?: string | null;
}

interface ResultadoCreateRooms {
  levelId: string;
  rooms: Array<{ roomId: string | null; name: string }>;
}

interface ResultadoValidate {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  warnings: Array<{ code: string; message: string; nodeId?: string }>;
  errors: Array<{ code: string; message: string }>;
}

export interface EstadoGeneracion {
  fase: FaseGeneracion;
  mensaje: string;
  detalle: string[];
  cerrar: () => void;
}

function datosDe<T>(resultado: ToolResult): T | null {
  return resultado.ok ? (resultado.data as T) : null;
}

function mensajeDeError(resultado: ToolResult): string {
  return resultado.ok
    ? "Error desconocido."
    : `${resultado.error.code}: ${resultado.error.message}`;
}

function construirAmbientes(enEspera: PlanEnEspera, nivel: number) {
  const planNivel = enEspera.plan.niveles[nivel];
  if (!planNivel) return [];

  return planNivel.ambientes.map((ambiente) => {
    const altura = ambiente.altura ?? ALTURA_POR_DEFECTO;
    return {
      name: ambiente.nombre,
      polygon: ambiente.poligono,
      height: altura,
      createSlab: true,
      createCeiling: altura > 0,
      openings: (ambiente.aberturas ?? []).map((abertura) => ({
        kind: abertura.tipo === "puerta" ? ("door" as const) : ("window" as const),
        side: abertura.lado,
        ...(abertura.ancho !== undefined ? { width: abertura.ancho } : {}),
        ...(abertura.alto !== undefined ? { height: abertura.alto } : {}),
        ...(abertura.tipo === "ventana" ? {} : { sill: 0 }),
      })),
    };
  });
}

export function useGeneracionProyecto(input: {
  proyectoId: string;
  puedeEditar: boolean;
  listo: boolean;
}): EstadoGeneracion {
  const [fase, setFase] = useState<FaseGeneracion>("inactivo");
  const [mensaje, setMensaje] = useState("");
  const [detalle, setDetalle] = useState<string[]>([]);
  const iniciado = useRef(false);

  const cerrar = useCallback(() => {
    setFase("inactivo");
    setMensaje("");
    setDetalle([]);
  }, []);

  const ejecutar = useCallback(async () => {
    const enEspera = tomarPlanEnEspera(input.proyectoId);
    if (!enEspera) {
      setFase("inactivo");
      return;
    }

    // Contexto por llamada: el nivel activo puede cambiar entre tools.
    const ctx = (): ToolContext => ({
      proyectoId: input.proyectoId,
      puedeEditar: true,
      levelId: useViewer.getState().selection.levelId ?? null,
    });

    const avisos: string[] = [];
    try {
      setFase("preparando");
      setMensaje("Preparando el plano…");

      const resumen = await executeTool("get_scene_summary", {}, ctx());
      const datosResumen = datosDe<{ levels: NivelResumen[] }>(resumen);
      if (!datosResumen) {
        throw new Error(mensajeDeError(resumen));
      }

      const niveles = [...datosResumen.levels];
      const creados = new Map<string, { nombre: string; altura: number }>();

      for (const [indice, nivel] of enEspera.plan.niveles.entries()) {
        setFase("creando");
        setMensaje(
          `Creando ${nivel.nombre ?? `el nivel ${indice + 1}`}…`
        );

        let levelId = niveles.find((item) => item.level === indice)?.id;

        if (!levelId) {
          const creado = await executeTool(
            "create_level",
            {
              level: indice,
              name: nivel.nombre ?? `Nivel ${indice + 1}`,
              select: false,
            },
            ctx()
          );
          const datosNivel = datosDe<{ levelId: string; buildingId?: string }>(
            creado
          );
          if (!datosNivel) {
            avisos.push(
              `Nivel ${indice + 1}: ${mensajeDeError(creado)}`
            );
            continue;
          }
          levelId = datosNivel.levelId;
          niveles.push({
            id: levelId,
            level: indice,
            buildingId: datosNivel.buildingId ?? null,
          });
        }

        const ambientes = construirAmbientes(enEspera, indice);
        if (ambientes.length === 0) continue;

        const resultado = await executeTool(
          "create_rooms",
          { levelId, rooms: ambientes },
          { ...ctx(), levelId }
        );

        const datosCuartos = datosDe<ResultadoCreateRooms>(resultado);
        if (!datosCuartos) {
          avisos.push(
            `Nivel ${indice + 1}: ${mensajeDeError(resultado)}`
          );
          continue;
        }

        for (const cuarto of datosCuartos.rooms) {
          if (cuarto.roomId) {
            const ambiente = nivel.ambientes.find(
              (item) => item.nombre === cuarto.name
            );
            creados.set(cuarto.roomId, {
              nombre: cuarto.name,
              altura: ambiente?.altura ?? ALTURA_POR_DEFECTO,
            });
          }
        }
      }

      setFase("validando");
      setMensaje("Validando el plano…");

      let validacion = await executeTool("validate_scene", {}, ctx());
      let datosValidacion = datosDe<ResultadoValidate>(validacion);

      // `validate_scene` avisa qué ambientes quedaron sin puerta o ventana.
      // Se completan acá para que el plano nazca listo para editar.
      if (datosValidacion) {
        const faltantes = datosValidacion.warnings
          .filter(
            (warning) =>
              warning.code === "zone_without_door" ||
              warning.code === "zone_without_window"
          )
          .map((warning) => ({
            roomId: warning.nodeId,
            kind:
              warning.code === "zone_without_door"
                ? ("door" as const)
                : ("window" as const),
          }))
          .filter(
            (falta) =>
              falta.roomId !== undefined &&
              (creados.get(falta.roomId)?.altura ?? 0) > 0
          );

        if (faltantes.length > 0) {
          setMensaje("Completando puertas y ventanas…");
        }

        for (const falta of faltantes.slice(0, 16)) {
          const agregado = await executeTool(
            "add_opening",
            { roomId: falta.roomId, kind: falta.kind },
            ctx()
          );
          if (!agregado.ok) {
            const nombre = creados.get(falta.roomId ?? "")?.nombre ?? "ambiente";
            avisos.push(`No se pudo abrir ${falta.kind === "door" ? "puerta" : "ventana"} en ${nombre}.`);
          }
        }

        validacion = await executeTool("validate_scene", {}, ctx());
        datosValidacion = datosDe<ResultadoValidate>(validacion);
      }

      const lineas: string[] = [];
      if (datosValidacion) {
        lineas.push(
          `${creados.size} ambiente${creados.size === 1 ? "" : "s"} creado${creados.size === 1 ? "" : "s"}.`
        );
        if (datosValidacion.errorCount > 0) {
          lineas.push(
            `${datosValidacion.errorCount} error${datosValidacion.errorCount === 1 ? "" : "es"} de validación.`
          );
          for (const error of datosValidacion.errors.slice(0, 3)) {
            lineas.push(`${error.code}: ${error.message}`);
          }
        }
      }
      if (enEspera.plan.notas) lineas.push(enEspera.plan.notas);
      lineas.push(...avisos);

      setFase("listo");
      setMensaje(
        avisos.length > 0
          ? "Plano generado con observaciones"
          : "Plano generado"
      );
      setDetalle(lineas.slice(0, 6));
    } catch (error: unknown) {
      setFase("error");
      setMensaje(
        error instanceof Error
          ? error.message
          : "No se pudo ejecutar el plano generado."
      );
      setDetalle(avisos.slice(0, 4));
    }
  }, [input.proyectoId]);

  useEffect(() => {
    if (iniciado.current || !input.listo || !input.puedeEditar) return;
    iniciado.current = true;
    void ejecutar();
  }, [input.listo, input.puedeEditar, ejecutar]);

  return { fase, mensaje, detalle, cerrar };
}
