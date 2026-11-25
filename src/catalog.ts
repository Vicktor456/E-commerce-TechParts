export const categoryCodes = {
  "Placas-mãe": "placa-mae",
  Monitores: "monitor",
  Processadores: "processador",
  Memórias: "memoria",
  Teclados: "teclado",
  Mouses: "mouse",
} as const;

export type Category = keyof typeof categoryCodes;
export type Product = {
  id: number;
  name: string;
  brand: string;
  category: Category;
  price: number;
  total: number;
  baseReserved: number;
  active: boolean;
  specs: Record<string, string>;
  description: string;
  badge?: string;
};

type Page<T> = { items: T[]; total: number; nextCursor?: string | null };
type PriceEvent = { id: string; date: string; price: number };

export type CatalogFilters = {
  counts: Record<string, number>;
  maxPrice: number;
  specs: Record<string, Record<string, string[]>>;
};

const specKeys: Record<string, string> = {
  Soquete: "soquete",
  Chipset: "chipset",
  "Tipo de memória": "tipo_memoria",
  "Tipo de painel": "painel",
  "Taxa de atualização": "taxa_atualizacao_hz",
};

function specEntry(field: string, value: string) {
  return [
    specKeys[field] ?? field,
    field === "Taxa de atualização" ? value.trim().replace(/\s*Hz$/i, "").trim() : value.trim(),
  ];
}

export class CatalogError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const root = "/api/catalogo";
const adminRoot = `${root}/admin/produtos`;
export const catalogPageSize = 9;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const validation = Array.isArray(detail) ? detail[0]?.msg : null;
    throw new CatalogError(
      response.status,
      typeof detail === "string"
        ? detail
        : typeof validation === "string"
          ? validation.replace(/^Value error, /, "")
          : "Não foi possível consultar o catálogo.",
    );
  }
  return response.json();
}

type Listing = {
  search: string;
  category: Category | "";
  minPrice: string;
  maxPrice: number | null;
  onlyAvailable: boolean;
  tech: Record<string, string[]>;
  sort: string;
  cursor: string | null;
};

export const catalog = {
  list: (filters: Listing, signal: AbortSignal) => {
    const query = new URLSearchParams({
      ordem: filters.sort,
      limite: String(catalogPageSize),
    });
    if (filters.cursor) query.set("cursor", filters.cursor);
    if (filters.search.trim()) query.set("busca", filters.search.trim());
    if (filters.category) query.set("categoria", categoryCodes[filters.category]);
    if (filters.minPrice) query.set("preco_min", filters.minPrice);
    if (filters.maxPrice !== null) query.set("preco_max", String(filters.maxPrice));
    if (filters.onlyAvailable) query.set("disponivel", "true");
    for (const [field, values] of Object.entries(filters.tech)) {
      for (const value of values) query.append("especificacao", specEntry(field, value).join(":"));
    }
    return request<Page<Product>>(`${root}/produtos?${query}`, { signal });
  },
  filters: (signal: AbortSignal) => request<CatalogFilters>(`${root}/filtros`, { signal }),
  details: (id: number, signal: AbortSignal) =>
    request<Product>(`${root}/produtos/${id}`, { signal }),
  adminList: (signal: AbortSignal) => request<Product[]>(adminRoot, { signal }),
  history: (id: number, admin: boolean, period: string, asOf: number, cursor: string | null, signal: AbortSignal) => {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    if (period !== "all") {
      query.set("inicio", new Date(asOf - Number(period) * 86_400_000).toISOString());
      query.set("fim", new Date(asOf + 1).toISOString());
    }
    const base = admin ? adminRoot : `${root}/produtos`;
    return request<Page<PriceEvent>>(`${base}/${id}/historico?${query}`, { signal });
  },
  save: (product: Pick<Product, "id" | "name" | "brand" | "category" | "description" | "price" | "specs">) =>
    request<Product>(product.id ? `${adminRoot}/${product.id}` : adminRoot, {
      method: product.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: product.name,
        brand: product.brand,
        category: categoryCodes[product.category],
        description: product.description,
        price: product.price.toFixed(2),
        specs: Object.fromEntries(
          Object.entries(product.specs)
            .filter(([, value]) => value.trim())
            .map(([field, value]) => specEntry(field, value)),
        ),
      }),
    }),
  remove: (id: number) => request<Product>(`${adminRoot}/${id}`, { method: "DELETE" }),
  reactivate: (id: number) => request<Product>(`${adminRoot}/${id}/reativar`, { method: "PATCH" }),
};
