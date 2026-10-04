"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SocialButtons } from "./social-buttons";
import { useAuthStore } from "@/stores/use-auth-store";

export function LoginCard() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();

  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!identificador.trim()) {
      setErrorMessage("Por favor ingresa tu correo electrónico o nombre de usuario.");
      return;
    }
    if (!password) {
      setErrorMessage("Por favor ingresa tu contraseña.");
      return;
    }

    try {
      await login({
        identificador: identificador.trim(),
        password,
      });
      // Al iniciar sesión exitosamente, redirige al área principal
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al iniciar sesión";
      setErrorMessage(msg);
    }
  };

  return (
    <div className="w-full max-w-[420px] mx-auto flex flex-col items-center">
      {/* Encabezado de Marca */}
      <div className="text-center mb-8">
        <Link href="/" className="inline-block group">
          <h1 className="text-4xl font-extrabold tracking-wider text-[#6A3825] group-hover:opacity-90 transition-opacity">
            DIZELF
          </h1>
        </Link>
        <p className="mt-2 text-sm text-[#7D6E64] font-medium">Bienvenido de nuevo</p>
      </div>

      {/* Tarjeta del Formulario */}
      <div className="w-full bg-[#FAF9F7] rounded-2xl p-7 sm:p-9 border border-[#EBE4DC] shadow-[0_4px_24px_rgba(106,56,37,0.04)]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {errorMessage && (
            <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-md">
              {errorMessage}
            </div>
          )}

          {/* Campo Correo Electrónico / Identificador */}
          <Input
            label="Correo Electrónico"
            name="identificador"
            type="text"
            placeholder="u@email.com"
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            autoComplete="username"
            required
          />

          {/* Campo Contraseña */}
          <Input
            label="Contraseña"
            name="password"
            isPassword
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock className="w-4 h-4" />}
            autoComplete="current-password"
            rightAction={
              <button
                type="button"
                onClick={() => alert("Función de recuperación disponible próximamente.")}
                className="text-xs text-[#8C7B71] hover:text-[#8C432A] transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            }
            required
          />

          {/* Botón Primario */}
          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full justify-center !rounded-md"
              isLoading={isLoading}
            >
              Iniciar Sesión
            </Button>
          </div>

          {/* Divisor */}
          <div className="relative my-2 flex items-center justify-center">
            <div className="w-full border-t border-[#E5DFD7]" />
            <span className="absolute bg-[#FAF9F7] px-3 text-[11px] text-[#9A8D84] uppercase tracking-wider">
              o continuar con
            </span>
          </div>

          {/* Botones Sociales */}
          <SocialButtons />
        </form>

        {/* Pie de Tarjeta */}
        <div className="mt-8 text-center text-xs text-[#7A6C62]">
          <span>¿No tienes una cuenta? </span>
          <Link
            href="/register"
            className="font-semibold text-[#8C432A] hover:text-[#6F321E] underline decoration-1 underline-offset-2 transition-colors"
          >
            Regístrate
          </Link>
        </div>
      </div>
    </div>
  );
}
