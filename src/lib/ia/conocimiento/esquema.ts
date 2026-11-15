import { z } from "zod";

/**
 * Tarjetas de conocimiento del asistente.
 *
 * Son referencias generales de diseño, no normativa de una jurisdicción.
 * `ambito` queda reservado para cuando se sumen tarjetas locales.
 */

export const tipoTarjetaSchema = z.enum(["referencia", "buena-practica"]);

export const datoTarjetaSchema = z.object({
  etiqueta: z.string().min(2),
  valor: z.union([z.number(), z.string()]),
  unidad: z.string().min(1),
});

export const tarjetaSchema = z.object({
  id: z
    .string()
    .min(3)
    .regex(/^[a-z0-9-]+$/, "El id solo admite minúsculas, números y guiones."),
  titulo: z.string().min(3).max(120),
  temas: z.array(z.string().min(2)).min(1),
  tipo: tipoTarjetaSchema,
  texto: z.string().min(80).max(2000),
  datos: z.array(datoTarjetaSchema).min(1).optional(),
  ambito: z.literal("generico"),
});

export const tarjetasSchema = z.array(tarjetaSchema).min(1);

export type Tarjeta = z.infer<typeof tarjetaSchema>;
export type TipoTarjeta = z.infer<typeof tipoTarjetaSchema>;
export type DatoTarjeta = z.infer<typeof datoTarjetaSchema>;

/** Tarjeta tal como viaja al cliente: sin vectores y con el texto ya recortado. */
export interface TarjetaFuente {
  id: string;
  titulo: string;
  texto: string;
  tipo: TipoTarjeta;
  datos?: DatoTarjeta[];
}

export type OrigenConocimiento = "vectorial" | "lexico";

export interface ConocimientoUsado {
  origen: OrigenConocimiento;
  tarjetas: TarjetaFuente[];
}
