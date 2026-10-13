import { apiClient } from "./api";
import {
  AuthResponse,
  LoginDto,
  RegisterDto,
  UserProfile,
} from "@/types/auth";

export async function apiRegister(data: RegisterDto): Promise<AuthResponse> {
  return apiClient<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiLogin(data: LoginDto): Promise<AuthResponse> {
  return apiClient<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiLogout(): Promise<{ message?: string }> {
  return apiClient<{ message?: string }>("/auth/logout", {
    method: "POST",
  });
}

export async function apiGetPerfil(): Promise<UserProfile> {
  return apiClient<UserProfile>("/auth/perfil", {
    method: "GET",
  });
}
