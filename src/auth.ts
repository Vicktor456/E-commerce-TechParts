export type User = { id: string; name: string; email: string; role: "client" | "admin" };

export class AuthError extends Error {
  constructor(public status: number) {
    super("A solicitação de autenticação falhou.");
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  if (!response.ok) throw new AuthError(response.status);
  return response.status === 204 ? (undefined as T) : response.json();
}

function post<T>(path: string, body: object) {
  return request<T>(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const auth = {
  register: (values: { name: string; email: string; password: string }) =>
    post<User>("cadastro", values),
  login: (values: { email: string; password: string }) => post<User>("login", values),
  me: (signal: AbortSignal) => request<User>("/api/auth/me", { signal }),
  logout: () => post<void>("logout", {}),
};
