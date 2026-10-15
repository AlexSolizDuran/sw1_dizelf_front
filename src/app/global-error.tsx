"use client";

/**
 * Atrapa el fallo del root layout, el único punto donde todavía se puede
 * reemplazar el `<html>` entero.
 *
 * Si este boundary también revienta, Next cae a su pantalla de error mínima.
 * Por eso el markup es a pelo y no usa ningún componente del proyecto: si el
 * error viene de un módulo compartido (tokens, fuente, store), importarlo acá
 * volvería a fallar dentro del boundary que debería contenerlo.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAF7F2",
          color: "#2B2A28",
          fontFamily: "Arial, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.75rem", color: "#6A3825" }}>
            DIZELF no pudo arrancar
          </h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#7A6D63" }}>
            Algo falló antes de poder mostrar la página. Podés reintentar; si
            sigue igual, recargá el navegador.
          </p>
          {error.digest ? (
            <p
              style={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "#6B5E55",
                marginTop: "0.75rem",
              }}
            >
              Referencia: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            type="button"
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.25rem",
              background: "#8C432A",
              color: "#fff",
              border: 0,
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}