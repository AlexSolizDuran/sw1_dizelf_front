/**
 * Base de conocimiento del chat de ayuda de DIZELF.
 *
 * Es 100 % local: se usa cuando no hay red o cuando la IA no responde, y
 * también alimenta el prompt del servidor. No describe el contenido de un
 * plano concreto: solo cómo funciona la aplicación.
 */

export interface HelpEntry {
  id: string;
  titulo: string;
  pregunta: string;
  /** Markdown ligero: negritas, listas y `código`. */
  respuesta: string;
  keywords: string[];
  atajos?: string[];
}

export const HELP_ENTRIES: HelpEntry[] = [
  {
    id: "crear-proyecto",
    titulo: "Crear un proyecto",
    pregunta: "¿Cómo creo un proyecto nuevo?",
    respuesta:
      "1. Entra a **Mis Proyectos** desde la barra de navegación.\n2. Pulsa **Nuevo Proyecto** (o la tarjeta vacía si todavía no tienes ninguno).\n3. Escribe un nombre y acepta.\n4. Se abre el editor con un terreno, un edificio y un nivel listos para empezar.\n\nEl nombre identifica tu plano en la lista; después puedes cambiarlo desde la base de datos, pero no desde el editor.",
    keywords: ["crear", "nuevo", "proyecto", "empezar", "alta"],
    atajos: ["crear proyecto", "nuevo proyecto"],
  },
  {
    id: "abrir-proyecto",
    titulo: "Abrir un proyecto",
    pregunta: "¿Cómo abro un proyecto que ya existe?",
    respuesta:
      "En **Mis Proyectos** verás tus planos con tu rol al lado. Pulsa la tarjeta o la flecha **Abrir** y entrarás a `/editor/[id]`.\n\nSi el proyecto es tuyo aparece el rol **Creador**; si te invitaron, verás **EDITOR** (puede editar) o **LECTOR** (solo mirar).",
    keywords: ["abrir", "proyecto", "entrar", "editor", "lista"],
    atajos: ["abrir proyecto", "mis proyectos"],
  },
  {
    id: "eliminar-proyecto",
    titulo: "Eliminar un proyecto",
    pregunta: "¿Cómo elimino un proyecto?",
    respuesta:
      "Solo el **creador** puede eliminarlo. En **Mis Proyectos**, pulsa el ícono de papelera de la tarjeta y confirma.\n\nLa eliminación no se puede deshacer. Si solo quieres recuperar una versión anterior del plano, usa el **Historial de versiones** del editor.",
    keywords: ["eliminar", "borrar", "proyecto", "papelera", "destructivo"],
  },
  {
    id: "editor-2d-3d",
    titulo: "Ver el plano en 2D y 3D",
    pregunta: "¿Cómo cambio entre la vista 2D y 3D?",
    respuesta:
      "En la barra superior del editor tienes el selector **2D / 3D**. La vista 2D sirve para dibujar con precisión; la 3D para revisar volúmenes y materiales.\n\nEl botón **Ambiente 3D** alterna entre iluminación de día y de noche. La rueda del mouse acerca y aleja en ambas vistas.",
    keywords: ["2d", "3d", "vista", "cámara", "perspectiva", "ambiente"],
  },
  {
    id: "niveles",
    titulo: "Niveles o pisos",
    pregunta: "¿Cómo agrego, renombro o borro un nivel?",
    respuesta:
      "El **selector de niveles** está a la izquierda del lienzo. Desde ahí puedes:\n- agregar un nivel arriba o abajo;\n- insertar uno entre dos existentes;\n- renombrarlo con doble clic;\n- duplicarlo;\n- borrarlo (con confirmación);\n- reordenarlo arrastrando.\n\nCada nivel guarda sus propios muros, muebles y materiales. El nivel activo es el que recibe lo que dibujas.",
    keywords: ["nivel", "piso", "planta", "agregar", "renombrar", "duplicar", "ordenar"],
    atajos: ["niveles", "agregar nivel"],
  },
  {
    id: "muros",
    titulo: "Dibujar muros",
    pregunta: "¿Cómo dibujo un muro?",
    respuesta:
      "1. Abre la pestaña **Construir** del panel lateral.\n2. Elige **Muro** (atajo `1`).\n3. Haz clic en el plano para el primer punto y otro clic para el segundo.\n4. Pulsa `Esc` para terminar la línea.\n\nCon el muro seleccionado puedes cambiar largo, altura, espesor y material desde **Propiedades**.",
    keywords: ["muro", "pared", "tabique", "dibujar", "construir"],
    atajos: ["muro", "dibujar pared"],
  },
  {
    id: "zonas",
    titulo: "Zonas o ambientes",
    pregunta: "¿Cómo marco una habitación o ambiente?",
    respuesta:
      "Elige **Zona** en **Construir** (atajo `Z`) y dibuja el contorno del ambiente. La zona calcula su superficie y sirve para etiquetar espacios (dormitorio, baño, cocina).\n\nPuedes seleccionarla para cambiar nombre y color desde **Propiedades**.",
    keywords: ["zona", "ambiente", "habitación", "habitacion", "superficie", "área"],
    atajos: ["zona", "ambiente"],
  },
  {
    id: "puertas-ventanas",
    titulo: "Puertas y ventanas",
    pregunta: "¿Cómo coloco puertas y ventanas?",
    respuesta:
      "Las puertas y ventanas se apoyan sobre un **muro**. Elige **Puerta** (`2`) o **Ventana** (`3`) en **Construir** y haz clic sobre el muro.\n\nSi el muro no existe todavía, el editor no puede alojarlas. Después ajusta ancho, alto y posición desde **Propiedades**.",
    keywords: ["puerta", "ventana", "abertura", "hueco", "colocar"],
  },
  {
    id: "pisos-techos",
    titulo: "Pisos y techos",
    pregunta: "¿Cómo agrego un piso o un techo?",
    respuesta:
      "En **Construir** elige **Piso** (`4`) o **Techo** (`6`) y dibuja el polígono del ambiente. El piso define la superficie transitable; el techo, el cierre superior.\n\nAmbos aceptan material y espesor desde **Propiedades**.",
    keywords: ["piso", "suelo", "techo", "losa", "placa"],
  },
  {
    id: "columnas-escaleras-tejados",
    titulo: "Columnas, escaleras y tejados",
    pregunta: "¿Cómo agrego una columna, una escalera o un tejado?",
    respuesta:
      "En **Construir**:\n- **Columna** (`5`): un punto de apoyo estructural.\n- **Escalera** (`7`): conecta dos niveles; acomódala sobre el hueco del piso superior.\n- **Tejado** (`8`): cierra el edificio; se ajusta con pendiente y material.\n\nCada uno tiene sus medidas en **Propiedades**.",
    keywords: ["columna", "escalera", "tejado", "techo inclinado", "estructura"],
  },
  {
    id: "muebles",
    titulo: "Muebles y catálogo",
    pregunta: "¿Cómo agrego muebles?",
    respuesta:
      "Abre la pestaña **Muebles**, busca por nombre o categoría y arrastra o pulsa el modelo para insertarlo. El mueble aparece en el nivel activo.\n\nCon el mueble seleccionado puedes moverlo, rotarlo, duplicarlo o borrarlo desde **Propiedades**.",
    keywords: ["mueble", "muebles", "catálogo", "sofá", "silla", "cama", "insertar"],
    atajos: ["muebles", "agregar mueble"],
  },
  {
    id: "materiales",
    titulo: "Materiales y acabados",
    pregunta: "¿Cómo cambio el material de un objeto?",
    respuesta:
      "Selecciona un muro, piso, techo o mueble y abre la pestaña **Materiales** (o el campo de material en **Propiedades**). Elige una categoría y una terminación.\n\nEl material se aplica al objeto seleccionado y se ve en la vista 3D. Los cambios se sincronizan como cualquier otra edición.",
    keywords: ["material", "materiales", "acabado", "textura", "color", "pintura"],
    atajos: ["materiales", "cambiar material"],
  },
  {
    id: "propiedades",
    titulo: "Panel de propiedades",
    pregunta: "¿Cómo edito medidas, posición o rotación?",
    respuesta:
      "Selecciona un objeto: el panel **Propiedades** aparece a la derecha con sus campos. Desde ahí puedes cambiar medidas, posición, rotación, material y otros parámetros del tipo de objeto.\n\nTambién tiene acciones para **mover**, **duplicar** y **borrar** el objeto seleccionado. El borrado pide confirmación y entra al historial de deshacer.",
    keywords: ["propiedades", "medidas", "posición", "rotación", "duplicar", "borrar", "inspector"],
  },
  {
    id: "guardar-versiones",
    titulo: "Guardar una versión",
    pregunta: "¿Cómo guardo un punto de restauración del plano?",
    respuesta:
      "El editor guarda solo mientras trabajas, pero para crear un punto de restauración pulsa el ícono de **guardar** en la barra superior (al lado del estado de guardado).\n\nEso crea una fila en el **Historial de versiones** con la fecha. Es la forma de poder volver atrás más adelante; el autoguardado no crea versiones.",
    keywords: ["guardar", "versión", "version", "historial", "respaldo", "punto"],
    atajos: ["guardar versión", "historial"],
  },
  {
    id: "restaurar-version",
    titulo: "Restaurar o renombrar una versión",
    pregunta: "¿Cómo vuelvo a una versión anterior?",
    respuesta:
      "Abre el **Historial de versiones** en la barra superior del editor. Cada fila permite:\n- **Restaurar**: reemplaza la escena actual por la de esa versión (pide confirmación).\n- **Renombrar**: cambia solo la etiqueta de la fila.\n- **Eliminar**: borra el punto de restauración, sin tocar el plano actual.\n\nRestaurar no recarga la página: la escena en vivo se actualiza sola.",
    keywords: ["restaurar", "volver", "versión anterior", "renombrar", "historial"],
  },
  {
    id: "colaboradores-roles",
    titulo: "Colaboradores y roles",
    pregunta: "¿Qué puede hacer cada rol?",
    respuesta:
      "Hay tres roles frente a un proyecto:\n- **Creador**: dueño del proyecto; invita, cambia permisos, quita colaboradores y puede eliminar el proyecto.\n- **EDITOR**: abre el plano y lo edita en tiempo real.\n- **LECTOR**: abre el plano y lo ve actualizarse, pero no puede escribir.\n\nEl editor respeta el rol: un LECTOR no ve las herramientas de edición.",
    keywords: ["colaborador", "colaboradores", "rol", "roles", "creador", "editor", "lector", "permiso"],
    atajos: ["colaboradores", "roles"],
  },
  {
    id: "invitar-colaborador",
    titulo: "Invitar a un colaborador",
    pregunta: "¿Cómo invito a alguien a mi proyecto?",
    respuesta:
      "Solo el **creador** puede invitar. Abre el panel **Colaboradores** en la barra superior del editor, escribe el **correo** o **usuario** de la persona y elige el rol:\n- **EDITOR** para que modifique el plano.\n- **LECTOR** para que solo lo vea.\n\nEl backend valida que la persona exista y que tú seas el creador. También puedes pedirlo desde este chat: «invita a ana@correo.com como lectora».",
    keywords: ["invitar", "colaborador", "compartir", "correo", "usuario", "agregar"],
    atajos: ["invitar colaborador", "compartir proyecto"],
  },
  {
    id: "sincronizacion",
    titulo: "Sincronización en vivo",
    pregunta: "¿Cómo funciona el trabajo colaborativo?",
    respuesta:
      "Los cambios viajan por un canal en vivo: si otra persona edita el mismo plano, lo ves sin recargar. La barra superior muestra el estado **Conectando**, **Reconectando** o **Sin conexión**.\n\nMientras no haya conexión, el editor conserva tu trabajo local; al reconectar se sincroniza. La etiqueta **Guardado** se refiere al guardado del documento; el punto de restauración se crea con el botón de guardar versión.",
    keywords: ["sincronización", "sincronizacion", "tiempo real", "colaborativo", "conexión", "reconectar", "presencia"],
  },
  {
    id: "asistente-ia",
    titulo: "Asistente de IA del plano",
    pregunta: "¿Qué es el botón Asistente del editor?",
    respuesta:
      "El botón **Asistente** (abajo a la derecha del editor) abre un chat que sí puede leer y modificar el plano. Tiene dos modos:\n- **Plan**: solo consulta y propone.\n- **Build**: las escrituras quedan como propuestas y se aplican cuando las apruebas.\n\nEs distinto de este chat de ayuda: este solo explica la aplicación y gestiona proyectos; nunca toca el plano.",
    keywords: ["asistente", "ia", "inteligencia artificial", "plan", "build", "propuestas", "escena"],
  },
  {
    id: "dictado",
    titulo: "Dictado por voz",
    pregunta: "¿Cómo dicto un mensaje?",
    respuesta:
      "Pulsa el ícono de **micrófono** junto al campo de texto. La primera pulsación empieza a grabar y la segunda detiene y transcribe.\n\nLa transcripción se inserta en la posición del cursor. El navegador pedirá permiso para usar el micrófono; si lo bloqueaste, habilítalo desde la configuración del sitio. En conexiones sin HTTPS (salvo `localhost`) el micrófono no está disponible.",
    keywords: ["dictar", "voz", "micrófono", "microfono", "audio", "transcribir"],
    atajos: ["dictado", "dictar por voz"],
  },
  {
    id: "atajos",
    titulo: "Atajos del editor",
    pregunta: "¿Cuáles son los atajos de teclado?",
    respuesta:
      "En el editor:\n- `V` — Seleccionar.\n- `Z` — Zona.\n- `X` — Borrar.\n- `1` a `8` — Muro, puerta, ventana, piso, columna, techo, escalera y tejado.\n- `Esc` — terminar la herramienta actual.\n- `Ctrl/Cmd + Z` — deshacer.\n- `Ctrl/Cmd + C` y `Ctrl/Cmd + V` — copiar y pegar.\n\nLos atajos de construcción solo funcionan con permiso de edición.",
    keywords: ["atajo", "atajos", "teclado", "shortcut", "teclas", "deshacer"],
    atajos: ["atajos"],
  },
  {
    id: "sesion-cuenta",
    titulo: "Cuenta y sesión",
    pregunta: "¿Cómo cierro sesión o recupero mi cuenta?",
    respuesta:
      "El menú de tu nombre en la barra de navegación tiene **Cerrar sesión**. La sesión se guarda en una cookie del navegador; al cerrarla, vuelves a la pantalla de acceso.\n\nSi tu sesión venció, el editor y este chat te pedirán volver a iniciar sesión. No hay recuperación de contraseña desde el editor.",
    keywords: ["sesión", "sesion", "cuenta", "cerrar sesión", "login", "contraseña", "perfil"],
  },
  {
    id: "errores",
    titulo: "Errores frecuentes",
    pregunta: "¿Qué hago si algo no funciona?",
    respuesta:
      "Revisa estos casos:\n- **Sesión vencida**: vuelve a iniciar sesión; el plano se conserva.\n- **Límite de uso del asistente**: espera unos segundos y reintenta.\n- **Sin conexión**: el editor sigue trabajando local; al reconectar se sincroniza.\n- **El asistente no responde**: cambia de proveedor o usa este chat de ayuda, que funciona sin red.\n- **Micrófono bloqueado**: habilita el permiso del sitio.\n- **No ves la escena en 3D**: el editor necesita WebGL; prueba con otro navegador o activa la aceleración por hardware.",
    keywords: ["error", "problema", "falla", "no funciona", "límite", "sin conexión", "webgl"],
  },
  {
    id: "medicion",
    titulo: "Medir distancias",
    pregunta: "¿Cómo mido una distancia en el plano?",
    respuesta:
      "En la barra inferior del editor abre el **control de medición** y haz clic en dos puntos del plano. La medida aparece en pantalla y se descarta al cambiar de herramienta.\n\nPara medidas exactas de un objeto, selecciónalo y lee sus campos en **Propiedades**.",
    keywords: ["medir", "medición", "medicion", "distancia", "metro", "cotas"],
  },
];

/** Normaliza para comparar sin tildes ni mayúsculas. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Búsqueda local por palabras clave.
 *
 * Puntúa título, pregunta, palabras clave y texto de la respuesta; una
 * coincidencia en el título vale más que una en el cuerpo.
 */
export function searchHelp(consulta: string, limite = 6): HelpEntry[] {
  const terminos = normalizar(consulta)
    .split(/[^a-z0-9ñ]+/)
    .filter((termino) => termino.length >= 3);
  if (terminos.length === 0) return [];

  const puntuados = HELP_ENTRIES.map((entrada) => {
    const titulo = normalizar(entrada.titulo);
    const pregunta = normalizar(entrada.pregunta);
    const claves = normalizar(entrada.keywords.join(" "));
    const cuerpo = normalizar(entrada.respuesta);
    let puntos = 0;
    for (const termino of terminos) {
      if (titulo.includes(termino)) puntos += 5;
      if (claves.includes(termino)) puntos += 4;
      if (pregunta.includes(termino)) puntos += 2;
      if (cuerpo.includes(termino)) puntos += 1;
    }
    return { entrada, puntos };
  })
    .filter((item) => item.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos);

  return puntuados.slice(0, limite).map((item) => item.entrada);
}

export function entryPorId(id: string): HelpEntry | null {
  return HELP_ENTRIES.find((entrada) => entrada.id === id) ?? null;
}
