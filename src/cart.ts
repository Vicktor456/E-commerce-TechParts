import type { Product } from "./catalog";

export type Cart = { items: { id: number; quantity: number; product: Product | null }[] };
type Stock = Pick<Product, "total" | "baseReserved">;

export class CartError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...options });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new CartError(
      response.status,
      typeof data?.detail === "string" ? data.detail : "Não foi possível acessar compras e estoque.",
    );
  }
  return response;
}

const put = (body: object): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const purchases = {
  cart: async (signal: AbortSignal): Promise<Cart> =>
    (await request("/api/carrinho", { signal })).json(),
  setQuantity: (id: number, quantity: number) =>
    request(`/api/carrinho/itens/${id}`, put({ quantity })),
  setStock: async (id: number, total: number): Promise<Stock> =>
    (await request(`/api/estoque/${id}`, put({ total }))).json(),
};
