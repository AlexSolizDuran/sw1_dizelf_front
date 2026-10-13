import { Metadata } from "next";
import { LoginCard } from "@/components/features/auth/login-card";

export const metadata: Metadata = {
  title: "Iniciar Sesión | DIZELF",
  description: "Inicia sesión con tus credenciales en la plataforma DIZELF.",
};

export default function LoginPage() {
  return <LoginCard />;
}
