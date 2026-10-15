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

/**
 * Refleja `UsuarioPerfilDto` del backend, que serializa la clave primaria como
 * `id`. Antes se declaraba `usuarioId`/`personaId` y eso hacía que
 * `checkSession()` leyera `undefined`: la sesión nunca se restauraba y un F5
 * expulsaba al usuario a `/login` aunque la cookie fuera válida.
 */
export interface PersonaProfile {
  id: number;
  nombre: string;
  apellido: string;
  gmail: string;
}

export interface UserProfile {
  id: number;
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
