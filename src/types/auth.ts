export interface RegisterDto {
  nombre: string;
  apellido: string;
  gmail: string;
  username: string;
  password: string;
}

export interface LoginDto {
  identificador: string;
  password: string;
}

export interface PersonaProfile {
  personaId?: number;
  nombre: string;
  apellido: string;
  gmail: string;
}

export interface UserProfile {
  usuarioId: number;
  username: string;
  persona?: PersonaProfile;
}

export interface AuthResponse {
  usuario: UserProfile;
  mensaje?: string;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}
