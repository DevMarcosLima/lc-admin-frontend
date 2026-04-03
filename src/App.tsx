import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  createAdminProduct,
  deleteAdminProduct,
  fetchAdminAnalyticsSummary,
  fetchAdminProducts,
  fetchCardLookup,
  fetchCardMetadataOptions,
  updateAdminProduct,
} from "./services/adminApi";
import type {
  AnalyticsSummaryItem,
  CardLookupItem,
  CardMetadataOptionsResponse,
  StoreProduct,
} from "./types/store";

const TOKEN_STORAGE_KEY = "legacy_cards_admin_token";
const DEFAULT_ADMIN_TOKEN = (import.meta.env.VITE_ADMIN_TOKEN ?? "").trim();

type AdminTab = "cards" | "products";

type ProductDraft = {
  slug: string;
  name: string;
  product_type: string;
  category: string;
  stock: string;
  price_brl: string;
  image_url: string;
  set_name: string;
  set_series: string;
  rarity: string;
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

type CategoryGroup = {
  category: string;
  items: StoreProduct[];
};

type DuplicatePrompt = {
  duplicate: StoreProduct;
  incoming: StoreProduct;
};

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
      category: "Cartas avulsas",
      stock: "1",
      price_brl: "0",
      image_url: "",
      set_name: "",
      set_series: "",
      rarity: "",
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
    category: "Booster",
    stock: "1",
    price_brl: "0",
    image_url: "",
    set_name: "",
    set_series: "",
    rarity: "",
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
    category: normalizeCategory(product.category),
    stock: String(product.stock),
    price_brl: String(product.price_brl),
    image_url: product.image_url,
    set_name: product.set_name ?? "",
    set_series: product.set_series ?? "",
    rarity: product.rarity ?? "",
    condition: product.condition ?? "",
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

function toProduct(draft: ProductDraft): StoreProduct {
  return {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    product_type: draft.product_type.trim(),
    category: normalizeCategory(draft.category),
    stock: Number(draft.stock || "0"),
    price_brl: Number(draft.price_brl || "0"),
    image_url: draft.image_url.trim(),
    set_name: draft.set_name.trim() || null,
    set_series: draft.set_series.trim() || null,
    rarity: draft.rarity.trim() || null,
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizedIdentity(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function cardIdentityKey(product: StoreProduct): string {
  return [
    normalizedIdentity(product.name),
    normalizedIdentity(product.card_number),
    normalizedIdentity(product.set_name),
    normalizedIdentity(product.set_series),
    normalizedIdentity(product.rarity),
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

function App() {
  const [tokenInput, setTokenInput] = useState(
    () => localStorage.getItem(TOKEN_STORAGE_KEY) ?? DEFAULT_ADMIN_TOKEN,
  );
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem(TOKEN_STORAGE_KEY) ?? DEFAULT_ADMIN_TOKEN,
  );
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
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePrompt | null>(null);
  const [duplicateActionLoading, setDuplicateActionLoading] = useState(false);

  // TEST MODE (TEMPORARIO): auth desabilitada no admin frontend.
  // const connected = adminToken.trim().length > 0;
  const connected = true;

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
          setError(err instanceof Error ? err.message : "Falha ao carregar painel admin");
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
    setSelectedCategory("all");
    setCardLookupItems([]);
    setCardLookupError(null);
    setCardLookupQuery("");
    setDuplicatePrompt(null);

    setDraft((current) => {
      if (activeTab === "cards") {
        return {
          ...current,
          product_type: "single_card",
          category: current.category || "Cartas avulsas",
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

  function connectToken() {
    const sanitized = tokenInput.trim();
    setAdminToken(sanitized);
    if (!sanitized) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return;
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, sanitized);
  }

  function resetForm() {
    setEditingSlug(null);
    setDraft(emptyDraft(activeTab));
    setCardLookupItems([]);
    setCardLookupError(null);
    setCardLookupQuery("");
    setDuplicatePrompt(null);
  }

  function beginEdit(product: StoreProduct) {
    const tab: AdminTab = isCardType(product.product_type) ? "cards" : "products";
    setActiveTab(tab);
    setEditingSlug(product.slug);
    setDraft(toDraft(product));
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

    try {
      const saved = editingSlug
        ? await updateAdminProduct(adminToken, editingSlug, payload)
        : await createAdminProduct(adminToken, payload);

      setProducts((current) => {
        const without = current.filter((item) => item.slug !== editingSlug && item.slug !== saved.slug);
        return [...without, saved].sort((left, right) => left.slug.localeCompare(right.slug));
      });

      setStatus(editingSlug ? "Produto atualizado." : "Produto criado.");
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
      }
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

    setDraft((current) => ({
      ...current,
      product_type: "single_card",
      slug: current.slug || generatedSlug,
      name: item.name,
      image_url: imageUrl || current.image_url,
      card_number: item.local_number ?? item.number,
      set_name: item.set_name,
      set_code: (item.set_code ?? item.set_id).toUpperCase(),
      set_series: item.set_series ?? current.set_series,
      rarity: item.rarity ?? current.rarity,
      release_year: item.release_year ? String(item.release_year) : current.release_year,
      pokemon_generation: item.pokemon_generation ?? current.pokemon_generation,
      language: current.language || "PT",
      category: current.category || "Cartas avulsas",
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
      </header>

      <section className="admin-auth">
        <label htmlFor="admin-token">Admin Token</label>
        <input
          id="admin-token"
          type="password"
          value={tokenInput}
          onChange={(event) => {
            setTokenInput(event.target.value);
          }}
          placeholder="X-Admin-Token"
        />
        <button type="button" onClick={connectToken}>
          Conectar
        </button>
      </section>

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
                      onChange={(event) => setCardLookupQuery(event.target.value)}
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
                              <img src={item.image_small} alt={item.name} loading="lazy" />
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
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.price_brl}
                    placeholder="price_brl"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, price_brl: event.target.value }))
                    }
                  />
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
                      <input
                        list="regulation-mark-options"
                        value={draft.regulation_mark}
                        placeholder="H"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, regulation_mark: event.target.value.toUpperCase() }))
                        }
                      />
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
                      <span>Condicao</span>
                      <input
                        list="condition-options"
                        value={draft.condition}
                        placeholder="Near Mint (NM)"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, condition: event.target.value }))
                        }
                      />
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
                  <img src={draft.image_url} alt={draft.name || "preview do produto"} loading="lazy" />
                ) : (
                  <span>Adicione uma URL para visualizar a foto.</span>
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
                              <img src={product.image_url} alt={product.name} loading="lazy" />
                            ) : (
                              <span className="admin-image-fallback">Sem foto</span>
                            )}
                          </div>
                          <div className="admin-product-content">
                            <strong>{product.name}</strong>
                            <p className="admin-product-slug">{product.slug}</p>
                            <p>{product.product_type}</p>
                            {isCardType(product.product_type) ? (
                              <>
                                <p>
                                  {product.card_number ?? "sem numero"}
                                  {product.set_name ? ` - ${product.set_name}` : ""}
                                  {product.release_year ? ` - ${product.release_year}` : ""}
                                </p>
                                <p>
                                  {(product.regulation_mark ?? "-").toUpperCase()} |{" "}
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
