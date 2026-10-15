"use client";

import Link from "next/link";

/**
 * Error boundary de la ruta del editor.
 *
 * El editor es 100% cliente y monta three.js, WebGL y el registro de 43 tipos
 * de nodo. Antes de este boundary, cualquier throw en esa cadena —el parche de
 * iconos, el autolanzamiento del registro, el propio `<Editor>`— dejaba la
 * pantalla en blanco y sin salida, con el plano sin guardar.
 *
 * Los estilos van inline y con los hex de marca en vez de usar
 * `editor.module.css`: este boundary reemplaza el contenido de la ruta, así que
 * se renderiza **fuera** de `.shell`, que es donde viven los tokens del
 * editor. Usar el módulo dejaría el panel sin fondo.
 *
 * `reset()` remonta el segmento y con él el `EditorLoader`, que vuelve a pedir
 * el proyecto al backend. Para el error del registro de nodos eso es lo
 * correcto; para un plano ya abierto, el paquete rehidrata la escena desde el
 * documento guardado.
 */
export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "2rem",
        textAlign: "center",
        background: "#FAF7F2",
        color: "#2B2A28",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <p
        style={{
          fontSize: "1.125rem",
          fontWeight: 700,
          color: "#8C432A",
          margin: 0,
        }}
      >
        El editor no pudo seguir
      </p>

      <p
        style={{
          maxWidth: "26rem",
          fontSize: "0.8125rem",
          lineHeight: 1.6,
          color: "#7A6D63",
          margin: 0,
        }}
      >
        Puede ser que el navegador no tenga WebGL disponible, o que el proyecto
        haya quedado en un estado que el editor no puede leer. Si ya habías
        hecho cambios, autosave los tenía guardados salvo el último segundo.
      </p>

      {error.digest ? (
        <p
          style={{
            fontFamily: "monospace",
            fontSize: "0.6875rem",
            color: "#6B5E55",
            margin: 0,
          }}
        >
          Referencia: {error.digest}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button
          onClick={reset}
          type="button"
          style={{
            padding: "0.5rem 1rem",
            background: "#8C432A",
            color: "#fff",
            border: 0,
            borderRadius: "0.25rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>

        <Link
          href="/proyectos"
          style={{
            padding: "0.5rem 1rem",
            background: "transparent",
            color: "#5A4E46",
            border: "1px solid #DDD5CB",
            borderRadius: "0.25rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Volver a mis proyectos
        </Link>
      </div>
    </div>
  );
}