import {
  ALTURA_POR_DEFECTO,
  type AmbientePlan,
  type NivelPlan,
  type PlanProyecto,
} from "./esquema";

/**
 * Normalización geométrica del plan.
 *
 * El modelo razona bien en metros, pero sus polígonos traen ruido: vértices
 * fuera de orden, rectángulos rotados unos grados, coordenadas negativas o un
 * edificio de 40 m que no entra en el terreno de 30 m. Acá se convierte todo a
 * rectángulos alineados a los ejes, se ajusta a una grilla de 5 cm y se traslada
 * el conjunto a `(0, 0)`.
 *
 * La validación es deliberadamente estricta con los solapes: dos ambientes
 * pisados hacen que `create_rooms` comparta mal las paredes. Si aparece un
 * problema, el endpoint hace **una** reparación pidiéndole al modelo que lo
 * corrija.
 */

export const PASO_SNAP = 0.05;
export const AREA_MINIMA = 2;
export const LADO_MAXIMO = 28;
export const LIMITE_COORDENADA = 80;
const TOLERANCIA_AREA = 0.02;

type Rect = { x0: number; z0: number; x1: number; z1: number };

export interface ResultadoPlan {
  ok: boolean;
  plan: PlanProyecto;
  problemas: string[];
  avisos: string[];
}

function snap(valor: number): number {
  const redondeado = Math.round(valor / PASO_SNAP) * PASO_SNAP;
  return Number(redondeado.toFixed(3));
}

function areaRect(rect: Rect): number {
  return Math.max(0, rect.x1 - rect.x0) * Math.max(0, rect.z1 - rect.z0);
}

function rectanguloDe(poligono: readonly (readonly [number, number])[]): Rect {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of poligono) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0: snap(x0), z0: snap(z0), x1: snap(x1), z1: snap(z1) };
}

function poligonoDe(rect: Rect): [number, number][] {
  return [
    [rect.x0, rect.z0],
    [rect.x1, rect.z0],
    [rect.x1, rect.z1],
    [rect.x0, rect.z1],
  ];
}

function areaSolape(a: Rect, b: Rect): number {
  const ancho = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const alto = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  if (ancho <= 0 || alto <= 0) return 0;
  return ancho * alto;
}

/**
 * Índice del vértice original que coincide con la esquina `(x0, z0)`.
 *
 * Al reordenar el polígono a la forma canónica, los lados cambian de número.
 * Si conocemos el desplazamiento, las puertas y ventanas siguen apuntando al
 * mismo lado que eligió el modelo.
 */
function desplazamientoCanonico(
  poligono: readonly (readonly [number, number])[],
  rect: Rect
): number {
  if (poligono.length !== 4) return 0;
  const indice = poligono.findIndex(
    ([x, z]) => snap(x) === rect.x0 && snap(z) === rect.z0
  );
  return indice === -1 ? 0 : indice;
}

function ladoNormalizado(lado: number, desplazamiento: number): number {
  const base = ((Math.trunc(lado) || 1) - 1) % 4;
  const rotado = (base - desplazamiento + 4) % 4;
  return rotado + 1;
}

function nombreUnico(
  base: string,
  usados: Map<string, number>
): string {
  const clave = base.trim().toLocaleLowerCase("es");
  const conteo = usados.get(clave) ?? 0;
  usados.set(clave, conteo + 1);
  if (conteo === 0) return base.trim();
  return `${base.trim()} ${conteo + 1}`.slice(0, 60);
}

function rectsDeNivel(nivel: NivelPlan): Rect[] {
  return nivel.ambientes.map((ambiente) => rectanguloDe(ambiente.poligono));
}

/**
 * Valida y normaliza el plan completo.
 *
 * Nunca lanza: devuelve `ok: false` con la lista de problemas para que el
 * endpoint pueda pedir una reparación con esos errores concretos.
 */
export function normalizarPlan(plan: PlanProyecto): ResultadoPlan {
  const problemas: string[] = [];
  const avisos: string[] = [];

  if (plan.niveles.length === 0) {
    return {
      ok: false,
      plan,
      problemas: ["El plan no tiene ningún nivel."],
      avisos,
    };
  }

  const niveles = [...plan.niveles]
    .map((nivel, indice) => ({ nivel, indice }))
    .sort((a, b) => (a.nivel.nivel ?? a.indice) - (b.nivel.nivel ?? b.indice))
    .map(({ nivel }) => nivel);

  // 1. Rectángulos por ambiente, con validación de coordenadas y área.
  const rectsPorNivel: Rect[][] = [];

  niveles.forEach((nivel, indiceNivel) => {
    if (nivel.ambientes.length === 0) {
      problemas.push(`El nivel ${indiceNivel + 1} no tiene ambientes.`);
    }
    if (nivel.ambientes.length > 8) {
      problemas.push(
        `El nivel ${indiceNivel + 1} tiene ${nivel.ambientes.length} ambientes; el máximo es 8.`
      );
    }

    const rects: Rect[] = [];
    for (const [indiceAmbiente, ambiente] of nivel.ambientes.entries()) {
      const etiqueta = `Nivel ${indiceNivel + 1}, ambiente ${indiceAmbiente + 1} ("${ambiente.nombre}")`;

      for (const [x, z] of ambiente.poligono) {
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
          problemas.push(`${etiqueta}: coordenadas no numéricas.`);
        } else if (
          Math.abs(x) > LIMITE_COORDENADA ||
          Math.abs(z) > LIMITE_COORDENADA
        ) {
          problemas.push(
            `${etiqueta}: coordenadas fuera del rango ±${LIMITE_COORDENADA} m.`
          );
        }
      }

      const rect = rectanguloDe(ambiente.poligono);
      rects.push(rect);

      if (areaRect(rect) < AREA_MINIMA) {
        problemas.push(
          `${etiqueta}: el área es ${areaRect(rect).toFixed(1)} m²; el mínimo es ${AREA_MINIMA} m².`
        );
      }
    }

    // 2. Solapes dentro del mismo nivel. Tocar el borde está permitido: así se
    //    comparte la pared.
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const solape = areaSolape(rects[i], rects[j]);
        if (solape > TOLERANCIA_AREA) {
          const a = nivel.ambientes[i]?.nombre ?? `ambiente ${i + 1}`;
          const b = nivel.ambientes[j]?.nombre ?? `ambiente ${j + 1}`;
          problemas.push(
            `Nivel ${indiceNivel + 1}: "${a}" y "${b}" se superponen ${solape.toFixed(1)} m².`
          );
        }
      }
    }

    rectsPorNivel.push(rects);
  });

  // 3. Traslación global: todos los niveles comparten origen para que el
  //    edificio quede alineado en vertical.
  const todos = rectsPorNivel.flat();
  if (todos.length > 0) {
    const minX = Math.min(...todos.map((rect) => rect.x0));
    const minZ = Math.min(...todos.map((rect) => rect.z0));
    if (minX !== 0 || minZ !== 0) {
      for (const rect of todos) {
        rect.x0 = snap(rect.x0 - minX);
        rect.x1 = snap(rect.x1 - minX);
        rect.z0 = snap(rect.z0 - minZ);
        rect.z1 = snap(rect.z1 - minZ);
      }
    }
  }

  // 4. Envolvente: si no entra en el terreno, se escala proporcionalmente en
  //    vez de rechazar un plano que por lo demás es correcto.
  const maxX = todos.length > 0 ? Math.max(...todos.map((rect) => rect.x1)) : 0;
  const maxZ = todos.length > 0 ? Math.max(...todos.map((rect) => rect.z1)) : 0;
  const lado = Math.max(maxX, maxZ);
  if (lado > LADO_MAXIMO) {
    const factor = LADO_MAXIMO / lado;
    for (const rect of todos) {
      rect.x0 = snap(rect.x0 * factor);
      rect.x1 = snap(rect.x1 * factor);
      rect.z0 = snap(rect.z0 * factor);
      rect.z1 = snap(rect.z1 * factor);
    }
    avisos.push(
      `El plano medía ${lado.toFixed(1)} m de lado y se escaló para entrar en el terreno de ${LADO_MAXIMO} × ${LADO_MAXIMO} m.`
    );
    for (const rect of todos) {
      if (areaRect(rect) < AREA_MINIMA) {
        problemas.push(
          `Al escalar el plano quedó un ambiente de ${areaRect(rect).toFixed(1)} m²; el mínimo es ${AREA_MINIMA} m².`
        );
      }
    }
  }

  // 5. Reconstrucción del plan normalizado.
  const nivelesNormalizados: NivelPlan[] = niveles.map(
    (nivel, indiceNivel) => {
      const usados = new Map<string, number>();
      const ambientes: AmbientePlan[] = nivel.ambientes.map(
        (ambiente, indiceAmbiente) => {
          const rect = rectsPorNivel[indiceNivel][indiceAmbiente];
          const desplazamiento = desplazamientoCanonico(
            ambiente.poligono,
            rectanguloDe(ambiente.poligono)
          );

          const aberturas = (ambiente.aberturas ?? []).map((abertura) => {
            const lado = ladoNormalizado(abertura.lado, desplazamiento);
            if (abertura.lado < 1 || abertura.lado > 4) {
              avisos.push(
                `"${ambiente.nombre}": el lado ${abertura.lado} no existe en un rectángulo; se usó el lado ${lado}.`
              );
            }
            return { ...abertura, lado };
          });

          const ancho = rect.x1 - rect.x0;
          const alto = rect.z1 - rect.z0;
          const minimo = Math.min(ancho, alto);
          const filtradas = aberturas.filter((abertura) => {
            if ((abertura.ancho ?? 0.8) <= minimo) return true;
            avisos.push(
              `"${ambiente.nombre}": se quitó una abertura de ${abertura.ancho} m porque no entra en un lado de ${minimo.toFixed(1)} m.`
            );
            return false;
          });

          return {
            nombre: nombreUnico(ambiente.nombre, usados),
            poligono: poligonoDe(rect),
            altura: ambiente.altura ?? ALTURA_POR_DEFECTO,
            aberturas: filtradas,
          };
        }
      );

      return {
        nivel: indiceNivel,
        ...(nivel.nombre ? { nombre: nivel.nombre } : {}),
        ambientes,
      };
    }
  );

  return {
    ok: problemas.length === 0,
    plan: {
      ...(plan.nombreSugerido ? { nombreSugerido: plan.nombreSugerido } : {}),
      ...(plan.notas ? { notas: plan.notas } : {}),
      niveles: nivelesNormalizados,
    },
    problemas,
    avisos,
  };
}
