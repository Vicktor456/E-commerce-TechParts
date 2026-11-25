import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { auth, AuthError } from "./auth";
import type { User } from "./auth";
import { catalog, CatalogError, catalogPageSize, historyPageSize } from "./catalog";
import type { CatalogFilters, Category, Product } from "./catalog";
import { CartError, purchases } from "./cart";
import type { Cart } from "./cart";

type IconName =
  | "search"
  | "user"
  | "cart"
  | "arrow"
  | "chevron"
  | "close"
  | "filter"
  | "chip"
  | "monitor"
  | "keyboard"
  | "mouse"
  | "box"
  | "check"
  | "plus"
  | "minus"
  | "trash"
  | "edit"
  | "logout"
  | "clock"
  | "shield"
  | "grid"
  | "info"
  | "memory";
function Icon({
  name,
  size = 20,
  ...props
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
      </>
    ),
    cart: (
      <>
        <path d="M2 3h3l3 12h11l3-9H6" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h15m-6-6 6 6-6 6" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    filter: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <path d="M8 3v6m8 0v6m-8 0v6" />
      </>
    ),
    chip: (
      <>
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4M18 9h4m-4 6h4" />
      </>
    ),
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M12 17v4m-5 0h10" />
      </>
    ),
    keyboard: (
      <>
        <rect x="2" y="6" width="20" height="13" rx="2" />
        <path d="M5 10h1m3 0h1m3 0h1m3 0h1M5 13h1m3 0h1m3 0h1m3 0h1M7 16h10" />
      </>
    ),
    mouse: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="6" />
        <path d="M12 2v7M6 10h12" />
      </>
    ),
    box: (
      <>
        <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10v10M3 7l9 5 9-5M7.5 4.5l9 5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </>
    ),
    edit: (
      <>
        <path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z" />
      </>
    ),
    logout: (
      <>
        <path d="M9 3H4v18h5m5-5 5-4-5-4m-6 4h13" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-11v1" />
      </>
    ),
    memory: (
      <>
        <path d="M3 5h18v12H3zM6 17v3m4-3v3m4-3v3m4-3v3" />
        <path d="M6 8h4v5H6zm8 0h4v5h-4z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const categories: { name: Category; icon: IconName }[] = [
  { name: "Placas-mãe", icon: "chip" },
  { name: "Monitores", icon: "monitor" },
  { name: "Processadores", icon: "chip" },
  { name: "Memórias", icon: "memory" },
  { name: "Teclados", icon: "keyboard" },
  { name: "Mouses", icon: "mouse" },
];
function ProductArt({ product, large = false }: { product: Product; large?: boolean }) {
  const id = `art-${product.id}-${large ? "large" : "small"}`;
  const isBoard = product.category === "Placas-mãe";
  return (
    <svg
      className={`product-art ${large ? "large" : ""}`}
      viewBox="0 0 320 210"
      role="img"
      aria-label={product.name}
    >
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#59616c" />
          <stop offset=".35" stopColor="#262c33" />
          <stop offset=".7" stopColor="#151b23" />
          <stop offset="1" stopColor="#414a55" />
        </linearGradient>
        <linearGradient id={`${id}-silver`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#eff2f4" />
          <stop offset=".5" stopColor="#9aa5af" />
          <stop offset="1" stopColor="#d5dde3" />
        </linearGradient>
        <linearGradient id={`${id}-screen`} x1="0" y1="1" x2="1" y2="0">
          <stop stopColor="#100d35" />
          <stop offset=".4" stopColor={product.id === 8 ? "#1c5f85" : "#2a174e"} />
          <stop offset=".65" stopColor={product.id === 8 ? "#7bc1d5" : "#b12b60"} />
          <stop offset="1" stopColor="#fa9265" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="7" floodOpacity=".18" />
        </filter>
      </defs>
      <ellipse cx="160" cy="186" rx="85" ry="8" fill="#172434" opacity=".07" />
      <g filter={`url(#${id}-shadow)`}>
        {isBoard && (
          <g transform="translate(83 15) rotate(-7 78 86)">
            <rect width="155" height="166" rx="3" fill="#242b30" stroke="#131c23" strokeWidth="3" />
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d={`M${7 + i * 12} 4v${20 + (i % 3) * 10}l14 14v90`}
                stroke="#68716f"
                strokeWidth=".7"
                opacity=".45"
                fill="none"
              />
            ))}
            <rect x="-7" y="8" width="22" height="79" rx="2" fill={`url(#${id}-silver)`} />
            {Array.from({ length: 7 }, (_, i) => (
              <rect key={i} x="-4" y={13 + i * 10} width="17" height="6" fill="#596169" />
            ))}
            <rect x="38" y="30" width="61" height="62" rx="3" fill="#929a9c" stroke="#c6cbcc" />
            <rect
              x="46"
              y="38"
              width="45"
              height="45"
              fill="#333a3e"
              stroke="#666c6a"
              strokeWidth="2"
            />
            <rect x="51" y="43" width="35" height="35" fill="#a7a9a0" />
            <path d="M95 38v48l-4 5" fill="none" stroke="#e5e3d8" strokeWidth="2" />
            {[110, 120, 130, 140].map((x) => (
              <g key={x}>
                <rect
                  x={x}
                  y="20"
                  width="6"
                  height="85"
                  fill="#10151a"
                  stroke="#697175"
                  strokeWidth=".5"
                />
                <path d={`M${x + 3} 27v69`} stroke={x === 120 ? "#a9aa9d" : "#51585c"} />
              </g>
            ))}
            <rect x="24" y="108" width="83" height="8" fill="#c1c5c2" />
            <rect x="24" y="110" width="77" height="4" fill="#383d3d" />
            <rect x="24" y="134" width="73" height="6" fill="#0b1216" />
            <rect x="24" y="150" width="73" height="6" fill="#0b1216" />
            <path d="m102 115 39 4v37l-39-8Z" fill={`url(#${id}-metal)`} />
            <path d="m107 122 29 4m-29 3 29 4m-29 3 29 4" stroke="#79818a" strokeWidth="1" />
            <text x="110" y="149" fill="#b8c3cb" fontSize="7" fontFamily="Arial">
              {product.brand}
            </text>
            {[18, 30, 42, 54, 66, 78].map((x, i) => (
              <circle key={i} cx={x} cy={i % 2 ? 99 : 13} r="3" fill="#8c9698" stroke="#e0ded0" />
            ))}
          </g>
        )}
        {product.category === "Monitores" && (
          <g transform="translate(38 28)">
            <path d="M112 117h20l5 39 34 12v4H73v-4l34-12Z" fill={`url(#${id}-metal)`} />
            <rect width="244" height="137" rx="4" fill="#1c2229" />
            <rect x="5" y="5" width="234" height="123" fill={`url(#${id}-screen)`} />
            <path
              d="M5 115C43 111 39 69 98 68S175 32 239 10v21c-65 13-75 53-135 56S58 124 5 127Z"
              fill="#ffffff"
              opacity=".13"
            />
            <path
              d="M5 100c60 20 100-80 234-57M5 110c80 6 84-65 234-55"
              stroke="#ffb6b8"
              fill="none"
              opacity=".3"
            />
            <text
              x="122"
              y="134"
              fill="#b9bec5"
              fontSize="5"
              textAnchor="middle"
              fontFamily="Arial"
            >
              {product.brand}
            </text>
          </g>
        )}
        {product.category === "Processadores" && (
          <g transform="translate(66 20) rotate(-7 90 80)">
            <path
              d="m0 17 105-8 42 23v128L41 172 0 146Z"
              fill={product.brand === "AMD" ? "#35383d" : "#164882"}
            />
            <path
              d="m0 17 41 23L147 32 105 9Z"
              fill={product.brand === "AMD" ? "#54575b" : "#2864a5"}
            />
            <path
              d="m41 40 106-8v128L41 172Z"
              fill={product.brand === "AMD" ? "#2c2d32" : "#12356a"}
            />
            {product.brand === "AMD" ? (
              <>
                <circle
                  cx="91"
                  cy="93"
                  r="35"
                  fill="none"
                  stroke="#e57926"
                  strokeWidth="11"
                  strokeDasharray="160 65"
                />
                <text
                  x="90"
                  y="98"
                  textAnchor="middle"
                  fill="white"
                  fontFamily="Arial"
                  fontWeight="bold"
                  fontSize="20"
                >
                  RYZEN
                </text>
                <text x="127" y="151" fill="#fbac62" fontSize="32" fontWeight="bold">
                  5
                </text>
              </>
            ) : (
              <>
                <text x="59" y="77" fill="white" fontSize="22" fontFamily="Arial">
                  intel
                </text>
                <text
                  x="58"
                  y="106"
                  fill="white"
                  fontSize="25"
                  fontWeight="bold"
                  fontFamily="Arial"
                >
                  CORE
                </text>
                <text x="111" y="148" fill="#7ed6fa" fontSize="29">
                  i5
                </text>
              </>
            )}
            <rect x="148" y="108" width="46" height="46" rx="3" fill="#50635d" stroke="#b0b5a3" />
            <rect x="152" y="112" width="38" height="37" rx="2" fill={`url(#${id}-silver)`} />
            <text x="171" y="130" fontSize="6" textAnchor="middle" fill="#60696c">
              {product.brand}
            </text>
          </g>
        )}
        {product.category === "Memórias" && (
          <g transform="translate(41 65) rotate(-12 120 40)">
            {[0, 31].map((y, idx) => (
              <g key={y} transform={`translate(${idx * 9} ${y})`}>
                <path d="M0 0h224v49H0Z" fill="#25352f" />
                <path d="M0 0h224v39H0Z" fill={`url(#${id}-metal)`} />
                <path
                  d="m5 0 20 13h171l22-13M5 35l20-14h171l22 14"
                  fill="none"
                  stroke="#7b8186"
                  strokeWidth="2"
                />
                <path d="M8 4h208" stroke="#acb2b6" />
                <text
                  x="111"
                  y="25"
                  textAnchor="middle"
                  fill="#e2e5e5"
                  fontFamily="Arial"
                  fontSize="13"
                  fontStyle="italic"
                  fontWeight="bold"
                >
                  {product.brand === "Kingston" ? "FURY" : "VENGEANCE"}
                </text>
                {Array.from({ length: 31 }, (_, i) => (
                  <rect key={i} x={5 + i * 7} y="41" width="4" height="7" fill="#c3a568" />
                ))}
              </g>
            ))}
          </g>
        )}
        {product.category === "Teclados" && (
          <g transform="translate(25 58) rotate(-7 140 45)">
            <path d="m0 7 265-7 9 91-268 7Z" fill="#141b24" stroke="#49515c" strokeWidth="2" />
            {Array.from({ length: 5 }, (_, r) =>
              Array.from({ length: r === 4 ? 9 : 15 }, (_, c) => (
                <g key={`${r}-${c}`}>
                  <rect
                    x={8 + c * (r === 4 ? 28 : 17)}
                    y={12 + r * 15}
                    width={r === 4 ? 24 : 13}
                    height="11"
                    rx="1"
                    fill="#30343d"
                    stroke={["#da656e", "#bc6cda", "#537add", "#2da5b2", "#62ad86"][r]}
                    strokeWidth=".8"
                  />
                  <path
                    d={`M${11 + c * (r === 4 ? 28 : 17)} ${15 + r * 15}h3`}
                    stroke="#c9cad5"
                    strokeWidth=".8"
                  />
                </g>
              )),
            )}
          </g>
        )}
        {product.category === "Mouses" && (
          <g transform="translate(112 23) rotate(15 50 80)">
            <path
              d="M1 73C1 28 14 5 47 5S99 28 99 73l-4 52c-4 50-83 50-89 0Z"
              fill={`url(#${id}-metal)`}
              stroke="#131a20"
              strokeWidth="2"
            />
            <path d="M47 5v69M3 69c22 8 66 8 94 0" fill="none" stroke="#080f15" strokeWidth="2" />
            <rect x="41" y="25" width="13" height="28" rx="6" fill="#0b1019" stroke="#616978" />
            <path d="M8 126c9 39 77 39 84-1" fill="none" stroke="#7884ef" strokeWidth="3" />
            <path
              d="M59 101a15 15 0 1 0 0 19v-10H47"
              stroke="#6c98f0"
              strokeWidth="4"
              fill="none"
            />
            <path d="M47 5V-9" stroke="#171b22" strokeWidth="4" />
          </g>
        )}
      </g>
    </svg>
  );
}

const emptyCart: Cart = { id: null, expired: false, expiresAt: null, items: [] };
const technicalFields = (category: string) =>
  category === "Placas-mãe"
    ? ["Soquete", "Chipset", "Tipo de memória"]
    : category === "Monitores"
      ? ["Tipo de painel", "Taxa de atualização"]
      : [];
const optionalSpecs: Partial<Record<Category, string[]>> = {
  "Placas-mãe": ["Formato"],
  Monitores: ["Resolução", "Tempo de resposta"],
  Processadores: ["Soquete", "Núcleos", "Threads", "Clock máximo"],
  Memórias: ["Capacidade", "Tipo de memória", "Frequência"],
  Teclados: ["Switch", "Layout", "Iluminação", "Conexão"],
  Mouses: ["Sensor", "Resolução", "Botões", "Conexão"],
};
type LoadStatus = "loading" | "ready" | "error";
type ProductDraft = Parameters<typeof catalog.save>[0];

const mergeProducts = (old: Product[], incoming: Product[]) => {
  const merged = new Map(old.map((product) => [product.id, product]));
  incoming.forEach((product) => merged.set(product.id, product));
  return [...merged.values()];
};
const catalogErrorMessage = (error: unknown) =>
  error instanceof CatalogError ? error.message : "Catálogo indisponível. Tente novamente.";

export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "catalogo");
  const isAdmin = route.startsWith("admin/");
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>("loading");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [catalogPage, setCatalogPage] = useState({ items: [] as Product[], total: 0 });
  const [filters, setFilters] = useState<CatalogFilters>({ counts: {}, specs: {}, maxPrice: 0 });
  const [details, setDetails] = useState<{ id: number; status: LoadStatus; product?: Product }>();
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [pendingProduct, setPendingProduct] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminAccess, setAdminAccess] = useState<"pending" | "allowed" | "denied" | "error">("pending");
  const [cartState, setCartState] = useState<{ owner: string; data: Cart; status: LoadStatus }>();
  const [cartAttempt, setCartAttempt] = useState(0);
  const [cartBusy, setCartBusy] = useState(false);
  const lastCartActivity = useRef<{ id: string; at: number }>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [minPrice, setMinPrice] = useState("");
  const [tech, setTech] = useState<Record<string, string[]>>({});
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("relevance");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [returnTo, setReturnTo] = useState("catalogo");
  const [confirmRemove, setConfirmRemove] = useState<Product | null>(null);
  const [demo, setDemo] = useState(false);
  const priceLimit = Math.max(2000, Math.ceil(filters.maxPrice / 10) * 10);
  const isCatalog = route === "catalogo";
  const isCart = route === "carrinho";
  const isStock = route === "admin/estoque";
  const cartOwner = user?.role === "client" ? user.id : undefined;
  const detailId = route.startsWith("produto/") ? Number(route.split("/")[1]) || 0 : null;
  const detailStatus = details && details.id === detailId ? details.status : "loading";
  const selected = details && details.id === detailId ? details.product : undefined;
  const loadingCatalog = isCatalog ? catalogStatus === "loading" : !isAdmin && detailStatus === "loading";
  const catalogTotal = Object.values(filters.counts).reduce((sum, count) => sum + count, 0);
  const availableSpecs = filters.specs[category] ?? {};
  const retryCatalog = () => {
    setCatalogStatus("loading");
    setCatalogAttempt((attempt) => attempt + 1);
  };
  const catalogFeedback = (
    <div className="empty-state">
      {loadingCatalog ? (
        <p role="status">Carregando produtos do catálogo…</p>
      ) : (
        <>
          <p role="alert">Não foi possível carregar o catálogo.</p>
          <button className="primary" onClick={retryCatalog}>
            Tentar novamente
          </button>
        </>
      )}
    </div>
  );
  const ownCart = cartState?.owner === cartOwner ? cartState : undefined;
  const cart = ownCart?.data ?? emptyCart;
  const cartStatus = ownCart?.status ?? "loading";
  const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const affectedItems = cart.items.filter((item) => !item.product?.active);
  const cartTotal = cart.items.reduce((sum, item) => sum + (item.product?.price ?? 0) * item.quantity, 0);
  const available = (p: Product) => Math.max(0, p.total - p.baseReserved);
  const notify = (message: string) => setToast(message);
  const go = (path: string) => {
    location.hash = path;
    setRoute(path);
    window.scrollTo({ top: 0, behavior: "instant" });
    setFiltersOpen(false);
  };
  const logout = async () => {
    try {
      await auth.logout();
      setUser(null);
      setCartState(undefined);
      setAdminProducts([]);
      setAdminAccess("pending");
      go("catalogo");
      notify("Você saiu da sua conta.");
    } catch {
      notify("Não foi possível sair. Tente novamente.");
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    auth.me(controller.signal).then((account) => {
      if (!controller.signal.aborted) setUser(account);
    }).catch((error) => {
      if (!controller.signal.aborted && !(error instanceof AuthError && error.status === 401)) {
        setToast("Não foi possível verificar sua sessão.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setAuthLoading(false);
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!isAdmin || user?.role !== "admin") return;
    const controller = new AbortController();
    setAdminAccess("pending");
    catalog.adminList(controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setAdminProducts(items);
      setAdminAccess("allowed");
    }).catch((error) => {
      if (controller.signal.aborted) return;
      const denied = error instanceof CatalogError && (error.status === 401 || error.status === 403);
      setAdminAccess(denied ? "denied" : "error");
    });
    return () => controller.abort();
  }, [isAdmin, isStock, user, catalogAttempt]);
  useEffect(() => {
    const handler = () => {
      setRoute(location.hash.slice(1) || "catalogo");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (!isCatalog) return;
    const controller = new AbortController();
    setCatalogStatus("loading");
    catalog.list({ search, category, minPrice, maxPrice, onlyAvailable, tech, sort, page }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, Math.ceil(result.total / catalogPageSize));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setCatalogPage(result);
        setCatalogStatus("ready");
      }).catch((error) => {
        if (!controller.signal.aborted) {
          setCatalogStatus("error");
          if (error instanceof CatalogError && error.status === 422) setToast(catalogErrorMessage(error));
        }
      });
    return () => controller.abort();
  }, [isCatalog, search, category, minPrice, maxPrice, onlyAvailable, tech, sort, page, catalogAttempt]);

  useEffect(() => {
    if (!isCatalog) return;
    const controller = new AbortController();
    catalog.filters(controller.signal).then((data) => {
      if (!controller.signal.aborted) setFilters(data);
    }).catch(() => {
      if (!controller.signal.aborted) setToast("Não foi possível carregar as opções de filtro.");
    });
    return () => controller.abort();
  }, [isCatalog, catalogAttempt]);

  useEffect(() => {
    if (detailId === null) return;
    const controller = new AbortController();
    setDetails({ id: detailId, status: "loading" });
    catalog.details(detailId, controller.signal).then((product) => {
      if (controller.signal.aborted) return;
      setDetails({ id: detailId, status: "ready", product });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error instanceof CatalogError && error.status === 404) {
        setDetails({ id: detailId, status: "ready" });
      } else {
        setDetails({ id: detailId, status: "error" });
      }
    });
    return () => controller.abort();
  }, [detailId, catalogAttempt]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  useEffect(() => {
    if (!cartOwner) return;
    const controller = new AbortController();
    setCartState((previous) => ({
      owner: cartOwner,
      data: previous?.owner === cartOwner ? previous.data : emptyCart,
      status: "loading",
    }));
    purchases.cart(controller.signal).then((data) => {
      if (!controller.signal.aborted) setCartState({ owner: cartOwner, data, status: "ready" });
    }).catch(() => {
      if (!controller.signal.aborted)
        setCartState((previous) => previous?.owner === cartOwner
          ? { ...previous, status: "error" }
          : { owner: cartOwner, data: emptyCart, status: "error" });
    });
    return () => controller.abort();
  }, [cartOwner, isCart, cartAttempt]);
  useEffect(() => {
    if (!isCart || !cartOwner || !cart.id) return;
    // Poll reads both expiration and product status without renewing the reservation.
    const timer = window.setInterval(() => setCartAttempt((attempt) => attempt + 1), 15_000);
    return () => window.clearInterval(timer);
  }, [isCart, cartOwner, cart.id]);
  useEffect(() => {
    if (!cartOwner || !cart.id) return;
    const cartId = cart.id;
    const markActivity = (event: Event) => {
      if (!event.isTrusted) return;
      const now = Date.now();
      const previous = lastCartActivity.current;
      if (previous?.id === cartId && now - previous.at < 10_000) return;
      lastCartActivity.current = { id: cartId, at: now };
      void purchases.touch(cartId).catch((error) => {
        if (error instanceof CartError && error.status === 409)
          setCartAttempt((attempt) => attempt + 1);
      });
    };
    window.addEventListener("click", markActivity, true);
    window.addEventListener("keydown", markActivity, true);
    window.addEventListener("popstate", markActivity);
    return () => {
      window.removeEventListener("click", markActivity, true);
      window.removeEventListener("keydown", markActivity, true);
      window.removeEventListener("popstate", markActivity);
    };
  }, [cartOwner, cart.id]);
  useEffect(() => {
    setPage(1);
  }, [search, category, maxPrice, minPrice, tech, onlyAvailable, sort]);
  const resetFilters = () => {
    setSearch("");
    setCategory("");
    setMaxPrice(null);
    setMinPrice("");
    setTech({});
    setOnlyAvailable(false);
    setPage(1);
  };
  const changeCategory = (value: Category | "") => {
    setCategory(value);
    setTech({});
  };
  const pageCount = Math.ceil(catalogPage.total / catalogPageSize);
  const firstPageLink = Math.max(1, Math.min(page - 2, pageCount - 4));
  const updateProduct = (product: Product) => {
    setAdminProducts((old) => {
      const previous = old.find((item) => item.id === product.id);
      return mergeProducts(old, [previous
        ? { ...product, total: previous.total, baseReserved: previous.baseReserved }
        : product]);
    });
  };
  const saveProduct = async (product: ProductDraft) => {
    updateProduct(await catalog.save(product));
    notify("Produto salvo no catálogo.");
    go("admin/produtos");
  };
  const changeProductStatus = async (product: Product, active: boolean) => {
    if (pendingProduct) return;
    setPendingProduct(true);
    try {
      const updated = await (active ? catalog.reactivate(product.id) : catalog.remove(product.id));
      updateProduct(updated);
      setConfirmRemove(null);
      notify(active ? "Produto reativado no catálogo." : "Produto removido. Histórico preservado.");
    } catch (error) {
      notify(catalogErrorMessage(error));
    } finally {
      setPendingProduct(false);
    }
  };
  const activeFilters =
    Number(!!category) +
    Number(maxPrice !== null || !!minPrice) +
    Object.values(tech).reduce((n, list) => n + list.length, 0) +
    Number(onlyAvailable);
  const login = (origin = "catalogo") => {
    setReturnTo(origin);
    go("login");
  };
  const updateCart = async (id: number, quantity: number, added = false) => {
    if (!cartOwner || cartBusy || cartStatus !== "ready") return;
    setCartBusy(true);
    try {
      await purchases.setQuantity(cart.id, id, quantity);
      if (added) {
        notify("Produto adicionado ao carrinho e reservado.");
        go("carrinho");
      } else if (!quantity) {
        notify("Produto removido. A reserva foi liberada.");
      }
    } catch (error) {
      notify(error instanceof CartError ? error.message : "Não foi possível atualizar o carrinho.");
      if (error instanceof CartError && error.status === 409)
        setCatalogAttempt((attempt) => attempt + 1);
    } finally {
      setCartState((previous) => previous?.owner === cartOwner
        ? { ...previous, status: "loading" }
        : previous);
      setCartAttempt((attempt) => attempt + 1);
      setCartBusy(false);
    }
  };
  const startNewCart = async () => {
    if (cartBusy) return;
    setCartBusy(true);
    try {
      await purchases.start();
      setCartState((previous) => previous?.owner === cartOwner && previous
        ? { ...previous, status: "loading" }
        : previous);
      setCartAttempt((attempt) => attempt + 1);
      go("catalogo");
    } catch (error) {
      notify(error instanceof CartError ? error.message : "Não foi possível iniciar outro carrinho.");
    } finally {
      setCartBusy(false);
    }
  };
  const addToCart = (p: Product) => {
    if (!user) {
      login(`produto/${p.id}`);
      return;
    }
    if (user.role === "admin") {
      notify("Entre com uma conta de cliente para reservar produtos.");
      return;
    }
    if (cart.expired) {
      go("carrinho");
      return;
    }
    const current = cart.items.find((i) => i.id === p.id)?.quantity || 0;
    void updateCart(p.id, current + 1, true);
  };
  function StockBadge({ product }: { product: Product }) {
    const ok = available(product) > 0;
    return (
      <span className={`stock-badge ${ok ? "in-stock" : "out-stock"}`}>
        <span />
        {ok ? "Disponível" : "Indisponível"}
      </span>
    );
  }
  const filterPanel = (
    <>
      <div className="filter-heading">
        <h3>
          <Icon name="filter" size={18} /> Filtros{" "}
          {activeFilters > 0 && <span className="count-badge">{activeFilters}</span>}
        </h3>
        <button className="text-button" onClick={resetFilters}>
          Limpar
        </button>
      </div>
      <section className="filter-section">
        <h4>
          Categorias <span>−</span>
        </h4>
        <label className="filter-option">
          <input
            type="radio"
            name="category"
            checked={!category}
            onChange={() => changeCategory("")}
          />
          <span>Todas as categorias</span>
          <small>{catalogTotal}</small>
        </label>
        {categories.map((c) => (
          <label className={`filter-option ${category === c.name ? "selected" : ""}`} key={c.name}>
            <input
              type="radio"
              name="category"
              checked={category === c.name}
              onChange={() => changeCategory(c.name)}
            />
            <span>{c.name}</span>
            <small>{filters.counts[c.name] ?? 0}</small>
          </label>
        ))}
      </section>
      <section className="filter-section">
        <h4>
          Faixa de preço <span>−</span>
        </h4>
        <div className="price-inputs">
          <label>
            <span>De</span>
            <div>
              R${" "}
              <input
                aria-label="Preço mínimo"
                type="number"
                min="0"
                step="0.01"
                max={maxPrice ?? undefined}
                value={minPrice}
                placeholder="0"
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </div>
          </label>
          <span>—</span>
          <label>
            <span>Até</span>
            <div>
              R${" "}
              <input
                aria-label="Preço máximo"
                type="number"
                min="0"
                step="0.01"
                value={maxPrice ?? ""}
                placeholder="Sem limite"
                onChange={(e) =>
                  setMaxPrice(e.target.value ? Math.max(0, e.target.valueAsNumber) : null)
                }
              />
            </div>
          </label>
        </div>
        <input
          className="price-range"
          aria-label="Limite de preço"
          type="range"
          min="0"
          max={priceLimit}
          step="10"
          value={Math.min(maxPrice ?? priceLimit, priceLimit)}
          onChange={(e) =>
            setMaxPrice(e.target.valueAsNumber === priceLimit ? null : e.target.valueAsNumber)
          }
        />
        <div className="range-labels">
          <span>R$ 0</span>
          <span>{money(priceLimit)}</span>
        </div>
      </section>
      {Object.entries(availableSpecs).map(([field, values]) => (
            <section className="filter-section" key={field}>
              <h4>
                {field} <span>−</span>
              </h4>
              {values.map((value) => (
                  <label className="filter-option" key={value}>
                    <input
                      type="checkbox"
                      checked={(tech[field] || []).includes(value)}
                      onChange={(e) =>
                        setTech((old) => ({
                          ...old,
                          [field]: e.target.checked
                            ? [...(old[field] || []), value]
                            : (old[field] || []).filter((v) => v !== value),
                        }))
                      }
                    />
                    <span>{value}</span>
                  </label>
                ))}
            </section>
          ))}
      <section className="filter-section">
        <h4>
          Disponibilidade <span>−</span>
        </h4>
        <label className="filter-option">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
          />
          <span>Apenas disponíveis</span>
        </label>
      </section>
      <div className="filter-note">
        <Icon name="info" size={18} />
        <p>
          Encontre a peça certa.
          <br />
          <span>Combine os filtros para refinar sua busca.</span>
        </p>
      </div>
    </>
  );

  return (
    <div className="app">
      <div className="top-strip">
        <div className="container">
          <span>Seu próximo upgrade começa aqui.</span>
          <span>
            <Icon name="shield" size={13} /> Tecnologia com informação e confiança
          </span>
        </div>
      </div>
      <header className="main-header">
        <div className="container header-inner">
          <button
            className="brand"
            onClick={() => go("catalogo")}
            aria-label="TechParts, página inicial"
          >
            <span className="brand-mark">
              <Icon name="chip" size={25} />
            </span>
            Tech<span>Parts</span>
            <span className="brand-dot">.</span>
          </button>
          <form
            className="header-search"
            onSubmit={(e) => {
              e.preventDefault();
              go("catalogo");
            }}
          >
            <Icon name="search" />
            <input
              placeholder="O que você procura para o seu setup?"
              aria-label="Buscar produtos"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (route !== "catalogo") go("catalogo");
              }}
            />
            <button type="submit" aria-label="Buscar">
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <div className="header-actions">
            <button
              className="account-button"
              onClick={() =>
                user ? go(user.role === "admin" ? "admin/produtos" : "conta") : login(route)
              }
            >
              <Icon name="user" size={23} />
              <span>
                <small>{user ? `Olá, ${user.name.split(" ")[0]}` : "Olá, visitante"}</small>
                <strong>
                  {user
                    ? user.role === "admin"
                      ? "Administração"
                      : "Minha conta"
                    : "Entre ou cadastre-se"}
                </strong>
              </span>
            </button>
            <span className="header-divider" />
            <button
              className="cart-button"
              onClick={() => (user?.role === "client" ? go("carrinho") : login("carrinho"))}
              aria-label={`Meu carrinho, ${cartCount} itens`}
            >
              <span className="cart-icon">
                <Icon name="cart" size={24} />
                <b>{cartCount}</b>
              </span>
              <span>Carrinho</span>
            </button>
          </div>
        </div>
      </header>
      <nav className="category-nav">
        <div className="container">
          <button
            className={!category && route === "catalogo" ? "active" : ""}
            onClick={() => {
              changeCategory("");
              go("catalogo");
            }}
          >
            <Icon name="grid" size={16} /> Todos os produtos
          </button>
          <span className="nav-divider" />
          {categories.map((c) => (
            <button
              key={c.name}
              className={category === c.name ? "active" : ""}
              onClick={() => {
                changeCategory(c.name);
                go("catalogo");
              }}
            >
              <Icon name={c.icon} size={17} />
              {c.name}
            </button>
          ))}
          <button className="demo-nav" onClick={() => setDemo(true)}>
            <Icon name="info" size={15} /> Sobre o protótipo
          </button>
        </div>
      </nav>

      {route === "catalogo" && (
        <main className="container catalog-page">
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">
                <span /> PERFORMANCE PARA CADA POSSIBILIDADE
              </span>
              <h1>
                Grandes ideias.
                <br />O setup <span>certo.</span>
              </h1>
              <p>
                Componentes e periféricos para transformar
                <br className="desktop-break" /> o que você imagina no que você faz.
              </p>
              <button
                onClick={() =>
                  document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Encontre seu próximo upgrade <Icon name="arrow" size={18} />
              </button>
              <div className="hero-bottom">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="hero-image">
              <img
                src="/images/hero-tech.png"
                alt="Componentes de computador com iluminação azul em um estúdio"
              />
            </div>
            <div className="hero-tag">
              <span>SEU SETUP, SEM LIMITES</span>
              <strong>Escolha cada detalhe.</strong>
            </div>
            <div className="hero-grid" />
          </section>
          <section className="benefits">
            <div>
              <span className="benefit-icon">
                <Icon name="chip" />
              </span>
              <p>
                <strong>Tecnologia que faz sentido</strong>
                <span>Especificações claras, escolhas melhores</span>
              </p>
            </div>
            <div>
              <span className="benefit-icon">
                <Icon name="clock" />
              </span>
              <p>
                <strong>Preço com transparência</strong>
                <span>Consulte o histórico de cada produto</span>
              </p>
            </div>
            <div>
              <span className="benefit-icon">
                <Icon name="shield" />
              </span>
              <p>
                <strong>Seu upgrade, no seu tempo</strong>
                <span>Reserve seus itens no carrinho</span>
              </p>
            </div>
          </section>
          <div className="catalog-title" id="catalog">
            <div>
              <div className="section-kicker">EXPLORE. COMPARE. ESCOLHA.</div>
              <h2>Encontre a próxima peça.</h2>
              <p>Tudo o que seu setup precisa, em um só lugar.</p>
            </div>
            {catalogStatus === "ready" && (
              <span className="catalog-total">
                {catalogTotal} produtos no catálogo
              </span>
            )}
          </div>
          <div className="catalog-layout">
            <aside className={`filters ${filtersOpen ? "mobile-open" : ""}`}>
              <div className="mobile-filter-title">
                <strong>Refine sua busca</strong>
                <button
                  className="icon-button"
                  aria-label="Fechar filtros"
                  onClick={() => setFiltersOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
              {filterPanel}
              <button className="primary mobile-apply" onClick={() => setFiltersOpen(false)}>
                Mostrar {catalogPage.total} produtos
              </button>
            </aside>
            {filtersOpen && (
              <div className="filter-backdrop" onClick={() => setFiltersOpen(false)} />
            )}
            <section className="catalog-results">
              <div className="results-toolbar">
                <div>
                  <button
                    className="secondary mobile-filter-button"
                    onClick={() => setFiltersOpen(true)}
                  >
                    <Icon name="filter" size={17} /> Filtros{" "}
                    {activeFilters > 0 && `(${activeFilters})`}
                  </button>
                  {catalogStatus === "ready" && (
                    <p>
                      <strong>{catalogPage.total}</strong>{" "}
                      {catalogPage.total === 1 ? "produto encontrado" : "produtos encontrados"}
                      {search && <> para “{search}”</>}
                    </p>
                  )}
                </div>
                <label>
                  Ordenar por:{" "}
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    aria-label="Ordenar produtos"
                  >
                    <option value="relevance">Relevância</option>
                    <option value="low">Menor preço</option>
                    <option value="high">Maior preço</option>
                    <option value="name">Nome A–Z</option>
                  </select>
                </label>
              </div>
              {activeFilters > 0 && (
                <div className="filter-chips">
                  {category && (
                    <button onClick={() => changeCategory("")}>
                      {category}
                      <Icon name="close" size={13} />
                    </button>
                  )}
                  {Object.entries(tech).flatMap(([f, vs]) =>
                    vs.map((v) => (
                      <button
                        key={f + v}
                        onClick={() => setTech((t) => ({ ...t, [f]: t[f].filter((x) => x !== v) }))}
                      >
                        {v}
                        <Icon name="close" size={13} />
                      </button>
                    )),
                  )}
                  {(maxPrice !== null || minPrice) && (
                    <button
                      onClick={() => {
                        setMinPrice("");
                        setMaxPrice(null);
                      }}
                    >
                      Faixa de preço <Icon name="close" size={13} />
                    </button>
                  )}
                  {onlyAvailable && (
                    <button onClick={() => setOnlyAvailable(false)}>
                      Disponíveis <Icon name="close" size={13} />
                    </button>
                  )}
                </div>
              )}
              {catalogStatus !== "ready" ? catalogFeedback : catalogPage.items.length ? (
                <>
                  <div className="product-grid">
                    {catalogPage.items.map((p) => (
                      <article
                        className={`product-card ${available(p) === 0 ? "unavailable-card" : ""}`}
                        key={p.id}
                      >
                        <button
                          className="product-image"
                          onClick={() => go(`produto/${p.id}`)}
                          aria-label={`Ver ${p.name}`}
                        >
                          {p.badge && (
                            <span
                              className={`product-tag ${p.badge === "Destaque" ? "blue-tag" : ""}`}
                            >
                              {p.badge}
                            </span>
                          )}
                          <ProductArt product={p} />
                        </button>
                        <div className="product-info">
                          <div className="product-category">
                            {p.category}
                            <span>{p.brand}</span>
                          </div>
                          <button className="product-name" onClick={() => go(`produto/${p.id}`)}>
                            {p.name}
                          </button>
                          <p className="product-specs">
                            {Object.values(p.specs).slice(0, 3).join(" · ")}
                          </p>
                          <StockBadge product={p} />
                          <div className="product-price">{money(p.price)}</div>
                          <span className="price-caption">Preço atual por unidade</span>
                          <button className="details-button" onClick={() => go(`produto/${p.id}`)}>
                            Ver detalhes
                            <Icon name="arrow" size={17} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="pagination">
                    <span>
                      Mostrando {Math.min((page - 1) * catalogPageSize + 1, catalogPage.total)}–
                      {Math.min(page * catalogPageSize, catalogPage.total)} de {catalogPage.total} produtos
                    </span>
                    <div>
                      <button
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                        aria-label="Página anterior"
                      >
                        <Icon name="chevron" className="rotate" size={15} />
                      </button>
                      {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => firstPageLink + i).map((number) => (
                        <button
                          key={number}
                          className={page === number ? "current" : ""}
                          aria-current={page === number ? "page" : undefined}
                          onClick={() => {
                            setPage(number);
                            document
                              .getElementById("catalog")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          {number}
                        </button>
                      ))}
                      <button
                        disabled={page >= pageCount}
                        onClick={() => {
                          setPage(page + 1);
                          document
                            .getElementById("catalog")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                        aria-label="Próxima página"
                      >
                        <Icon name="chevron" size={15} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <span className="empty-icon">
                    <Icon name="search" size={32} />
                  </span>
                  <h3>Nenhuma peça por aqui.</h3>
                  <p>
                    Não encontramos produtos com esses filtros.
                    <br />
                    Tente outra busca ou explore todo o catálogo.
                  </p>
                  <button className="primary" onClick={resetFilters}>
                    Limpar filtros
                  </button>
                </div>
              )}
            </section>
          </div>
          <div className="bottom-banner">
            <span className="benefit-icon">
              <Icon name="info" size={24} />
            </span>
            <div>
              <strong>Uma boa escolha começa com informação.</strong>
              <p>
                Compare especificações e acompanhe o histórico de preços antes de montar seu setup.
              </p>
            </div>
            <Icon name="arrow" size={24} />
          </div>
        </main>
      )}

      {route.startsWith("produto/") && (
        <main className="container inner-page">
          <Breadcrumb
            items={[
              "Catálogo",
              selected?.category || "Produto",
              selected?.name || (detailStatus === "ready" ? "Não encontrado" : "Detalhes"),
            ]}
            go={() => go("catalogo")}
          />
          {detailStatus !== "ready" ? catalogFeedback : selected?.active ? (
            <>
              <div className="product-detail">
                <div className="detail-art">
                  <ProductArt product={selected} large />
                  <div className="detail-art-caption">
                    <Icon name="info" size={14} /> Imagem ilustrativa do produto
                  </div>
                </div>
                <div className="detail-info">
                  <span className="section-kicker">
                    {selected.brand} · {selected.category}
                  </span>
                  <h1>{selected.name}</h1>
                  <StockBadge product={selected} />
                  <p>{selected.description}</p>
                  <div className="detail-spec-chips">
                    {Object.entries(selected.specs)
                      .slice(0, 3)
                      .map(([k, v]) => (
                        <span key={k}>{v}</span>
                      ))}
                  </div>
                  <div className="detail-price">{money(selected.price)}</div>
                  <span className="price-caption">
                    Preço atual por unidade · sem custos adicionais na reserva
                  </span>
                  <button
                    className="primary add-button"
                    disabled={!available(selected) || authLoading || cartBusy ||
                      (user?.role === "client" && cartStatus !== "ready")}
                    onClick={() => addToCart(selected)}
                  >
                    <Icon name="cart" />
                    {available(selected) ? "Adicionar ao carrinho" : "Produto indisponível"}
                  </button>
                  <div className="reservation-note">
                    <Icon name="clock" size={17} /> Reservas expiram após 30 minutos de inatividade.
                  </div>
                  {user?.role === "client" && cartStatus === "error" && (
                    <button className="text-button" onClick={() => setCartAttempt((attempt) => attempt + 1)}>
                      Tentar carregar o carrinho novamente
                    </button>
                  )}
                  {!user && available(selected) > 0 && (
                    <small>Você precisará entrar na sua conta para reservar.</small>
                  )}
                </div>
              </div>
              <div className="detail-sections">
                <section className="surface">
                  <div className="surface-heading">
                    <h2>Especificações técnicas</h2>
                    <Icon name="chip" />
                  </div>
                  <table>
                    <tbody>
                      <tr>
                        <th>Marca</th>
                        <td>{selected.brand}</td>
                      </tr>
                      <tr>
                        <th>Categoria</th>
                        <td>{selected.category}</td>
                      </tr>
                      {Object.entries(selected.specs).map(([k, v]) => (
                        <tr key={k}>
                          <th>{k}</th>
                          <td>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <ProductHistory key={selected.id} productId={selected.id} />
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Icon name="box" size={40} />
              <h1>Produto removido do catálogo</h1>
              <p>Este produto não está mais disponível para novas reservas.</p>
              <button className="primary" onClick={() => go("catalogo")}>
                Voltar ao catálogo
              </button>
            </div>
          )}
        </main>
      )}

      {(route === "login" || route === "cadastro") && authLoading && (
        <p className="container inner-page" role="status">Verificando sessão…</p>
      )}
      {(route === "login" || route === "cadastro") && !authLoading && (
        <AuthForm
          key={route}
          signup={route === "cadastro"}
          onSwitch={() => go(route === "login" ? "cadastro" : "login")}
          onSuccess={(account) => {
            setAdminAccess("pending");
            setUser(account);
            notify(
              `Bem-vindo${account.role === "admin" ? "" : "(a)"}, ${account.name.split(" ")[0]}!`,
            );
            go(
              account.role === "admin"
                ? returnTo.startsWith("admin/") ? returnTo : "admin/produtos"
                : returnTo.startsWith("admin") || ["login", "cadastro", "conta"].includes(returnTo)
                  ? "catalogo"
                  : returnTo,
            );
          }}
        />
      )}

      {route === "conta" && (
        <main className="container inner-page narrow">
          <Breadcrumb items={["Catálogo", "Minha conta"]} go={() => go("catalogo")} />
          <section className="surface account-surface">
            <Icon name="user" size={36} />
            <h1>Minha conta</h1>
            <h3>{user?.name}</h3>
            <p>{user?.email}</p>
            <button className="primary" onClick={() => go("carrinho")}>
              Abrir meu carrinho
              <Icon name="cart" size={18} />
            </button>
            <button
              className="secondary"
              onClick={logout}
            >
              <Icon name="logout" size={17} /> Sair da conta
            </button>
          </section>
        </main>
      )}

      {isCart && (
        <main className="container inner-page">
          <Breadcrumb items={["Catálogo", "Meu carrinho"]} go={() => go("catalogo")} />
          <div className="page-heading">
            <div>
              <span className="section-kicker">SEU PRÓXIMO UPGRADE</span>
              <h1>
                Meu carrinho<span className="title-count">{cartCount}</span>
              </h1>
              <p>Suas escolhas, reservadas para você.</p>
            </div>
            <button className="text-button" onClick={() => go("catalogo")}>
              Continuar navegando
              <Icon name="arrow" size={16} />
            </button>
          </div>
          {authLoading || (user?.role === "client" && !ownCart?.data.items.length && cartStatus === "loading") ? (
            <div className="empty-state surface" role="status">Carregando carrinho…</div>
          ) : user?.role !== "client" ? (
            <div className="empty-state surface">
              <Icon name="user" size={36} />
              <h2>Seu carrinho é pessoal.</h2>
              <p>Entre com uma conta de cliente para reservar seus produtos.</p>
              <button className="primary" onClick={() => login("carrinho")}>
                Entrar na minha conta
              </button>
            </div>
          ) : (
            <>
              {cartStatus === "error" && (
                <div className="alert warning" role="alert">
                  <p>Não foi possível carregar o carrinho.</p>
                  <button className="secondary" onClick={() => setCartAttempt((attempt) => attempt + 1)}>
                    Tentar novamente
                  </button>
                </div>
              )}
              {cartStatus === "ready" && cart.expired && (
                <div className="alert warning" role="status">
                  <Icon name="clock" />
                  <div>
                    <strong>Seu carrinho expirou.</strong>
                    <p>As unidades reservadas foram liberadas após 30 minutos de inatividade.</p>
                  </div>
                  <button className="secondary" disabled={cartBusy} onClick={startNewCart}>
                    Iniciar novo carrinho
                  </button>
                </div>
              )}
              {!!affectedItems.length && (
                <div className="alert warning" role="status">
                  <Icon name="info" />
                  <div>
                    <strong>Há produtos removidos do catálogo neste carrinho.</strong>
                    <p>{affectedItems.map((item) => item.product?.name ?? `Produto ${item.id}`).join(", ")}</p>
                  </div>
                </div>
              )}
              {cart.items.length ? (
                <>
                  <div className="cart-layout">
                    <div className="cart-items">
                      {cart.items.map((item) => {
                        const p = item.product;
                        if (!p) return (
                          <article className="cart-item surface" key={item.id}>
                            <div className="cart-item-info">
                              <p>Produto removido do catálogo</p>
                              <button
                                className="remove-link"
                                disabled={cartBusy || cartStatus !== "ready"}
                                onClick={() => void updateCart(item.id, 0)}
                              >Remover</button>
                            </div>
                          </article>
                        );
                        return (
                          <article className="cart-item surface" key={item.id}>
                            <div className="cart-art">
                              <ProductArt product={p} />
                            </div>
                            <div className="cart-item-info">
                              <span className="product-category">{p.category}</span>
                              <button
                                className="product-name"
                                onClick={() => go(`produto/${p.id}`)}
                              >
                                {p.name}
                              </button>
                              <p>
                                {money(p.price)} <span>/ unidade</span>
                              </p>
                              {!p.active && (
                                <span className="removed-label">
                                  Produto removido do catálogo · remova o item
                                </span>
                              )}
                              <button
                                className="remove-link"
                                disabled={cartBusy || cartStatus !== "ready"}
                                onClick={() => void updateCart(p.id, 0)}
                              >
                                <Icon name="trash" size={14} />
                                Remover
                              </button>
                            </div>
                            <div className="cart-quantity">
                              <div className="stepper">
                                <button
                                  aria-label={`Diminuir quantidade de ${p.name}`}
                                  disabled={item.quantity <= 1 || cartBusy || cartStatus !== "ready"}
                                  onClick={() => updateCart(p.id, item.quantity - 1)}
                                >
                                  <Icon name="minus" size={14} />
                                </button>
                                <input
                                  key={item.quantity}
                                  aria-label={`Quantidade de ${p.name}`}
                                  type="number"
                                  min="1"
                                  max="1000000"
                                  defaultValue={item.quantity}
                                  disabled={!p.active || cartBusy || cartStatus !== "ready"}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                  }}
                                  onBlur={(e) => {
                                    const quantity = e.currentTarget.valueAsNumber;
                                    e.currentTarget.value = String(item.quantity);
                                    if (quantity !== item.quantity && Number.isInteger(quantity) &&
                                        quantity >= 1 && quantity <= 1_000_000) {
                                      void updateCart(p.id, quantity);
                                    }
                                  }}
                                />
                                <button
                                  aria-label={`Aumentar quantidade de ${p.name}`}
                                  disabled={!p.active || cartBusy || cartStatus !== "ready"}
                                  onClick={() => updateCart(p.id, item.quantity + 1)}
                                >
                                  <Icon name="plus" size={14} />
                                </button>
                              </div>
                              <small>Subtotal</small>
                              <strong>{money(p.price * item.quantity)}</strong>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <aside className="surface cart-summary">
                      <h2>Resumo da reserva</h2>
                      <div>
                        <span>Produtos ({cartCount})</span>
                        <strong>
                          {money(cartTotal)}
                        </strong>
                      </div>
                      <div className="summary-total">
                        <span>Total estimado</span>
                        <strong>
                          {money(cartTotal)}
                        </strong>
                      </div>
                      <div className="reserved-success">
                        <Icon name="check" size={19} /> Itens reservados
                      </div>
                      <p>
                        Os valores usam os preços atuais do catálogo.
                      </p>
                      <button className="secondary" onClick={() => go("catalogo")}>
                        Continuar navegando
                        <Icon name="arrow" size={16} />
                      </button>
                    </aside>
                  </div>
                </>
              ) : cartStatus === "ready" && !cart.expired && (
                <div className="empty-state surface">
                  <span className="empty-icon">
                    <Icon name="cart" size={35} />
                  </span>
                  <h2>Seu próximo upgrade está esperando.</h2>
                  <p>
                    Seu carrinho está vazio. Explore o catálogo
                    <br />e encontre as peças certas para você.
                  </p>
                  <button className="primary" onClick={() => go("catalogo")}>
                    Continuar navegando
                    <Icon name="arrow" size={18} />
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      )}

      {isAdmin && (
        <main className="container admin-layout">
          <aside className="admin-sidebar">
            <span className="section-kicker">ÁREA ADMINISTRATIVA</span>
            <h3>Painel de gestão</h3>
            <button
              className={route !== "admin/estoque" ? "active" : ""}
              onClick={() => go("admin/produtos")}
            >
              <Icon name="box" size={19} /> Produtos
            </button>
            <button
              className={route === "admin/estoque" ? "active" : ""}
              onClick={() => go("admin/estoque")}
            >
              <Icon name="grid" size={19} /> Estoque
            </button>
            <div className="admin-sidebar-bottom">
              <Icon name="shield" size={18} />
              <p>
                Área administrativa
              </p>
            </div>
            <button
              onClick={logout}
            >
              <Icon name="logout" size={18} /> Sair da administração
            </button>
          </aside>
          <section className="admin-content">
            {authLoading || (user?.role === "admin" && adminAccess === "pending") ? (
              <div className="empty-state surface" role="status">Verificando acesso…</div>
            ) : adminAccess === "error" && user?.role === "admin" ? (
              catalogFeedback
            ) : user?.role !== "admin" || adminAccess !== "allowed" ? (
              <div className="empty-state surface">
                <Icon name="shield" size={36} />
                <h2>Acesso restrito</h2>
                <p>Entre com a conta administrativa para gerenciar a loja.</p>
                <button className="primary" onClick={() => login(route)}>
                  Entrar como administrador
                </button>
              </div>
            ) : (
              <>
                {route === "admin/produtos" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="section-kicker">CATÁLOGO DA LOJA</span>
                        <h1>Gerenciar produtos</h1>
                        <p>Cuide de cada detalhe do seu catálogo.</p>
                      </div>
                      <button className="primary" onClick={() => go("admin/novo")}>
                        <Icon name="plus" size={18} />
                        Novo produto
                      </button>
                    </div>
                    <div className="admin-stats">
                      <div>
                        <span>Total de produtos</span>
                        <strong>
                          {adminProducts.length}
                          <Icon name="box" />
                        </strong>
                      </div>
                      <div>
                        <span>Ativos no catálogo</span>
                        <strong>
                          {adminProducts.filter((p) => p.active).length}
                          <span className="stat-dot green" />
                        </strong>
                      </div>
                      <div>
                        <span>Ativos sem estoque</span>
                        <strong>
                          {adminProducts.filter((p) => p.active && !available(p)).length}
                          <span className="stat-dot orange" />
                        </strong>
                      </div>
                    </div>
                    <div className="surface table-scroll">
                      <div className="surface-heading">
                        <h2>
                          Todos os produtos <span className="count-badge">{adminProducts.length}</span>
                        </h2>
                      </div>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Produto</th>
                            <th>Preço atual</th>
                            <th>Disponibilidade</th>
                            <th>Catálogo</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminProducts.map((p) => (
                            <tr key={p.id}>
                              <td>
                                <strong>{p.name}</strong>
                                <small>
                                  {p.category} · {p.brand}
                                </small>
                              </td>
                              <td className="nowrap">{money(p.price)}</td>
                              <td>
                                <StockBadge product={p} />
                              </td>
                              <td>
                                <span
                                  className={`status-pill ${p.active ? "active-pill" : "removed-pill"}`}
                                >
                                  {p.active ? "Ativo" : "Removido"}
                                </span>
                              </td>
                              <td>
                                <div className="table-actions">
                                  <button
                                    className="icon-button"
                                    title="Editar produto"
                                    aria-label={`Editar ${p.name}`}
                                    onClick={() => go(`admin/editar/${p.id}`)}
                                  >
                                    <Icon name="edit" size={17} />
                                  </button>
                                  {p.active ? (
                                    <button
                                      className="icon-button danger-text"
                                      title="Remover do catálogo"
                                      aria-label={`Remover ${p.name} do catálogo`}
                                      onClick={() => setConfirmRemove(p)}
                                    >
                                      <Icon name="trash" size={17} />
                                    </button>
                                  ) : (
                                    <button
                                      className="text-button"
                                      disabled={pendingProduct}
                                      onClick={() => void changeProductStatus(p, true)}
                                    >
                                      Reativar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="alert info admin-note">
                      <Icon name="info" size={18} />
                      <p>
                        Produtos sem estoque continuam visíveis como <strong>Indisponível</strong>.
                        Produtos removidos ficam fora da loja, mas preservam seus registros e
                        histórico.
                      </p>
                    </div>
                  </>
                )}
                {route === "admin/novo" && (
                  <ProductForm key={route} cancel={() => go("admin/produtos")} save={saveProduct} />
                )}
                {route.startsWith("admin/editar/") && (
                  <EditProduct
                    key={route}
                    product={adminProducts.find((p) => p.id === Number(route.split("/")[2]))}
                    cancel={() => go("admin/produtos")}
                    save={saveProduct}
                  />
                )}
                {route === "admin/estoque" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="section-kicker">CONTROLE DE DISPONIBILIDADE</span>
                        <h1>Gerenciar estoque</h1>
                        <p>Acompanhe as quantidades e ajuste seu inventário.</p>
                      </div>
                    </div>
                    <div className="alert info">
                      <Icon name="info" />
                      <div>
                        <strong>Disponível = quantidade total − quantidade reservada</strong>
                        <p>
                          O saldo é calculado a partir das reservas registradas nos carrinhos.
                        </p>
                      </div>
                    </div>
                    <div className="surface table-scroll">
                      <div className="surface-heading">
                        <h2>Inventário de produtos</h2>
                        <span className="muted">{adminProducts.length} produtos</span>
                      </div>
                      <table className="admin-table stock-table">
                        <thead>
                          <tr>
                            <th>Produto</th>
                            <th>Estoque total</th>
                            <th>Reservada</th>
                            <th>Disponível</th>
                            <th>Ajustar total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminProducts.map((p) => (
                            <StockRow
                              key={`${p.id}-${p.total}-${p.baseReserved}`}
                              product={p}
                              onSave={async (total) => {
                                const stock = await purchases.setStock(p.id, total);
                                setAdminProducts((old) => old.map((item) =>
                                  item.id === p.id ? { ...item, ...stock } : item));
                                notify("Estoque atualizado.");
                              }}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="footnote">
                      <Icon name="shield" size={15} /> O estoque total nunca pode ser inferior à
                      quantidade já reservada.
                    </p>
                  </>
                )}
              </>
            )}
          </section>
        </main>
      )}

      <footer>
        <div className="container footer-main">
          <div>
            <button className="brand footer-brand" onClick={() => go("catalogo")}>
              <span className="brand-mark">
                <Icon name="chip" size={22} />
              </span>
              Tech<span>Parts</span>
              <span className="brand-dot">.</span>
            </button>
            <p>A peça certa para cada possibilidade.</p>
          </div>
          <div className="footer-right">
            <span>Um projeto para explorar a tecnologia.</span>
            <button onClick={() => setDemo(true)}>
              Sobre este protótipo
              <Icon name="arrow" size={14} />
            </button>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© 2026 TechParts. Projeto acadêmico com dados fictícios.</span>
          <span>Sem compras reais. Apenas boas ideias.</span>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Icon name="info" size={20} />
          </span>
          <p>{toast}</p>
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {confirmRemove && (
        <Modal title="Remover do catálogo?" onClose={() => setConfirmRemove(null)}>
          <div className="modal-icon danger-bg">
            <Icon name="trash" size={27} />
          </div>
          <p>
            O produto <strong>{confirmRemove.name}</strong> não aparecerá mais na loja e não poderá
            receber novas reservas.
          </p>
          <div className="alert info">
            <Icon name="shield" size={19} />
            <p>
              O registro e todo o histórico de preços serão preservados. Carrinhos existentes
              indicarão a remoção.
            </p>
          </div>
          <div className="modal-actions">
            <button className="secondary" disabled={pendingProduct} onClick={() => setConfirmRemove(null)}>
              Cancelar
            </button>
            <button
              className="danger-button"
              disabled={pendingProduct}
              onClick={() => void changeProductStatus(confirmRemove, false)}
            >
              Remover do catálogo
            </button>
          </div>
        </Modal>
      )}
      {demo && (
        <Modal title="Conheça o protótipo" onClose={() => setDemo(false)}>
          <div className="demo-intro">
            <span className="section-kicker">TECHPARTS · PROJETO ACADÊMICO</span>
            <p>
              O catálogo usa produtos de demonstração. Você pode criar uma conta para explorar a loja.
            </p>
          </div>
          <div className="alert info">
            <Icon name="info" />
            <p>
              O fluxo termina na reserva do carrinho. Não há checkout, frete ou pagamento. Você
              também pode criar uma conta de cliente.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Breadcrumb({ items, go }: { items: string[]; go: () => void }) {
  return (
    <nav className="breadcrumb" aria-label="Caminho de navegação">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <Icon name="chevron" size={12} />}
          {i === 0 ? <button onClick={go}>{item}</button> : <span>{item}</span>}
        </span>
      ))}
    </nav>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", listener);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Fechar" onClick={onClose} autoFocus>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function AuthForm({
  signup,
  onSwitch,
  onSuccess,
}: {
  signup: boolean;
  onSwitch: () => void;
  onSuccess: (account: User) => void;
}) {
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    const email = values.email.trim();
    if (signup && !values.name.trim()) next.name = "Informe seu nome.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Digite um e-mail válido.";
    if (!values.password) next.password = "Informe sua senha.";
    else if (signup && [...values.password].length < 15) next.password = "Use pelo menos 15 caracteres.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      if (signup) {
        await auth.register({ ...values, email });
        setValues({ name: "", email, password: "" });
        setCreated(true);
      } else {
        onSuccess(await auth.login({ email, password: values.password }));
      }
    } catch (error) {
      const status = error instanceof AuthError ? error.status : 0;
      if (status === 409) setErrors({ email: "Este e-mail já está cadastrado." });
      else if (status === 401) setErrors({ credentials: "E-mail ou senha incorretos." });
      else if (status === 422) setErrors({ credentials: "Confira os dados informados." });
      else setErrors({ credentials: "Autenticação indisponível. Tente novamente." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="container auth-page">
      <div className="auth-story">
        <span className="section-kicker">SEU SETUP COMEÇA COM VOCÊ</span>
        <h1>
          Um mundo de
          <br />
          possibilidades.
          <br />
          <span>Peça por peça.</span>
        </h1>
        <p>
          Encontre a tecnologia que acompanha suas ideias.
          <br />
          Entre, explore e reserve seu próximo upgrade.
        </p>
        <img src="/images/hero-tech.png" alt="Componentes de computador" />
        <span className="auth-story-note">
          <Icon name="shield" size={17} /> Sua senha é armazenada como hash.
        </span>
      </div>
      <section className="auth-card surface">
        {created ? (
          <div className="auth-success">
            <span className="success-circle">
              <Icon name="check" size={36} />
            </span>
            <span className="section-kicker">TUDO PRONTO</span>
            <h1>Conta criada com sucesso!</h1>
            <p>Entre com seu e-mail e senha para acessar a loja.</p>
            <button className="primary" onClick={onSwitch}>
              Ir para o login
              <Icon name="arrow" size={18} />
            </button>
          </div>
        ) : (
          <>
            <span className="auth-icon">
              <Icon name={signup ? "plus" : "user"} size={25} />
            </span>
            <h1>{signup ? "Crie sua conta" : "Bom ter você por aqui."}</h1>
            <p>
              {signup
                ? "Seu próximo upgrade está a poucos cliques."
                : "Entre para reservar suas próximas escolhas."}
            </p>
            <form onSubmit={submit} noValidate>
              {signup && (
                <Field label="Nome completo" error={errors.name}>
                  <input
                    autoComplete="name"
                    maxLength={120}
                    value={values.name}
                    placeholder="Como podemos chamar você?"
                    onChange={(e) => setValues({ ...values, name: e.target.value })}
                    aria-invalid={!!errors.name}
                  />
                </Field>
              )}
              <Field label="E-mail" error={errors.email}>
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="seu@email.com"
                  value={values.email}
                  onChange={(e) => setValues({ ...values, email: e.target.value })}
                  aria-invalid={!!errors.email}
                />
              </Field>
              <Field label="Senha" error={errors.password}>
                <div className="password-input">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete={signup ? "new-password" : "current-password"}
                    placeholder={signup ? "Pelo menos 15 caracteres" : "Digite sua senha"}
                    maxLength={128}
                    value={values.password}
                    onChange={(e) => setValues({ ...values, password: e.target.value })}
                    aria-invalid={!!errors.password}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </Field>
              {errors.credentials && (
                <div className="field-error credentials-error" role="alert">
                  <Icon name="info" size={16} />
                  {errors.credentials}
                </div>
              )}
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Aguarde…" : signup ? "Criar conta" : "Entrar"}
                <Icon name="arrow" size={18} />
              </button>
            </form>
            <p className="auth-switch">
              {signup ? "Já tem uma conta?" : "Ainda não tem uma conta?"}{" "}
              <button onClick={onSwitch} disabled={busy}>{signup ? "Entrar" : "Criar conta"}</button>
            </p>
            {signup && (
              <div className="auth-disclaimer">
                <Icon name="shield" size={16} />
                <p>O cadastro público cria apenas contas de cliente.</p>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className={`field ${error ? "has-error" : ""}`}>
      <span>{label}</span>
      {children}
      {error ? (
        <small className="field-error" role="alert">
          {error}
        </small>
      ) : (
        hint && <small className="field-hint">{hint}</small>
      )}
    </label>
  );
}

function ProductHistory({ productId, admin = false }: { productId: number; admin?: boolean }) {
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [history, setHistory] = useState<Awaited<ReturnType<typeof catalog.history>>>();

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    catalog.history(productId, admin, period, page, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setHistory(data);
      setStatus("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setStatus("error");
    });
    return () => controller.abort();
  }, [productId, admin, period, page, attempt]);

  return (
    <section className="surface detail-history">
      <div className="surface-heading">
        <div>
          <h2>Histórico de preços</h2>
          <p>Preço inicial e alterações registradas.</p>
        </div>
        <select
          aria-label="Período do histórico"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Todo o período</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
        </select>
      </div>
      {status === "loading" && <p className="table-empty" role="status">Carregando histórico…</p>}
      {status === "error" && (
        <div className="table-empty">
          <p role="alert">Não foi possível carregar o histórico.</p>
          <button className="text-button" onClick={() => setAttempt((old) => old + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {status === "ready" && history && (
        <>
          <table>
            <thead>
              <tr><th>Data da atualização (UTC)</th><th>Preço</th></tr>
            </thead>
            <tbody>
              {history.items.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.date).toLocaleString("pt-BR", {
                    dateStyle: "short", timeStyle: "short", timeZone: "UTC",
                  })}</td>
                  <td className="strong">{money(event.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.items.length && <p className="table-empty">Nenhum registro neste período.</p>}
          {history.total > historyPageSize && (
            <div className="pagination">
              <span>Página {page} de {Math.ceil(history.total / historyPageSize)}</span>
              <div>
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
                <button disabled={page * historyPageSize >= history.total} onClick={() => setPage(page + 1)}>
                  Próxima
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EditProduct({ product, save, cancel }: Parameters<typeof ProductForm>[0]) {
  if (!product) return (
    <div className="empty-state surface">
      <h2>Produto não encontrado</h2>
      <button className="secondary" onClick={cancel}>Voltar para produtos</button>
    </div>
  );

  return (
    <>
      <ProductForm product={product} save={save} cancel={cancel} />
      <ProductHistory productId={product.id} admin />
    </>
  );
}

function ProductForm({
  product,
  save,
  cancel,
}: {
  product?: Product;
  save: (p: ProductDraft) => Promise<void>;
  cancel: () => void;
}) {
  const [values, setValues] = useState({
    name: product?.name || "",
    brand: product?.brand || "",
    category: product?.category || "",
    price: product ? String(product.price) : "",
    description: product?.description || "",
  });
  const [specs, setSpecs] = useState<Record<string, string>>(product?.specs || {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fields = [...new Set([
    ...technicalFields(values.category),
    ...(optionalSpecs[values.category as Category] ?? []),
    ...Object.keys(specs),
  ])];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const next: Record<string, string> = {};
    Object.entries(values).forEach(([key, value]) => {
      if (!value.trim()) next[key] = "Este campo é obrigatório.";
    });
    if (values.price && (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(values.price) ||
        Number(values.price) > 99_999_999.99))
      next.price = "Informe um preço não negativo com até duas casas decimais.";
    technicalFields(values.category).forEach((key) => {
      if (!specs[key]?.trim()) next[key] = "Informe esta especificação técnica.";
    });
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await save({
        id: product?.id || 0,
        name: values.name.trim(),
        brand: values.brand.trim(),
        category: values.category as Category,
        description: values.description.trim(),
        price: Number(values.price),
        specs,
      });
    } catch (error) {
      setErrors({ save: catalogErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <button className="back-link" onClick={cancel}>
        <Icon name="arrow" className="rotate" size={16} />
        Voltar para produtos
      </button>
      <div className="page-heading">
        <div>
          <span className="section-kicker">CATÁLOGO DA LOJA</span>
          <h1>{product ? "Editar produto" : "Cadastrar produto"}</h1>
          <p>
            {product
              ? "Atualize as informações. O histórico de preços será preservado."
              : "Adicione uma nova possibilidade ao catálogo."}
          </p>
        </div>
      </div>
      <form onSubmit={submit} noValidate className="product-form">
        <section className="surface form-section">
          <div className="surface-heading">
            <h2>Informações do produto</h2>
          </div>
          <div className="form-body">
            <Field label="Nome do produto" error={errors.name}>
              <input
                placeholder="Ex.: Placa-mãe ASUS Prime B650M-A II"
                value={values.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
              />
            </Field>
            <Field label="Descrição" error={errors.description}>
              <textarea
                rows={4}
                placeholder="Descreva as características e os diferenciais do produto."
                value={values.description}
                onChange={(e) => setValues({ ...values, description: e.target.value })}
              />
            </Field>
            <div className="form-two-col">
              <Field label="Marca" error={errors.brand}>
                <input
                  placeholder="Ex.: ASUS"
                  value={values.brand}
                  onChange={(e) => setValues({ ...values, brand: e.target.value })}
                />
              </Field>
              <Field label="Categoria" error={errors.category}>
                <select
                  value={values.category}
                  onChange={(e) => {
                    setValues({ ...values, category: e.target.value });
                    setSpecs({});
                  }}
                >
                  <option value="">Selecione a categoria</option>
                  {categories.map((c) => (
                    <option key={c.name}>{c.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="form-two-col">
              <Field
                label="Preço de venda (R$)"
                error={errors.price}
                hint="O preço inicial e cada alteração são registrados no histórico."
              >
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={values.price}
                  onChange={(e) => setValues({ ...values, price: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </section>
        {fields.length > 0 && (
          <section className="surface form-section">
            <div className="surface-heading">
              <h2>Especificações técnicas</h2>
              <Icon name="chip" />
            </div>
            <div className="form-body form-two-col">
              {fields.map((key) => (
                <Field key={key} label={key} error={errors[key]}>
                  <input
                    value={specs[key] || ""}
                    placeholder={
                      key === "Soquete"
                        ? "Ex.: AM5"
                        : key === "Chipset"
                          ? "Ex.: B650"
                          : key === "Tipo de memória"
                            ? "Ex.: DDR5"
                            : key === "Tipo de painel"
                              ? "Ex.: IPS"
                              : key === "Taxa de atualização" ? "Ex.: 144 Hz" : undefined
                    }
                    onChange={(e) => setSpecs((old) => ({ ...old, [key]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
          </section>
        )}
        {!product && (
          <div className="alert info">
            <Icon name="info" size={18} />
            <p>
              O produto será criado com estoque zero. Após salvar, acesse <strong>Estoque</strong>{" "}
              para ajustar a quantidade total.
            </p>
          </div>
        )}
        {errors.save && <p className="field-error" role="alert">{errors.save}</p>}
        <div className="form-actions">
          <button type="button" className="secondary" disabled={saving} onClick={cancel}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={saving}>
            <Icon name="check" size={18} />
            {saving ? "Salvando…" : "Salvar produto"}
          </button>
        </div>
      </form>
    </>
  );
}

function StockRow({
  product,
  onSave,
}: {
  product: Product;
  onSave: (n: number) => Promise<void>;
}) {
  const reserved = product.baseReserved;
  const [value, setValue] = useState(String(product.total));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <tr>
      <td>
        <strong>{product.name}</strong>
        <small>
          {product.category}
          {!product.active ? " · Removido do catálogo" : ""}
        </small>
      </td>
      <td>{product.total}</td>
      <td>
        <span className="reserved-number">{reserved}</span>
      </td>
      <td>
        <span className={`stock-number ${product.total - reserved === 0 ? "zero" : ""}`}>
          {product.total - reserved}
        </span>
      </td>
      <td>
        <form
          className="stock-adjust"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            const n = Number(value);
            if (value === "" || !Number.isInteger(n) || n < 0 || n > 1_000_000)
              return setError("Informe um número inteiro entre 0 e 1.000.000.");
            setError("");
            setSaving(true);
            try {
              await onSave(n);
            } catch (failure) {
              setError(failure instanceof CartError ? failure.message : "Não foi possível salvar o estoque.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <input
            aria-label={`Estoque total de ${product.name}`}
            className={error ? "input-error" : ""}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button className="secondary" type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
          {error && (
            <small className="field-error" role="alert">
              {error}
            </small>
          )}
        </form>
      </td>
    </tr>
  );
}
