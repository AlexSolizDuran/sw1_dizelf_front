"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordMeter } from "@/components/ui/password-meter";
import { useAuthStore } from "@/stores/use-auth-store";

export function RegisterCard() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();

  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    username: "",
    gmail: "",
    password: "",
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const validateEmail = (email: string): boolean => {
    // Validación de formato de correo RFC 5322 simplificado
    const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    return regex.test(email);
  };

  const validatePassword = (pwd: string): boolean => {
    const hasMinLength = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    return hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === "gmail") {
      if (value && !validateEmail(value)) {
        setEmailError("Ingresa un correo electrónico válido (ej. usuario@gmail.com)");
      } else {
        setEmailError(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.nombre.trim() || !formData.apellido.trim()) {
      setErrorMessage("Por favor ingresa tu nombre y apellido.");
      return;
    }

    if (!formData.username.trim()) {
      setErrorMessage("Por favor elige un nombre de usuario.");
      return;
    }

    if (!validateEmail(formData.gmail)) {
      setErrorMessage("Por favor ingresa un correo electrónico válido.");
      return;
    }

    if (!validatePassword(formData.password)) {
      setErrorMessage(
        "La contraseña debe tener mínimo 8 caracteres, al menos una mayúscula, una minúscula, un número y un símbolo."
      );
      return;
    }

    try {
      await register({
        nombre: formData.nombre.trim(),
        apellido: formData.apellido.trim(),
        username: formData.username.trim(),
        gmail: formData.gmail.trim().toLowerCase(),
        password: formData.password,
      });

      // Registro exitoso -> el backend fijó la cookie y redirigimos al área principal
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrarse";
      setErrorMessage(msg);
    }
  };

  return (
    <div className="w-full max-w-[480px] mx-auto flex flex-col items-center">
      {/* Encabezado de Marca */}
      <div className="text-center mb-8">
        <Link href="/" className="inline-block group">
          <h1 className="text-4xl font-extrabold tracking-wider text-[#6A3825] group-hover:opacity-90 transition-opacity">
            DIZELF
          </h1>
        </Link>
        <p className="mt-2 text-sm text-[#7D6E64] font-medium">Crea tu cuenta de usuario</p>
      </div>

      {/* Tarjeta del Formulario */}
      <div className="w-full bg-[#FAF9F7] rounded-2xl p-7 sm:p-9 border border-[#EBE4DC] shadow-[0_4px_24px_rgba(106,56,37,0.04)]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {errorMessage && (
            <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-md">
              {errorMessage}
            </div>
          )}

          {/* Campos Nombre y Apellido (Persona) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Nombre"
              name="nombre"
              type="text"
              placeholder="Ej. Juan"
              value={formData.nombre}
              onChange={handleChange}
              icon={<User className="w-4 h-4" />}
              required
            />
            <Input
              label="Apellido"
              name="apellido"
              type="text"
              placeholder="Ej. Pérez"
              value={formData.apellido}
              onChange={handleChange}
              icon={<User className="w-4 h-4" />}
              required
            />
          </div>

          {/* Campo Nombre de Usuario (Usuario) */}
          <Input
            label="Nombre de Usuario"
            name="username"
            type="text"
            placeholder="ej. juanperez"
            value={formData.username}
            onChange={handleChange}
            icon={<User className="w-4 h-4" />}
            autoComplete="username"
            required
          />

          {/* Campo Correo Electrónico (Persona.gmail) */}
          <Input
            label="Correo Electrónico"
            name="gmail"
            type="email"
            placeholder="juan@email.com"
            value={formData.gmail}
            onChange={handleChange}
            icon={<Mail className="w-4 h-4" />}
            error={emailError || undefined}
            autoComplete="email"
            required
          />

          {/* Campo Contraseña (Usuario.hash_contrasena) */}
          <div className="flex flex-col">
            <Input
              label="Contraseña"
              name="password"
              isPassword
              placeholder="Mínimo 8 caracteres"
              value={formData.password}
              onChange={handleChange}
              icon={<Lock className="w-4 h-4" />}
              autoComplete="new-password"
              required
            />
            {/* Medidor visual de fortaleza */}
            <PasswordMeter password={formData.password} />
          </div>

          {/* Botón Primario */}
          <div className="pt-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full justify-center !rounded-md"
              isLoading={isLoading}
            >
              Crear Cuenta
            </Button>
          </div>
        </form>

        {/* Pie de Tarjeta */}
        <div className="mt-8 text-center text-xs text-[#7A6C62]">
          <span>¿Ya tienes una cuenta registrada? </span>
          <Link
            href="/login"
            className="font-semibold text-[#8C432A] hover:text-[#6F321E] underline decoration-1 underline-offset-2 transition-colors"
          >
            Inicia Sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
