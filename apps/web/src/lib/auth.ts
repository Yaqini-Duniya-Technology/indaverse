import { apiFetch } from "./api";

export interface User {
  id: number;
  email: string;
  username: string;
  is_active: boolean;
  is_verified: boolean;
}

interface RegisterData {
  email: string;
  username: string;
  password: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface TokenResponse {
  message: string;
}

export async function registerUser(
  data: RegisterData,
): Promise<User> {
  return apiFetch<User>("/api/v1/auth/register", {
    method: "POST",
    body: data,
  });
}

export async function loginUser(
  data: LoginData,
): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: data,
  });
}

export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>("/api/v1/auth/me", {
    method: "GET",
  });
}

export async function logoutUser(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(
    "/api/v1/auth/logout",
    {
      method: "POST",
    },
  );
}