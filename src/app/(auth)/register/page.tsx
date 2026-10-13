import { Metadata } from "next";
import { RegisterCard } from "@/components/features/auth/register-card";

export const metadata: Metadata = {
  title: "Registrarse | DIZELF",
  description: "Crea tu cuenta en DIZELF para comenzar a diseñar.",
};

export default function RegisterPage() {
  return <RegisterCard />;
}
