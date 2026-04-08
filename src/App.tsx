import { ChangeEvent, FormEvent, SyntheticEvent, useEffect, useMemo, useState } from "react";

import {
  AdminApiError,
  createAdminProduct,
  deleteAdminProduct,
  fetchAdminAnalyticsSummary,
  fetchAdminMe,
  fetchLotImportStatus,
  fetchAdminProducts,
  fetchCardLookup,
  fetchCardMetadataOptions,
  loginAdmin,
  startLotImport,
  updateAdminProduct,
  verifyAdminTwoFactor,
} from "./services/adminApi";
import type {
  AnalyticsSummaryItem,
  CardLookupItem,
  CardMetadataOptionsResponse,
  LotImportJobResponse,
  StoreProduct,
} from "./types/store";

const AUTH_STORAGE_KEY = "legacy_cards_admin_access_token";
const DEFAULT_ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL ?? "marcos_dev@icloud.com").trim();

type AdminTab = "cards" | "products";

type ProductDraft = {
  slug: string;
  name: string;
  product_type: string;
  lot_id: string;
  category: string;
  stock: string;
  price_brl: string;
  image_url: string;
  image_gallery: string;
  set_name: string;
  set_series: string;
  rarity: string;
  finish: string;
  condition: string;
  card_number: string;
  regulation_mark: string;
  set_code: string;
  language: string;
  release_year: string;
  pokemon_generation: string;
  accessory_kind: string;
  booster_pack_count: string;
  season_tags: string;
  is_special: boolean;
};

type PriceSuggestion = {
  usd: number | null;
  brl: number | null;
  currency: string | null;
  source: string | null;
  usdToBrlRate: number | null;
};

type CategoryGroup = {
  category: string;
  items: StoreProduct[];
};

type DuplicatePrompt = {
  duplicate: StoreProduct;
  incoming: StoreProduct;
};

type LotFilePayload = Record<string, unknown>;

const PRODUCT_TYPE_OPTIONS = [
  { value: "single_card", label: "Carta avulsa" },
  { value: "booster", label: "Booster" },
  { value: "blister", label: "Blister" },
  { value: "collector_box", label: "Box colecionavel" },
  { value: "trainer_box", label: "Box de treinador" },
  { value: "tin", label: "Lata" },
  { value: "accessory", label: "Acessorio" },
];

const CATEGORY_PRESET_BY_TAB: Record<AdminTab, string[]> = {
  cards: ["Cartas avulsas", "Promos", "Edicao de colecionador"],
  products: [
    "Booster",
    "Blister",
    "Box colecionavel",
    "Box de treinador",
    "Lata",
    "Acessorios",
  ],
};

const DEFAULT_CONDITION_OPTIONS = [
  "Mint (M)",
  "Near Mint (NM)",
  "Excellent (EX)",
  "Lightly Played (LP)",
  "Moderately Played (MP)",
  "Heavily Played (HP)",
  "Played (PL)",
  "Good (GD)",
  "Poor (PR)",
  "Damaged (DMG)",
];

const DEFAULT_FINISH_OPTIONS = [
  "Normal",
  "Holo (Holofoil)",
  "Reverse Holo (Reverse Foil)",
  "Poke Ball Reverse Holo",
  "Master Ball Reverse Holo",
  "Mirror Foil",
  "Full Art",
];

const DEFAULT_GENERATION_OPTIONS = [
  "generation-i",
  "generation-ii",
  "generation-iii",
  "generation-iv",
  "generation-v",
  "generation-vi",
  "generation-vii",
  "generation-viii",
  "generation-ix",
];

const DEFAULT_LANGUAGE_OPTIONS = ["PT", "EN", "JP", "FR", "DE", "IT", "ES", "KO"];

const DEFAULT_REGULATION_MARK_OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

function isCardType(productType: string): boolean {
  return productType === "single_card";
}

function normalizeCategory(category: string): string {
  const sanitized = category.trim();
  return sanitized.length > 0 ? sanitized : "Sem categoria";
}

function emptyDraft(tab: AdminTab): ProductDraft {
  if (tab === "cards") {
    return {
      slug: "",
      name: "",
      product_type: "single_card",
      lot_id: "",
      category: "Cartas avulsas",
      stock: "1",
      price_brl: "0,00",
      image_url: "",
      image_gallery: "",
      set_name: "",
      set_series: "",
      rarity: "",
      finish: "Normal",
      condition: "Near Mint (NM)",
      card_number: "",
      regulation_mark: "",
      set_code: "",
      language: "PT",
      release_year: "",
      pokemon_generation: "",
      accessory_kind: "",
      booster_pack_count: "",
      season_tags: "",
      is_special: false,
    };
  }

  return {
    slug: "",
    name: "",
    product_type: "booster",
    lot_id: "",
    category: "Booster",
    stock: "1",
    price_brl: "0,00",
    image_url: "",
    image_gallery: "",
    set_name: "",
    set_series: "",
    rarity: "",
    finish: "",
    condition: "",
    card_number: "",
    regulation_mark: "",
    set_code: "",
    language: "PT",
    release_year: "",
    pokemon_generation: "",
    accessory_kind: "",
    booster_pack_count: "",
    season_tags: "",
    is_special: false,
  };
}

function toDraft(product: StoreProduct): ProductDraft {
  return {
    slug: product.slug,
    name: product.name,
    product_type: product.product_type,
    lot_id: product.lot_id ?? "",
    category: normalizeCategory(product.category),
    stock: String(product.stock),
    price_brl: formatBrlFromNumber(product.price_brl),
    image_url: product.image_url,
    image_gallery: (product.image_gallery ?? []).join("\n"),
    set_name: product.set_name ?? "",
    set_series: product.set_series ?? "",
    rarity: product.rarity ?? "",
    finish: product.finish ?? (isCardType(product.product_type) ? "Normal" : ""),
    condition: product.condition ?? (isCardType(product.product_type) ? "Near Mint (NM)" : ""),
    card_number: product.card_number ?? "",
    regulation_mark: product.regulation_mark ?? "",
    set_code: product.set_code ?? "",
    language: product.language ?? "",
    release_year: product.release_year ? String(product.release_year) : "",
    pokemon_generation: product.pokemon_generation ?? "",
    accessory_kind: product.accessory_kind ?? "",
    booster_pack_count: product.booster_pack_count != null ? String(product.booster_pack_count) : "",
    season_tags: product.season_tags.join(", "),
    is_special: product.is_special,
  };
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed);
  if (!Number.isInteger(numeric)) {
    return null;
  }
  return numeric;
}

function parseImageGallery(value: string, primaryImageUrl: string): string[] {
  const primary = primaryImageUrl.trim();
  const seen = new Set<string>();
  const items: string[] = [];

  value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (item === primary || seen.has(item)) {
        return;
      }
      seen.add(item);
      items.push(item);
    });

  return items;
}

function formatBrlFromNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

function formatBrlInputMask(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  const cents = Number(digits) / 100;
  return formatBrlFromNumber(cents);
}

function parseBrlToNumber(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function toProduct(draft: ProductDraft): StoreProduct {
  return {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    product_type: draft.product_type.trim(),
    lot_id: draft.lot_id.trim() || null,
    category: normalizeCategory(draft.category),
    stock: Number(draft.stock || "0"),
    price_brl: parseBrlToNumber(draft.price_brl),
    image_url: draft.image_url.trim(),
    image_gallery: parseImageGallery(draft.image_gallery, draft.image_url),
    set_name: draft.set_name.trim() || null,
    set_series: draft.set_series.trim() || null,
    rarity: draft.rarity.trim() || null,
    finish: draft.finish.trim() || null,
    condition: draft.condition.trim() || null,
    card_number: draft.card_number.trim() || null,
    regulation_mark: draft.regulation_mark.trim().toUpperCase() || null,
    set_code: draft.set_code.trim().toUpperCase() || null,
    language: draft.language.trim().toUpperCase() || null,
    release_year: parseOptionalInt(draft.release_year),
    pokemon_generation: draft.pokemon_generation.trim() || null,
    accessory_kind: draft.accessory_kind.trim() || null,
    booster_pack_count: parseOptionalInt(draft.booster_pack_count),
    season_tags: draft.season_tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    is_special: draft.is_special,
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatCardLookupQueryInput(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (!compact) {
    return "";
  }

  if (!/^\d*\/?\d*$/.test(compact)) {
    return value;
  }

  const digits = compact.replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 3) {
    return digits;
  }

  return `${digits.slice(0, 3)}/${digits.slice(3)}`;
}

function normalizedIdentity(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function cardIdentityKey(product: StoreProduct): string {
  return [
    normalizedIdentity(product.lot_id),
    normalizedIdentity(product.name),
    normalizedIdentity(product.card_number),
    normalizedIdentity(product.set_name),
    normalizedIdentity(product.set_series),
    normalizedIdentity(product.rarity),
    normalizedIdentity(product.finish),
    normalizedIdentity(product.condition),
    normalizedIdentity(product.regulation_mark),
    normalizedIdentity(product.set_code),
    normalizedIdentity(product.language),
    String(product.release_year ?? ""),
    normalizedIdentity(product.pokemon_generation),
  ].join("|");
}

function uniqueStrings(...groups: string[][]): string[] {
  const values = new Set<string>();
  groups.forEach((group) => {
    group.forEach((item) => {
      const normalized = item.trim();
      if (normalized) {
        values.add(normalized);
      }
    });
  });
  return [...values].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function uniqueNumbers(...groups: number[][]): number[] {
  const values = new Set<number>();
  groups.forEach((group) => {
    group.forEach((item) => {
      if (Number.isInteger(item)) {
        values.add(item);
      }
    });
  });
  return [...values].sort((left, right) => right - left);
}

function isLotImportInProgress(status: string | null | undefined): boolean {
  return status === "queued" || status === "running";
}

function logImageLoadError(
  event: SyntheticEvent<HTMLImageElement>,
  context: string,
  imageUrl: string | null | undefined,
  itemName: string | null | undefined,
): void {
  console.error("[legacy-admin][image] Falha ao carregar imagem", {
    context,
    itemName: itemName ?? null,
    imageUrl: imageUrl ?? null,
  });

  event.currentTarget.classList.add("is-broken-image");
}

function resolveSlugCollisionForCreate(payload: StoreProduct, existingProducts: StoreProduct[]): string {
  const baseSlug = payload.slug.trim();
  if (!baseSlug) {
    return baseSlug;
  }

  const existingSlugs = new Set(existingProducts.map((item) => item.slug));
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  const existingSameSlug = existingProducts.find((item) => item.slug === baseSlug);
  if (existingSameSlug && cardIdentityKey(existingSameSlug) === cardIdentityKey(payload)) {
    return baseSlug;
  }

  const suffixSeed =
    payload.finish?.trim() ||
    payload.condition?.trim() ||
    payload.language?.trim() ||
    "variante";
  let candidateBase = slugify(`${baseSlug}-${suffixSeed}`);
  if (!candidateBase) {
    candidateBase = `${baseSlug}-variante`;
  }

  let candidate = candidateBase;
  let index = 2;
  while (existingSlugs.has(candidate)) {
    candidate = `${candidateBase}-${index}`;
    index += 1;
  }

  return candidate;
}

function App() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(AUTH_STORAGE_KEY) ?? "");
  const [adminEmail, setAdminEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [adminPassword, setAdminPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggedEmail, setLoggedEmail] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryItem[]>([]);
  const [cardOptions, setCardOptions] = useState<CardMetadataOptionsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("cards");
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cardLookupQuery, setCardLookupQuery] = useState("");
  const [cardLookupItems, setCardLookupItems] = useState<CardLookupItem[]>([]);
  const [cardLookupLoading, setCardLookupLoading] = useState(false);
  const [cardLookupError, setCardLookupError] = useState<string | null>(null);
  const [metadataWarning, setMetadataWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(() => emptyDraft("cards"));
  const [suggestedPrice, setSuggestedPrice] = useState<PriceSuggestion | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePrompt | null>(null);
  const [duplicateActionLoading, setDuplicateActionLoading] = useState(false);
  const [lotImportModalOpen, setLotImportModalOpen] = useState(false);
  const [lotImportFileName, setLotImportFileName] = useState("");
  const [lotImportPayload, setLotImportPayload] = useState<LotFilePayload | null>(null);
  const [lotImportCondition, setLotImportCondition] = useState("Near Mint (NM)");
  const [lotImportFinish, setLotImportFinish] = useState("Normal");
  const [lotImportCategory, setLotImportCategory] = useState("Cartas avulsas");
  const [lotImportUseAi, setLotImportUseAi] = useState(true);
  const [lotImportBusy, setLotImportBusy] = useState(false);
  const [lotImportError, setLotImportError] = useState<string | null>(null);
  const [lotImportJob, setLotImportJob] = useState<LotImportJobResponse | null>(null);
  const lotImportJobId = lotImportJob?.job_id ?? null;
  const lotImportJobStatus = lotImportJob?.status ?? null;

  const connected = adminToken.trim().length > 0;

  function disconnectSession(reason?: string): void {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAdminToken("");
    setLoggedEmail(null);
    setTwoFactorEnabled(false);
    setTwoFactorChallenge(null);
    setTwoFactorCode("");
    setAdminPassword("");
    setProducts([]);
    setAnalytics([]);
    if (reason) {
      setAuthError(reason);
    }
  }

  useEffect(() => {
    if (!connected) {
      setProducts([]);
      setAnalytics([]);
      setCardOptions(null);
      setMetadataWarning(null);
      return;
    }

    let cancelled = false;

    async function loadPanel(): Promise<void> {
      setLoading(true);
      setError(null);
      setStatus(null);
      setMetadataWarning(null);

      try {
        const warnings: string[] = [];
        const me = await fetchAdminMe(adminToken);
        if (cancelled) {
          return;
        }
        setLoggedEmail(me.email);
        setTwoFactorEnabled(me.two_factor_enabled);

        const productsResponse = await fetchAdminProducts(adminToken);
        if (cancelled) {
          return;
        }
        setProducts(productsResponse);

        try {
          const analyticsResponse = await fetchAdminAnalyticsSummary(adminToken);
          if (!cancelled) {
            setAnalytics(analyticsResponse.items);
          }
        } catch (analyticsErr: unknown) {
          if (!cancelled) {
            setAnalytics([]);
            warnings.push(
              analyticsErr instanceof Error
                ? `Analytics indisponivel agora: ${analyticsErr.message}`
                : "Analytics indisponivel agora.",
            );
          }
        }

        try {
          const options = await fetchCardMetadataOptions(adminToken);
          if (!cancelled) {
            setCardOptions(options);
          }
        } catch (metadataErr: unknown) {
          if (!cancelled) {
            setCardOptions(null);
            warnings.push(
              metadataErr instanceof Error
                ? metadataErr.message
                : "Nao foi possivel carregar opcoes externas de cards.",
            );
          }
        }

        if (!cancelled) {
          setMetadataWarning(warnings.length > 0 ? warnings.join(" | ") : null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          if (err instanceof AdminApiError && err.status === 401) {
            disconnectSession("Sua sessao expirou. Faca login novamente.");
          } else {
            setError(err instanceof Error ? err.message : "Falha ao carregar painel admin");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPanel();

    return () => {
      cancelled = true;
    };
  }, [adminToken, connected]);

  useEffect(() => {
    if (!connected || !lotImportJobId || !isLotImportInProgress(lotImportJobStatus)) {
      return;
    }

    const activeJobId = lotImportJobId;
    let cancelled = false;

    async function pollJob() {
      try {
        const next = await fetchLotImportStatus(adminToken, activeJobId);
        if (cancelled) {
          return;
        }

        setLotImportJob(next);
        if (isLotImportInProgress(next.status)) {
          return;
        }

        setLotImportBusy(false);
        if (next.status === "completed" || next.status === "completed_with_errors") {
          setStatus(
            `Importacao concluida: ${next.created_count} criados, ${next.updated_count} atualizados, ${next.error_count} com erro.`,
          );
          try {
            const productsResponse = await fetchAdminProducts(adminToken);
            if (!cancelled) {
              setProducts(productsResponse);
            }
          } catch {
            // Mantem o fluxo principal da importacao mesmo se o refresh falhar.
          }
          return;
        }

        if (next.status === "failed") {
          setLotImportError(next.last_error ?? "Falha na importacao de lote.");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setLotImportError(
            err instanceof Error ? err.message : "Falha ao consultar status da importacao.",
          );
        }
      }
    }

    const intervalId = window.setInterval(() => {
      void pollJob();
    }, 1200);
    void pollJob();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [adminToken, connected, lotImportJobId, lotImportJobStatus]);

  useEffect(() => {
    setSelectedCategory("all");
    setCardLookupItems([]);
    setCardLookupError(null);
    setCardLookupQuery("");
    setSuggestedPrice(null);
    setDuplicatePrompt(null);

    setDraft((current) => {
      if (activeTab === "cards") {
        return {
          ...current,
          product_type: "single_card",
          category: current.category || "Cartas avulsas",
          finish: current.finish || "Normal",
          condition: current.condition || "Near Mint (NM)",
        };
      }

      if (current.product_type === "single_card") {
        return {
          ...current,
          product_type: "booster",
          category: current.category === "Cartas avulsas" ? "Booster" : current.category,
        };
      }

      return current;
    });
  }, [activeTab]);

  const tabProducts = useMemo(() => {
    return products.filter((product) =>
      activeTab === "cards" ? isCardType(product.product_type) : !isCardType(product.product_type),
    );
  }, [products, activeTab]);

  const categoryOptions = useMemo(() => {
    const fromPreset = CATEGORY_PRESET_BY_TAB[activeTab];
    const fromProducts = tabProducts.map((product) => normalizeCategory(product.category));
    return uniqueStrings(fromPreset, fromProducts);
  }, [activeTab, tabProducts]);

  useEffect(() => {
    if (selectedCategory !== "all" && !categoryOptions.includes(selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [categoryOptions, selectedCategory]);

  const visibleProducts = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return tabProducts.filter((product) => {
      const productCategory = normalizeCategory(product.category);
      if (selectedCategory !== "all" && selectedCategory !== productCategory) {
        return false;
      }

      if (!trimmed) {
        return true;
      }

      const searchable = [
        product.slug,
        product.name,
        product.lot_id ?? "",
        product.product_type,
        productCategory,
        product.set_name ?? "",
        product.card_number ?? "",
        product.set_code ?? "",
        product.regulation_mark ?? "",
        product.language ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(trimmed);
    });
  }, [query, selectedCategory, tabProducts]);

  const groupedProducts = useMemo<CategoryGroup[]>(() => {
    const groups = new Map<string, StoreProduct[]>();

    visibleProducts.forEach((product) => {
      const category = normalizeCategory(product.category);
      const current = groups.get(category) ?? [];
      current.push(product);
      groups.set(category, current);
    });

    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "pt-BR"))
      .map(([category, items]) => ({
        category,
        items: items.sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
      }));
  }, [visibleProducts]);

  const cardsFromStore = useMemo(
    () => products.filter((product) => isCardType(product.product_type)),
    [products],
  );

  const setNameOptions = useMemo(
    () =>
      uniqueStrings(
        cardOptions?.set_name_options ?? [],
        cardsFromStore.map((product) => product.set_name ?? ""),
        [draft.set_name],
      ),
    [cardOptions, cardsFromStore, draft.set_name],
  );

  const setSeriesOptions = useMemo(
    () =>
      uniqueStrings(
        cardOptions?.set_series_options ?? [],
        cardsFromStore.map((product) => product.set_series ?? ""),
        [draft.set_series],
      ),
    [cardOptions, cardsFromStore, draft.set_series],
  );

  const rarityOptions = useMemo(
    () =>
      uniqueStrings(
        cardOptions?.rarity_options ?? [],
        cardsFromStore.map((product) => product.rarity ?? ""),
        [draft.rarity],
      ),
    [cardOptions, cardsFromStore, draft.rarity],
  );

  const finishOptions = useMemo(
    () =>
      uniqueStrings(
        cardOptions?.finish_options ?? DEFAULT_FINISH_OPTIONS,
        cardsFromStore.map((product) => product.finish ?? ""),
        [draft.finish],
      ),
    [cardOptions, cardsFromStore, draft.finish],
  );

  const conditionOptions = useMemo(
    () =>
      uniqueStrings(
        cardOptions?.condition_options ?? DEFAULT_CONDITION_OPTIONS,
        cardsFromStore.map((product) => product.condition ?? ""),
        [draft.condition],
      ),
    [cardOptions, cardsFromStore, draft.condition],
  );

  const generationOptions = useMemo(
    () =>
      uniqueStrings(
        cardOptions?.generation_options ?? DEFAULT_GENERATION_OPTIONS,
        cardsFromStore.map((product) => product.pokemon_generation ?? ""),
        [draft.pokemon_generation],
      ),
    [cardOptions, cardsFromStore, draft.pokemon_generation],
  );

  const languageOptions = useMemo(
    () =>
      uniqueStrings(
        DEFAULT_LANGUAGE_OPTIONS,
        cardsFromStore.map((product) => (product.language ?? "").toUpperCase()),
        [draft.language.toUpperCase()],
      ),
    [cardsFromStore, draft.language],
  );

  const regulationMarkOptions = useMemo(
    () =>
      uniqueStrings(
        DEFAULT_REGULATION_MARK_OPTIONS,
        cardsFromStore.map((product) => (product.regulation_mark ?? "").toUpperCase()),
        [draft.regulation_mark.toUpperCase()],
      ),
    [cardsFromStore, draft.regulation_mark],
  );

  const yearOptions = useMemo(() => {
    const fromApi = cardOptions?.year_options ?? [];
    const fromStore = cardsFromStore
      .map((product) => product.release_year ?? null)
      .filter((item): item is number => item != null);
    return uniqueNumbers(fromApi, fromStore);
  }, [cardOptions, cardsFromStore]);

  const formTypeOptions = useMemo(() => {
    const base =
      activeTab === "cards"
        ? PRODUCT_TYPE_OPTIONS.filter((option) => option.value === "single_card")
        : PRODUCT_TYPE_OPTIONS.filter((option) => option.value !== "single_card");

    if (!draft.product_type || base.some((option) => option.value === draft.product_type)) {
      return base;
    }

    return [...base, { value: draft.product_type, label: `Custom (${draft.product_type})` }];
  }, [activeTab, draft.product_type]);

  const previewGallery = useMemo(
    () => parseImageGallery(draft.image_gallery, draft.image_url),
    [draft.image_gallery, draft.image_url],
  );

  async function submitLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAuthError(null);
    setError(null);
    setStatus(null);
    setAuthLoading(true);

    try {
      const response = await loginAdmin(adminEmail.trim(), adminPassword);
      if (response.requires_2fa) {
        setTwoFactorChallenge(response.challenge_token);
        setStatus("Senha validada. Digite o codigo do Google Authenticator.");
        return;
      }

      if (!response.access_token) {
        setAuthError("Falha ao autenticar.");
        return;
      }

      localStorage.setItem(AUTH_STORAGE_KEY, response.access_token);
      setAdminToken(response.access_token);
      setTwoFactorChallenge(null);
      setTwoFactorCode("");
      setAdminPassword("");
      setStatus("Login realizado com sucesso.");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Falha ao autenticar.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function submitTwoFactor(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!twoFactorChallenge) {
      setAuthError("Fluxo 2FA invalido. Tente o login novamente.");
      return;
    }

    setAuthError(null);
    setAuthLoading(true);

    try {
      const response = await verifyAdminTwoFactor(twoFactorChallenge, twoFactorCode.trim());
      if (!response.access_token) {
        setAuthError("Sessao 2FA invalida.");
        return;
      }

      localStorage.setItem(AUTH_STORAGE_KEY, response.access_token);
      setAdminToken(response.access_token);
      setTwoFactorChallenge(null);
      setTwoFactorCode("");
      setAdminPassword("");
      setStatus("2FA validado. Sessao admin iniciada.");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Codigo 2FA invalido.");
    } finally {
      setAuthLoading(false);
    }
  }

  function resetForm() {
    setEditingSlug(null);
    setDraft(emptyDraft(activeTab));
    setCardLookupItems([]);
    setCardLookupError(null);
    setCardLookupQuery("");
    setSuggestedPrice(null);
    setDuplicatePrompt(null);
  }

  function beginEdit(product: StoreProduct) {
    const tab: AdminTab = isCardType(product.product_type) ? "cards" : "products";
    setActiveTab(tab);
    setEditingSlug(product.slug);
    setDraft(toDraft(product));
    setSuggestedPrice(null);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected) {
      return;
    }

    setStatus(null);
    setError(null);

    const payload = toProduct(draft);
    if (!payload.slug || !payload.name || !payload.image_url) {
      setError("Slug, nome e URL da imagem sao obrigatorios.");
      return;
    }

    if (activeTab === "cards") {
      payload.product_type = "single_card";
    }

    if (activeTab === "products" && payload.product_type === "single_card") {
      setError("A aba Produtos nao aceita tipo single_card.");
      return;
    }

    if (Number.isNaN(payload.stock) || Number.isNaN(payload.price_brl)) {
      setError("Stock e preco precisam ser numeros validos.");
      return;
    }

    if (draft.release_year.trim() && payload.release_year == null) {
      setError("Ano invalido. Use apenas numeros, exemplo 2024.");
      return;
    }

    if (draft.booster_pack_count.trim() && payload.booster_pack_count == null) {
      setError("Quantidade de boosters invalida.");
      return;
    }

    if (!editingSlug && activeTab === "cards") {
      const incomingKey = cardIdentityKey(payload);
      const duplicate = products.find(
        (item) => isCardType(item.product_type) && cardIdentityKey(item) === incomingKey,
      );
      if (duplicate) {
        setDuplicatePrompt({ duplicate, incoming: payload });
        return;
      }
    }

    if (!editingSlug) {
      const resolvedSlug = resolveSlugCollisionForCreate(payload, products);
      if (resolvedSlug !== payload.slug) {
        payload.slug = resolvedSlug;
      }
    }

    try {
      const saved = editingSlug
        ? await updateAdminProduct(adminToken, editingSlug, payload)
        : await createAdminProduct(adminToken, payload);

      setProducts((current) => {
        const without = current.filter((item) => item.slug !== editingSlug && item.slug !== saved.slug);
        return [...without, saved].sort((left, right) => left.slug.localeCompare(right.slug));
      });

      if (!editingSlug && payload.slug !== draft.slug.trim()) {
        setStatus(`Produto criado com slug ajustado para evitar colisão: ${payload.slug}.`);
      } else {
        setStatus(editingSlug ? "Produto atualizado." : "Produto criado.");
      }
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar produto.");
    }
  }

  async function removeProduct(slug: string) {
    if (!connected) {
      return;
    }

    setStatus(null);
    setError(null);
    try {
      await deleteAdminProduct(adminToken, slug);
      setProducts((current) => current.filter((item) => item.slug !== slug));
      if (editingSlug === slug) {
        resetForm();
      }
      setStatus("Produto removido.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao remover produto.");
    }
  }

  async function searchCards() {
    if (!connected) {
      return;
    }

    setStatus(null);
    const queryText = cardLookupQuery.trim();
    if (!queryText) {
      setCardLookupError("Digite um termo para buscar, ex: 031/094 ou Charizard.");
      setCardLookupItems([]);
      return;
    }

    setCardLookupLoading(true);
    setCardLookupError(null);

    try {
      const response = await fetchCardLookup(adminToken, queryText, 12);
      setCardLookupItems(response.items);
      if (response.items.length === 0) {
        setCardLookupError("Nenhuma carta encontrada para esse termo.");
        return;
      }

      const first = response.items[0];
      applyLookupCard(first);
      setStatus(`Carta aplicada automaticamente: ${first.name}.`);
    } catch (err: unknown) {
      setCardLookupItems([]);
      setCardLookupError(err instanceof Error ? err.message : "Falha ao buscar cartas.");
    } finally {
      setCardLookupLoading(false);
    }
  }

  function applyLookupCard(item: CardLookupItem) {
    const imageUrl = item.image_large ?? item.image_small ?? "";
    const generatedSlug = slugify(`${item.name}-${item.set_id}-${item.number.replace(/\//g, "-")}`);
    const galleryCandidates = [item.image_large, item.image_small]
      .map((value) => (value ?? "").trim())
      .filter((value) => Boolean(value) && value !== imageUrl) as string[];
    const galleryFromLookup = [...new Set(galleryCandidates)];

    setSuggestedPrice({
      usd: item.suggested_price_usd ?? null,
      brl: item.suggested_price_brl ?? null,
      currency: item.suggested_price_currency ?? null,
      source: item.suggested_price_source ?? null,
      usdToBrlRate: item.usd_brl_rate ?? null,
    });

    setDraft((current) => ({
      ...current,
      product_type: "single_card",
      slug: current.slug || generatedSlug,
      name: item.name,
      image_url: imageUrl || current.image_url,
      image_gallery:
        current.image_gallery.trim() ||
        (galleryFromLookup.length > 0 ? galleryFromLookup.join("\n") : ""),
      card_number: item.local_number ?? item.number,
      set_name: item.set_name,
      set_code: (item.set_code ?? item.set_id).toUpperCase(),
      set_series: item.set_series ?? current.set_series,
      rarity: item.rarity ?? current.rarity,
      regulation_mark: item.regulation_mark ?? current.regulation_mark,
      finish: item.suggested_finish ?? current.finish,
      release_year: item.release_year ? String(item.release_year) : current.release_year,
      pokemon_generation: item.pokemon_generation ?? current.pokemon_generation,
      language: current.language || "PT",
      category: current.category || "Cartas avulsas",
      price_brl:
        item.suggested_price_brl != null && parseBrlToNumber(current.price_brl || "0") <= 0
          ? formatBrlFromNumber(item.suggested_price_brl)
          : current.price_brl,
    }));
  }


  async function confirmDuplicateStockIncrease() {
    if (!duplicatePrompt || !connected) {
      return;
    }

    setDuplicateActionLoading(true);
    setStatus(null);
    setError(null);

    try {
      const updatedPayload: StoreProduct = {
        ...duplicatePrompt.duplicate,
        stock: duplicatePrompt.duplicate.stock + 1,
      };
      const saved = await updateAdminProduct(
        adminToken,
        duplicatePrompt.duplicate.slug,
        updatedPayload,
      );

      setProducts((current) =>
        current
          .map((item) => (item.slug === saved.slug ? saved : item))
          .sort((left, right) => left.slug.localeCompare(right.slug)),
      );

      setStatus("Carta duplicada detectada. Estoque de " + saved.slug + " incrementado em +1.");
      resetForm();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao atualizar estoque da carta duplicada.",
      );
    } finally {
      setDuplicateActionLoading(false);
    }
  }

  async function onSelectLotFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setLotImportFileName("");
      setLotImportPayload(null);
      return;
    }

    setLotImportError(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Arquivo de lote invalido: JSON raiz deve ser um objeto.");
      }

      const cards = (parsed as { cards?: unknown }).cards;
      if (!Array.isArray(cards)) {
        throw new Error("Arquivo de lote invalido: campo 'cards' ausente ou invalido.");
      }

      setLotImportFileName(file.name);
      setLotImportPayload(parsed as LotFilePayload);
      setLotImportJob(null);
    } catch (err: unknown) {
      setLotImportPayload(null);
      setLotImportError(err instanceof Error ? err.message : "Falha ao ler JSON do lote.");
    }
  }

  async function startLotImportFlow() {
    if (!connected) {
      return;
    }
    if (!lotImportPayload) {
      setLotImportError("Selecione um arquivo JSON de lote antes de iniciar.");
      return;
    }

    setLotImportError(null);
    setLotImportBusy(true);

    try {
      const started = await startLotImport(adminToken, {
        lot_payload: lotImportPayload,
        default_condition: lotImportCondition,
        default_finish: lotImportFinish,
        default_category: lotImportCategory,
        infer_regulation_mark_with_openai: lotImportUseAi,
      });

      const snapshot = await fetchLotImportStatus(adminToken, started.job_id);
      setLotImportJob(snapshot);
      setStatus(`Importacao iniciada: ${started.total_cards} cards em fila.`);
    } catch (err: unknown) {
      setLotImportBusy(false);
      setLotImportError(err instanceof Error ? err.message : "Falha ao iniciar importacao do lote.");
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <h1>Painel Admin Legacy Cards</h1>
          <p>
            Abas separadas para cards e produtos. Campos de set/raridade/condicao com opcoes e
            suporte para adicionar novos valores.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-lot-button"
            disabled={!connected}
            onClick={() => {
              setLotImportModalOpen(true);
            }}
          >
            Enviar lote JSON
          </button>
        </div>
      </header>

      <section className="admin-auth">
        {connected ? (
          <div className="admin-auth-connected">
            <div>
              <strong>{loggedEmail ?? "Sessao ativa"}</strong>
              <p>2FA: {twoFactorEnabled ? "ativo" : "desativado"}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                disconnectSession("Sessao encerrada.");
              }}
            >
              Sair
            </button>
          </div>
        ) : twoFactorChallenge ? (
          <form className="admin-auth-form" onSubmit={(event) => void submitTwoFactor(event)}>
            <label htmlFor="admin-2fa">Codigo Google Authenticator</label>
            <input
              id="admin-2fa"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={twoFactorCode}
              onChange={(event) => {
                setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              }}
              placeholder="000000"
              required
            />
            <div className="admin-auth-form-actions">
              <button type="submit" disabled={authLoading || twoFactorCode.length < 6}>
                {authLoading ? "Validando..." : "Validar 2FA"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={authLoading}
                onClick={() => {
                  setTwoFactorChallenge(null);
                  setTwoFactorCode("");
                }}
              >
                Voltar
              </button>
            </div>
          </form>
        ) : (
          <form className="admin-auth-form" onSubmit={(event) => void submitLogin(event)}>
            <label htmlFor="admin-email">E-mail admin</label>
            <input
              id="admin-email"
              type="email"
              value={adminEmail}
              onChange={(event) => {
                setAdminEmail(event.target.value);
              }}
              placeholder="admin@empresa.com"
              required
            />
            <label htmlFor="admin-password">Senha</label>
            <input
              id="admin-password"
              type="password"
              value={adminPassword}
              onChange={(event) => {
                setAdminPassword(event.target.value);
              }}
              placeholder="Sua senha admin"
              required
              minLength={8}
            />
            <button type="submit" disabled={authLoading || adminPassword.trim().length < 8}>
              {authLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        )}
      </section>

      {authError && <p className="admin-state error">{authError}</p>}
      {error && <p className="admin-state error">{error}</p>}
      {status && <p className="admin-state ok">{status}</p>}
      {metadataWarning && <p className="admin-state warning">{metadataWarning}</p>}

      {duplicatePrompt && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <h3>Carta duplicada encontrada</h3>
            <p>
              Ja existe uma carta igual ({duplicatePrompt.duplicate.name}) com mesma raridade e
              condicao.
            </p>
            <p>
              Lote atual: {duplicatePrompt.duplicate.lot_id ?? "sem lote"}.
            </p>
            <p>Deseja adicionar +1 no estoque desse item existente?</p>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="ghost"
                disabled={duplicateActionLoading}
                onClick={() => setDuplicatePrompt(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={duplicateActionLoading}
                onClick={() => {
                  void confirmDuplicateStockIncrease();
                }}
              >
                {duplicateActionLoading ? "Salvando..." : "Adicionar +1 no estoque"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lotImportModalOpen && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal lot-import-modal">
            <div className="lot-import-header">
              <h3>Importar lote de cartas</h3>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setLotImportModalOpen(false);
                }}
              >
                Fechar
              </button>
            </div>
            <p>
              Selecione o JSON do lote. O sistema vai buscar set, imagem e preco automaticamente e
              preencher condicao como NM para este lote.
            </p>

            <div className="lot-import-config">
              <label className="admin-field admin-field-full">
                <span>Arquivo JSON do lote</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    void onSelectLotFile(event);
                  }}
                />
                <small>{lotImportFileName || "Nenhum arquivo selecionado"}</small>
              </label>

              <label className="admin-field">
                <span>Condicao padrao</span>
                <select
                  value={lotImportCondition}
                  onChange={(event) => setLotImportCondition(event.target.value)}
                >
                  {conditionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-field">
                <span>Acabamento padrao</span>
                <select
                  value={lotImportFinish}
                  onChange={(event) => setLotImportFinish(event.target.value)}
                >
                  {finishOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-field">
                <span>Categoria padrao</span>
                <input
                  value={lotImportCategory}
                  onChange={(event) => setLotImportCategory(event.target.value)}
                  placeholder="Cartas avulsas"
                />
              </label>

              <label className="admin-checkbox lot-import-checkbox">
                <input
                  type="checkbox"
                  checked={lotImportUseAi}
                  onChange={(event) => setLotImportUseAi(event.target.checked)}
                />
                usar IA para preencher regulation mark quando a API nao retornar
              </label>
            </div>

            <div className="lot-import-actions">
              <button
                type="button"
                disabled={!lotImportPayload || lotImportBusy}
                onClick={() => {
                  void startLotImportFlow();
                }}
              >
                {lotImportBusy ? "Processando..." : "Iniciar processamento do lote"}
              </button>
            </div>

            {lotImportError && <p className="admin-state error">{lotImportError}</p>}

            {lotImportJob && (
              <section className="lot-import-progress">
                <div>
                  <strong>Status:</strong> {lotImportJob.status}
                </div>
                <div>
                  <strong>Cards:</strong> {lotImportJob.processed_cards}/{lotImportJob.total_cards}
                </div>
                <div>
                  <strong>Preparados:</strong> {lotImportJob.prepared_cards}
                </div>
                <div>
                  <strong>Criados:</strong> {lotImportJob.created_count}
                </div>
                <div>
                  <strong>Atualizados:</strong> {lotImportJob.updated_count}
                </div>
                <div>
                  <strong>Erros:</strong> {lotImportJob.error_count}
                </div>
              </section>
            )}

            {lotImportJob && lotImportJob.entries.length > 0 && (
              <section className="lot-import-gallery">
                {lotImportJob.entries.map((entry) => (
                  <article key={`${entry.index}-${entry.slug}`} className="lot-import-card">
                    <div className="lot-import-card-media">
                      {entry.image_url ? (
                        <img
                          src={entry.image_url}
                          alt={entry.name}
                          loading="lazy"
                          onError={(event) => {
                            logImageLoadError(event, "lot-import-gallery", entry.image_url, entry.name);
                          }}
                        />
                      ) : (
                        <span>Sem imagem</span>
                      )}
                    </div>
                    <div className="lot-import-card-content">
                      <strong>{entry.name}</strong>
                      <p>
                        {entry.card_number} - {(entry.language || "PT").toUpperCase()}
                      </p>
                      <p>Lote: {entry.lot_id ?? "-"}</p>
                      <p>
                        {(entry.regulation_mark ?? "-").toUpperCase()} -{" "}
                        {(entry.set_code ?? "---").toUpperCase()}
                      </p>
                      <p>
                        {entry.set_name ?? "Set pendente"}
                        {entry.release_year ? ` - ${entry.release_year}` : ""}
                      </p>
                      <p>
                        {entry.finish ?? "Sem acabamento"} - {entry.condition ?? "Sem condicao"}
                      </p>
                      <p>
                        Qtd: {entry.quantity} - {formatCurrency(entry.price_brl || 0)}
                      </p>
                      <p className={`lot-import-status status-${entry.status}`}>
                        {entry.status}
                        {entry.action ? ` (${entry.action})` : ""}
                      </p>
                      {entry.message && <p className="lot-import-message">{entry.message}</p>}
                    </div>
                  </article>
                ))}
              </section>
            )}
          </div>
        </div>
      )}

      {connected && (
        <>
          <section className="admin-analytics">
            <h2>Resumo de Analytics (30 dias)</h2>
            <div className="admin-analytics-grid">
              {analytics.length === 0 && <p>Nenhum evento coletado ainda.</p>}
              {analytics.map((item) => (
                <article key={item.endpoint} className="analytics-card">
                  <h3>{item.endpoint}</h3>
                  <strong>{item.count} eventos</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="admin-layout">
            <form className="admin-form" onSubmit={saveProduct}>
              <div className="admin-tabs" role="tablist" aria-label="Tipo de cadastro">
                <button
                  type="button"
                  className={activeTab === "cards" ? "tab-active" : ""}
                  onClick={() => setActiveTab("cards")}
                >
                  Cards
                </button>
                <button
                  type="button"
                  className={activeTab === "products" ? "tab-active" : ""}
                  onClick={() => setActiveTab("products")}
                >
                  Produtos
                </button>
              </div>

              <h2>{editingSlug ? `Editar ${editingSlug}` : activeTab === "cards" ? "Novo card" : "Novo produto"}</h2>

              {activeTab === "cards" && (
                <section className="admin-card-lookup">
                  <h3>Busca de cards na API</h3>
                  <div className="admin-card-lookup-form">
                    <input
                      value={cardLookupQuery}
                      placeholder="Ex: 031/094 ou Charizard"
                      onChange={(event) => setCardLookupQuery(formatCardLookupQueryInput(event.target.value))}
                    />
                    <button type="button" disabled={cardLookupLoading} onClick={() => { void searchCards(); }}>
                      {cardLookupLoading ? "Buscando..." : "Buscar"}
                    </button>
                  </div>
                  {cardLookupError && <p className="lookup-error">{cardLookupError}</p>}

                  {cardLookupItems.length > 0 && (
                    <div className="admin-card-lookup-grid">
                      {cardLookupItems.map((item) => (
                        <article key={item.card_id} className="lookup-card">
                          <div className="lookup-card-media">
                            {item.image_small ? (
                              <img
                                src={item.image_small}
                                alt={item.name}
                                loading="lazy"
                                onError={(event) => {
                                  logImageLoadError(event, "card-lookup", item.image_small, item.name);
                                }}
                              />
                            ) : (
                              <span>Sem imagem</span>
                            )}
                          </div>
                          <div className="lookup-card-content">
                            <strong>{item.name}</strong>
                            <p>
                              {item.local_number ?? item.number} - {item.set_name}
                            </p>
                            <p>
                              {item.rarity ?? "Sem raridade"}
                              {item.release_year ? ` - ${item.release_year}` : ""}
                            </p>
                            {item.regulation_mark && <p>Marcador: {item.regulation_mark}</p>}
                            {item.suggested_finish && <p>Acabamento: {item.suggested_finish}</p>}
                            {(item.suggested_price_brl != null || item.suggested_price_usd != null) && (
                              <p className="lookup-price-hint">
                                Preco sugerido:{" "}
                                {item.suggested_price_brl != null
                                  ? `${formatCurrency(item.suggested_price_brl)}`
                                  : "N/A"}
                                {item.suggested_price_usd != null
                                  ? ` (${formatUsd(item.suggested_price_usd)})`
                                  : ""}
                              </p>
                            )}
                          </div>
                          <button type="button" onClick={() => applyLookupCard(item)}>
                            Usar dados
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <div className="admin-field-grid">
                <label className="admin-field">
                  <span>Slug</span>
                  <input
                    value={draft.slug}
                    placeholder="slug"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, slug: event.target.value }))
                    }
                    disabled={Boolean(editingSlug)}
                  />
                </label>

                <label className="admin-field">
                  <span>Nome</span>
                  <input
                    value={draft.name}
                    placeholder="nome"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>

                <label className="admin-field">
                  <span>Tipo</span>
                  <select
                    value={draft.product_type}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, product_type: event.target.value }))
                    }
                    disabled={activeTab === "cards"}
                  >
                    {formTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="admin-field">
                  <span>Categoria</span>
                  <input
                    list="category-options"
                    value={draft.category}
                    placeholder="categoria"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, category: event.target.value }))
                    }
                  />
                </label>

                <label className="admin-field">
                  <span>Lote ID</span>
                  <input
                    value={draft.lot_id}
                    placeholder="ex: lote1"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, lot_id: event.target.value }))
                    }
                  />
                </label>

                <label className="admin-field">
                  <span>Estoque</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.stock}
                    placeholder="stock"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, stock: event.target.value }))
                    }
                  />
                </label>

                <label className="admin-field">
                  <span>Preco (BRL)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={draft.price_brl}
                    placeholder="0,00"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        price_brl: formatBrlInputMask(event.target.value),
                      }))
                    }
                  />
                  {activeTab === "cards" && suggestedPrice && (
                    <div className="admin-suggested-price">
                      <p>
                        Sugerido:{" "}
                        {suggestedPrice.brl != null ? formatCurrency(suggestedPrice.brl) : "N/A"}
                        {suggestedPrice.usd != null ? ` (${formatUsd(suggestedPrice.usd)})` : ""}
                      </p>
                      {suggestedPrice.source && <p>Fonte: {suggestedPrice.source}</p>}
                      {suggestedPrice.usdToBrlRate != null && (
                        <p>Cotacao USD/BRL: {suggestedPrice.usdToBrlRate.toFixed(4)}</p>
                      )}
                      {suggestedPrice.brl != null && (
                        <button
                          type="button"
                          className="admin-inline-apply"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              price_brl:
                                suggestedPrice.brl != null
                                  ? formatBrlFromNumber(suggestedPrice.brl)
                                  : current.price_brl,
                            }))
                          }
                        >
                          Aplicar preco sugerido
                        </button>
                      )}
                    </div>
                  )}
                </label>

                <label className="admin-field admin-field-full">
                  <span>URL da foto</span>
                  <input
                    value={draft.image_url}
                    placeholder="image_url"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, image_url: event.target.value }))
                    }
                  />
                </label>

                <label className="admin-field admin-field-full">
                  <span>Fotos adicionais (opcional)</span>
                  <textarea
                    value={draft.image_gallery}
                    placeholder="https://.../foto2.png&#10;https://.../foto3.png"
                    rows={3}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, image_gallery: event.target.value }))
                    }
                  />
                </label>

                {activeTab === "cards" && (
                  <>
                    <label className="admin-field">
                      <span>Numero da carta</span>
                      <input
                        value={draft.card_number}
                        placeholder="031/094"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, card_number: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field">
                      <span>Marcador (regra)</span>
                      <select
                        value={draft.regulation_mark || "__none"}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            regulation_mark:
                              event.target.value === "__none" ? "" : event.target.value.toUpperCase(),
                          }))
                        }
                      >
                        <option value="__none">Sem marcador</option>
                        {regulationMarkOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="admin-field">
                      <span>Codigo do set</span>
                      <input
                        value={draft.set_code}
                        placeholder="TEF"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, set_code: event.target.value.toUpperCase() }))
                        }
                      />
                    </label>

                    <label className="admin-field">
                      <span>Idioma</span>
                      <input
                        list="language-options"
                        value={draft.language}
                        placeholder="PT"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, language: event.target.value.toUpperCase() }))
                        }
                      />
                    </label>

                    <label className="admin-field">
                      <span>Ano</span>
                      <input
                        list="card-year-options"
                        value={draft.release_year}
                        placeholder="2024"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, release_year: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field">
                      <span>Set</span>
                      <input
                        list="set-name-options"
                        value={draft.set_name}
                        placeholder="Scarlet & Violet"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, set_name: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field">
                      <span>Serie</span>
                      <input
                        list="set-series-options"
                        value={draft.set_series}
                        placeholder="Sword & Shield"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, set_series: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field">
                      <span>Raridade</span>
                      <input
                        list="rarity-options"
                        value={draft.rarity}
                        placeholder="Rare"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, rarity: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field">
                      <span>Acabamento</span>
                      <select
                        value={draft.finish}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, finish: event.target.value }))
                        }
                      >
                        {finishOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="admin-field">
                      <span>Condicao</span>
                      <select
                        value={draft.condition}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, condition: event.target.value }))
                        }
                      >
                        {conditionOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="admin-field admin-field-full">
                      <span>Geracao</span>
                      <input
                        list="generation-options"
                        value={draft.pokemon_generation}
                        placeholder="generation-ix"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, pokemon_generation: event.target.value }))
                        }
                      />
                    </label>
                  </>
                )}

                {activeTab === "products" && (
                  <>
                    <label className="admin-field">
                      <span>Boosters na embalagem</span>
                      <input
                        type="number"
                        min="0"
                        value={draft.booster_pack_count}
                        placeholder="36"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, booster_pack_count: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field">
                      <span>Tipo de acessorio</span>
                      <input
                        value={draft.accessory_kind}
                        placeholder="pelucia, copo, pin"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, accessory_kind: event.target.value }))
                        }
                      />
                    </label>
                  </>
                )}

                <label className="admin-field admin-field-full">
                  <span>Tags de temporada (virgula)</span>
                  <input
                    value={draft.season_tags}
                    placeholder="megaevolucao, evolucoes-prismaticas"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, season_tags: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="admin-image-preview">
                <p>Preview da foto</p>
                {draft.image_url ? (
                  <img
                    src={draft.image_url}
                    alt={draft.name || "preview do produto"}
                    loading="lazy"
                    onError={(event) => {
                      logImageLoadError(event, "form-preview-main", draft.image_url, draft.name);
                    }}
                  />
                ) : (
                  <span>Adicione uma URL para visualizar a foto.</span>
                )}
                {previewGallery.length > 0 && (
                  <>
                    <p>Fotos adicionais ({previewGallery.length})</p>
                    <div className="admin-gallery-preview-grid">
                      {previewGallery.map((imageUrl) => (
                        <img
                          key={imageUrl}
                          src={imageUrl}
                          alt={draft.name || "foto adicional"}
                          loading="lazy"
                          onError={(event) => {
                            logImageLoadError(event, "form-preview-gallery", imageUrl, draft.name);
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={draft.is_special}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, is_special: event.target.checked }))
                  }
                />
                produto especial
              </label>

              <div className="admin-form-actions">
                <button type="submit">{editingSlug ? "Atualizar" : "Criar"}</button>
                <button type="button" className="ghost" onClick={resetForm}>
                  Limpar
                </button>
              </div>

              <datalist id="category-options">
                {categoryOptions.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>

              <datalist id="set-name-options">
                {setNameOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>

              <datalist id="set-series-options">
                {setSeriesOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>

              <datalist id="rarity-options">
                {rarityOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>

              <datalist id="finish-options">
                {finishOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>

              <datalist id="condition-options">
                {conditionOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>

              <datalist id="language-options">
                {languageOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>

              <datalist id="regulation-mark-options">
                {regulationMarkOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>

              <datalist id="generation-options">
                {generationOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>

              <datalist id="card-year-options">
                {yearOptions.map((item) => (
                  <option key={item} value={String(item)} />
                ))}
              </datalist>
            </form>

            <section className="admin-products">
              <header className="admin-products-header">
                <div>
                  <h2>
                    {activeTab === "cards" ? "Cards" : "Produtos"} ({visibleProducts.length}/
                    {tabProducts.length})
                  </h2>
                  <p>Listagem por categoria</p>
                </div>
                <div className="admin-products-filters">
                  <input
                    value={query}
                    placeholder="buscar por slug/nome/tipo"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <select
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                  >
                    <option value="all">Todas categorias</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </header>

              {loading && <p className="admin-state">Carregando...</p>}

              <div className="admin-categories">
                {!loading && groupedProducts.length === 0 && (
                  <p className="admin-empty">Nenhum item encontrado para esse filtro.</p>
                )}

                {groupedProducts.map((group) => (
                  <section key={group.category} className="admin-category-group">
                    <header>
                      <h3>{group.category}</h3>
                      <span>{group.items.length} itens</span>
                    </header>
                    <div className="admin-product-grid">
                      {group.items.map((product) => (
                        <article key={product.slug} className="admin-product-card">
                          <div className="admin-product-media">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                loading="lazy"
                                onError={(event) => {
                                  logImageLoadError(
                                    event,
                                    "catalog-product-card",
                                    product.image_url,
                                    product.name,
                                  );
                                }}
                              />
                            ) : (
                              <span className="admin-image-fallback">Sem foto</span>
                            )}
                          </div>
                          <div className="admin-product-content">
                            <strong>{product.name}</strong>
                            <p className="admin-product-slug">{product.slug}</p>
                            <p>Lote: {product.lot_id ?? "-"}</p>
                            <p>{product.product_type}</p>
                            {isCardType(product.product_type) ? (
                              <>
                                <p>
                                  {product.card_number ?? "sem numero"}
                                  {product.set_name ? ` - ${product.set_name}` : ""}
                                  {product.release_year ? ` - ${product.release_year}` : ""}
                                </p>
                                {product.finish && <p>{product.finish}</p>}
                                <p>
                                  {(product.regulation_mark ?? "-").toUpperCase()} -{" "}
                                  {(product.set_code ?? "---").toUpperCase()} {(product.language ?? "PT").toUpperCase()}
                                </p>
                              </>
                            ) : (
                              <p>
                                boosters: {product.booster_pack_count ?? 0}
                                {product.accessory_kind ? ` - ${product.accessory_kind}` : ""}
                              </p>
                            )}
                            <p>
                              Estoque: {product.stock} - {formatCurrency(product.price_brl)}
                            </p>
                            {(product.image_gallery?.length ?? 0) > 0 && (
                              <p>Fotos extras: {product.image_gallery.length}</p>
                            )}
                          </div>
                          <div className="admin-row-actions">
                            <button type="button" onClick={() => beginEdit(product)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => removeProduct(product.slug)}
                            >
                              Excluir
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </section>
        </>
      )}
    </main>
  );
}

export default App;
