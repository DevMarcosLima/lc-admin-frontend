import { CSSProperties, ChangeEvent, FormEvent, SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  AdminApiError,
  completeSellerOnboarding,
  createAdminSeller,
  createAdminProduct,
  deleteAdminProduct,
  fetchAdminAnalyticsSummary,
  fetchAdminBrandingConfig,
  fetchAdminCategoriesConfig,
  fetchAdminMe,
  fetchAdminMenuConfig,
  fetchAdminSalesMetrics,
  fetchAdminSalesOrders,
  updateAdminSalesOrderProcess,
  fetchAdminSellers,
  fetchAdminWebhookEvents,
  fetchLotImportStatus,
  fetchAdminProducts,
  fetchAdminSellerPayoutConfig,
  fetchCardLookup,
  fetchCardMetadataOptions,
  fetchSellerPayoutConfig,
  fetchSellerProducts,
  fetchSellerSalesMetrics,
  fetchSellerSalesOrders,
  updateSellerSalesOrderProcess,
  fetchSellerTemplates,
  loginAdmin,
  logoutAdmin,
  publishSellerProduct,
  runCatalogAssistant,
  startLotImport,
  updateSellerProductPrice,
  withdrawSellerProductStock,
  updateAdminBrandingConfig,
  updateAdminProduct,
  updateAdminSellerPayoutConfig,
  updateAdminSellerStatus,
  uploadAdminImage,
  verifyAdminTwoFactor,
} from "./services/adminApi";
import { readRuntimeEnv } from "./services/runtimeConfig";
import type {
  AdminCategoryConfigResponse,
  AdminBrandingConfigResponse,
  AdminMenuConfigResponse,
  AdminImageUploadScope,
  AnalyticsSummaryItem,
  CatalogAssistantAction,
  CatalogAssistantFinding,
  CatalogAssistantResponse,
  CardLookupItem,
  CardMetadataOptionsResponse,
  LotImportJobResponse,
  SalesMetricsResponse,
  SalesOrderProcessUpdateRequest,
  SalesOrderRecord,
  SellerAccountSummary,
  SellerPayoutConfigUpdateRequest,
  SellerPayoutRuleConfig,
  StoreProduct,
  WebhookEventRecord,
} from "./types/store";

const DEFAULT_ADMIN_EMAIL = readRuntimeEnv("VITE_ADMIN_EMAIL") || "marcos_dev@icloud.com";
const ADMIN_SESSION_STORAGE_KEY = "legacy-cards-admin-session-v3";
const LEGACY_ADMIN_LOCAL_STORAGE_KEY = "legacy-cards-admin-session-v1";

type AdminTab = "cards" | "products";
type AdminRole = "admin" | "seller";
type AdminPage =
  | "home"
  | "usual_edit"
  | "catalog_create"
  | "sales_metrics"
  | "sales"
  | "process"
  | "webhooks"
  | "sellers"
  | "settings"
  | "seller_products"
  | "seller_sales"
  | "seller_process";
type EditorMode = "create" | "edit";

type StoredAdminSession = {
  token: string;
  role: AdminRole | null;
  email: string | null;
  shopName: string | null;
  shopSlug: string | null;
  expiresAt: number;
};

function readStoredAdminSession(): StoredAdminSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  // Remove sessão legada que armazenava token no localStorage.
  window.localStorage.removeItem(LEGACY_ADMIN_LOCAL_STORAGE_KEY);

  const raw = window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as StoredAdminSession;
    if (!payload?.token || typeof payload.expiresAt !== "number") {
      window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    if (Date.now() >= payload.expiresAt) {
      window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    return payload;
  } catch {
    window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    return null;
  }
}

function persistAdminSession(session: StoredAdminSession): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredAdminSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}

type ProductDraft = {
  slug: string;
  name: string;
  product_type: string;
  seller_template_enabled: boolean;
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
  language_tag_enabled: boolean;
  release_year: string;
  pokemon_generation: string;
  pokemon_types: string;
  description: string;
  observations: string;
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

type SellerPayoutDraft = SellerPayoutConfigUpdateRequest;

type ProcessOrderDraft = {
  fulfillment_status: SalesOrderProcessUpdateRequest["fulfillment_status"];
  cancel_reason: string;
  tracking_code: string;
};

type AdminBrandingDraft = Omit<AdminBrandingConfigResponse, "updated_at">;

const DEFAULT_ADMIN_BRANDING: AdminBrandingDraft = {
  hero_logo_primary_url: "/logo.webp",
  hero_logo_secondary_url: "/logo.webp",
  hero_logo_primary_width: 140,
  hero_logo_secondary_width: 140,
  hero_slide_targets: [],
  hero_slides: [],
};
const HERO_SLIDE_SETTINGS_COUNT = 3;
const BRANDING_PREVIEW_DEFAULT_COPY = [
  {
    name: "Coleção Treinador Avançado",
    category: "Pré-venda",
    product_type: "Box de treinador",
    price_brl: 299.9,
  },
  {
    name: "Combo de boosters",
    category: "Pré-venda",
    product_type: "Pacote combo",
    price_brl: 139.9,
  },
  {
    name: "Booster unitário",
    category: "Pré-venda",
    product_type: "Booster",
    price_brl: 12.9,
  },
] as const;
const BRANDING_DEFAULT_FOCUS_X_PERCENT = 52;

const PRODUCT_TYPE_OPTIONS = [
  { value: "single_card", label: "Carta avulsa" },
  { value: "booster", label: "Booster" },
  { value: "blister", label: "Blister" },
  { value: "collector_box", label: "Box" },
  { value: "trainer_box", label: "Box de treinador" },
  { value: "tin", label: "Lata" },
  { value: "accessory", label: "Acessório" },
];

const CATEGORY_PRESET_BY_TAB: Record<AdminTab, string[]> = {
  cards: ["Cartas avulsas", "Promos", "Box"],
  products: [
    "Booster",
    "Blister",
    "Box",
    "Box de treinador",
    "Lata",
    "Pelúcia",
    "Boton",
    "Copo",
  ],
};

const ACCESSORY_CATEGORY_PRESET = ["Pelúcia", "Boton", "Copo"];
const PRODUCT_CATEGORY_PRESET_BY_TYPE: Record<string, string[]> = {
  booster: ["Booster"],
  blister: ["Blister"],
  collector_box: ["Box"],
  trainer_box: ["Box de treinador"],
  tin: ["Lata"],
  accessory: ACCESSORY_CATEGORY_PRESET,
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
  "Reverse Holo Element (Reverse Foil)",
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

const ADMIN_PAGE_OPTIONS: Array<{ value: AdminPage; label: string }> = [
  { value: "home", label: "Home" },
  { value: "usual_edit", label: "Edição usual" },
  { value: "catalog_create", label: "Cadastro cards/produtos" },
  { value: "sales_metrics", label: "Métrica de vendas" },
  { value: "sales", label: "Vendas" },
  { value: "process", label: "Processar" },
  { value: "webhooks", label: "Webhooks" },
  { value: "sellers", label: "Vendedores" },
  { value: "settings", label: "Configurações" },
];

const SELLER_PAGE_OPTIONS: Array<{ value: AdminPage; label: string }> = [
  { value: "seller_products", label: "Produtos" },
  { value: "seller_sales", label: "Vendas" },
  { value: "seller_process", label: "Processar" },
];

const SELLER_DEFAULT_BASE_FEE_BRL = 6;
const SELLER_FIXED_TAX_PERCENT = 10;
const CATALOG_GRID_COLUMN_OPTIONS = [2, 3, 4, 5, 6, 7] as const;

const SALES_STATUS_OPTIONS = [
  { value: "all", label: "Todos os status" },
  { value: "approved", label: "Aprovado" },
  { value: "pending", label: "Pendente" },
  { value: "in_process", label: "Em processamento" },
  { value: "rejected", label: "Recusado" },
  { value: "cancelled", label: "Cancelado" },
];

const WEBHOOK_STATUS_OPTIONS = [
  { value: "all", label: "Todos os eventos" },
  { value: "updated:approved", label: "Atualizado aprovado" },
  { value: "updated:pending", label: "Atualizado pendente" },
  { value: "updated:rejected", label: "Atualizado recusado" },
  { value: "ignored", label: "Ignorado" },
  { value: "error:firestore_update", label: "Erro Firestore" },
];

const PROCESS_FULFILLMENT_STATUS_OPTIONS: Array<{
  value: SalesOrderProcessUpdateRequest["fulfillment_status"];
  label: string;
}> = [
  { value: "em_separacao", label: "Em separação" },
  { value: "em_preparacao", label: "Em preparação" },
  { value: "separado", label: "Separado" },
  { value: "rota_transportadora", label: "Rota para transportadora" },
  { value: "enviado", label: "Enviado" },
  { value: "cancelado", label: "Cancelado" },
];

const ASSISTANT_ACTION_BUTTONS: Array<{
  action: CatalogAssistantAction;
  label: string;
  description: string;
  applyDirectly?: boolean;
}> = [
  {
    action: "find_price_outliers",
    label: "Procurar valores estranhos",
    description: "Compara cartas similares e sinaliza valores fora do padrão.",
  },
  {
    action: "find_card_inconsistencies",
    label: "Cartas estranhas",
    description: "Procura inconsistências de nome, set, acabamento e dados faltando.",
  },
  {
    action: "refresh_market_prices",
    label: "Atualizar preço de mercado das selecionadas",
    description: "Consulta API de mercado e aplica preço sugerido nas cartas selecionadas.",
    applyDirectly: true,
  },
];

function isCardType(productType: string): boolean {
  return productType === "single_card";
}

function normalizeCategory(category: string): string {
  const sanitized = category.trim();
  return sanitized.length > 0 ? sanitized : "Sem categoria";
}

function normalizeSearchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resolveAccessoryCategoryLabel(value: string): string | null {
  const key = normalizeSearchKey(value);
  if (key === "pelucia" || key === "plush") {
    return "Pelúcia";
  }
  if (key === "boton" || key === "botao" || key === "pin" || key === "broche") {
    return "Boton";
  }
  if (key === "copo" || key === "cup" || key === "caneca" || key === "mug" || key === "tumbler") {
    return "Copo";
  }
  return null;
}

function normalizeAccessoryCategoryLabel(value: string): string {
  const normalized = normalizeCategory(value);
  return resolveAccessoryCategoryLabel(normalized) ?? normalized;
}

function isAccessoryCategoryLabel(value: string): boolean {
  const key = normalizeSearchKey(value);
  return (
    resolveAccessoryCategoryLabel(value) !== null
    || key === "acessorio"
    || key === "acessorios"
    || key === "acessorios pokemon"
  );
}

function toAccessoryKindToken(value: string): string | null {
  const normalized = normalizeSearchKey(value);
  if (!normalized) {
    return null;
  }
  const alias = resolveAccessoryCategoryLabel(value);
  if (alias === "Pelúcia") {
    return "plush";
  }
  if (alias === "Boton") {
    return "pin";
  }
  if (alias === "Copo") {
    return "cup";
  }
  const token = normalized.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return token || null;
}

function resolveDefaultCategoryForProductType(productType: string): string {
  const fallbackByType = PRODUCT_CATEGORY_PRESET_BY_TYPE[productType];
  if (fallbackByType && fallbackByType.length > 0) {
    return fallbackByType[0];
  }
  return "Booster";
}

function findCategoryOptionMatch(options: string[], value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return options.find((item) => item.trim().toLowerCase() === normalized) ?? null;
}

function emptyDraft(tab: AdminTab): ProductDraft {
  if (tab === "cards") {
    return {
      slug: "",
      name: "",
      product_type: "single_card",
      seller_template_enabled: true,
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
      language: "",
      language_tag_enabled: false,
      release_year: "",
      pokemon_generation: "",
      pokemon_types: "",
      description: "",
      observations: "",
      booster_pack_count: "",
      season_tags: "",
      is_special: false,
    };
  }

  return {
    slug: "",
    name: "",
    product_type: "booster",
    seller_template_enabled: true,
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
    language: "",
    language_tag_enabled: false,
    release_year: "",
    pokemon_generation: "",
    pokemon_types: "",
    description: "",
    observations: "",
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
    seller_template_enabled: product.seller_template_enabled ?? true,
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
    language_tag_enabled: Boolean((product.language ?? "").trim()),
    release_year: product.release_year ? String(product.release_year) : "",
    pokemon_generation: product.pokemon_generation ?? "",
    pokemon_types: (product.pokemon_types ?? []).join(", "),
    description: product.description ?? "",
    observations: product.observations ?? "",
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

function appendImageGalleryUrls(
  currentValue: string,
  incomingUrls: string[],
  primaryImageUrl: string,
): string {
  const existing = parseImageGallery(currentValue, primaryImageUrl);
  const existingSet = new Set(existing);

  for (const rawUrl of incomingUrls) {
    const url = rawUrl.trim();
    if (!url || url === primaryImageUrl.trim() || existingSet.has(url)) {
      continue;
    }
    existingSet.add(url);
    existing.push(url);
  }

  return existing.join("\n");
}

function parsePokemonTypes(value: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const lowered = item.toLowerCase();
      if (seen.has(lowered)) {
        return;
      }
      seen.add(lowered);
      values.push(item);
    });
  return values;
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

function formatBrlCurrencyFromNumber(value: number): string {
  return `R$ ${formatBrlFromNumber(value)}`;
}

function formatBrlCurrencyInputMask(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  const cents = Number(digits) / 100;
  return formatBrlCurrencyFromNumber(cents);
}

function parseBrlToNumber(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const sanitized = trimmed.replace(/[^\d,.-]/g, "");
  if (!sanitized) {
    return Number.NaN;
  }

  const hasComma = sanitized.includes(",");
  let normalized = sanitized;

  if (hasComma) {
    normalized = sanitized.replace(/\./g, "").replace(",", ".");
  } else if (sanitized.includes(".")) {
    const dotParts = sanitized.split(".");
    const lastChunk = dotParts[dotParts.length - 1] ?? "";
    if (lastChunk.length === 3) {
      normalized = dotParts.join("");
    } else {
      const integerChunk = dotParts.slice(0, -1).join("");
      normalized = `${integerChunk}.${lastChunk}`;
    }
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function parsePositiveInteger(value: string, fallback = 1): number {
  const numeric = Number(digitsOnly(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

function toProduct(draft: ProductDraft): StoreProduct {
  const normalizedProductType = draft.product_type.trim();
  const normalizedCategory = normalizeCategory(draft.category);
  const accessoryKind =
    normalizedProductType === "accessory" ? toAccessoryKindToken(normalizedCategory) : null;

  return {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    product_type: normalizedProductType,
    seller_template_enabled: draft.seller_template_enabled,
    lot_id: draft.lot_id.trim() || null,
    category: normalizedCategory,
    accessory_kind: accessoryKind,
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
    language: draft.language_tag_enabled ? draft.language.trim().toUpperCase() || null : null,
    release_year: parseOptionalInt(draft.release_year),
    pokemon_generation: draft.pokemon_generation.trim() || null,
    pokemon_types: parsePokemonTypes(draft.pokemon_types),
    description: draft.description.trim() || null,
    observations: draft.observations.trim() || null,
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

function toMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function toNonNegativeMoney(value: number): number {
  return Math.max(0, toMoney(value));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatStatusLabel(status: string | null | undefined): string {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) {
    return "desconhecido";
  }
  return normalized
    .replace(/_/g, " ")
    .replace(/:/g, " - ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeFulfillmentStatus(
  value: string | null | undefined,
): SalesOrderProcessUpdateRequest["fulfillment_status"] | null {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalized) {
    return null;
  }

  const aliases: Record<string, SalesOrderProcessUpdateRequest["fulfillment_status"]> = {
    em_separacao: "em_separacao",
    em_preparacao: "em_preparacao",
    separado: "separado",
    rota_transportadora: "rota_transportadora",
    rota_para_transportadora: "rota_transportadora",
    enviado: "enviado",
    cancelado: "cancelado",
  };

  return aliases[normalized] ?? null;
}

function resolveOrderFulfillmentStatus(order: SalesOrderRecord): SalesOrderProcessUpdateRequest["fulfillment_status"] {
  const explicit = normalizeFulfillmentStatus(order.fulfillment_status);
  if (explicit) {
    return explicit;
  }

  const paymentStatus = (order.status ?? "").trim().toLowerCase();
  if (paymentStatus === "approved") {
    return "em_separacao";
  }
  return "em_separacao";
}

function formatShippingLabel(order: SalesOrderRecord): string {
  const carrier = (order.shipping_carrier ?? "").trim();
  const serviceName = (order.shipping_service_name ?? "").trim();
  if (carrier && serviceName) {
    return `${carrier} • ${serviceName}`;
  }
  if (serviceName) {
    return serviceName;
  }
  if (carrier) {
    return carrier;
  }

  const normalized = (order.shipping_id ?? "").trim().toLowerCase();
  if (!normalized) {
    return "-";
  }
  const aliasMap: Record<string, string> = {
    economico: "Econômico",
    expresso: "Expresso",
    turbo: "Turbo",
    "correios-pac": "Correios • PAC",
    "correios-sedex": "Correios • SEDEX",
  };
  if (aliasMap[normalized]) {
    return aliasMap[normalized];
  }
  if (normalized.startsWith("melhor_envio-")) {
    return `Melhor Envio • ${normalized.replace("melhor_envio-", "").toUpperCase()}`;
  }
  return formatStatusLabel(normalized);
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

function hasSuggestedPrice(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function dedupeFixableFindings(findings: CatalogAssistantFinding[]): CatalogAssistantFinding[] {
  const bySlug = new Map<string, CatalogAssistantFinding>();
  findings.forEach((finding) => {
    if (!hasSuggestedPrice(finding.suggested_price_brl)) {
      return;
    }
    if (!bySlug.has(finding.slug)) {
      bySlug.set(finding.slug, finding);
      return;
    }

    const current = bySlug.get(finding.slug);
    if (!current) {
      bySlug.set(finding.slug, finding);
      return;
    }

    const severityRank = { high: 3, medium: 2, low: 1 } as const;
    if (severityRank[finding.severity] > severityRank[current.severity]) {
      bySlug.set(finding.slug, finding);
    }
  });
  return [...bySlug.values()];
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
  const initialSession = readStoredAdminSession();
  const [adminToken, setAdminToken] = useState(() => initialSession?.token ?? "");
  const [adminEmail, setAdminEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [adminPassword, setAdminPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [onboardingChallenge, setOnboardingChallenge] = useState<string | null>(null);
  const [onboardingCode, setOnboardingCode] = useState("");
  const [onboardingPassword, setOnboardingPassword] = useState("");
  const [onboardingPasswordConfirm, setOnboardingPasswordConfirm] = useState("");
  const [onboardingQrUri, setOnboardingQrUri] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authRole, setAuthRole] = useState<AdminRole | null>(() => initialSession?.role ?? null);
  const [loggedEmail, setLoggedEmail] = useState<string | null>(() => initialSession?.email ?? null);
  const [loggedShopName, setLoggedShopName] = useState<string | null>(
    () => initialSession?.shopName ?? null,
  );
  const [loggedShopSlug, setLoggedShopSlug] = useState<string | null>(
    () => initialSession?.shopSlug ?? null,
  );
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [sellerTemplates, setSellerTemplates] = useState<StoreProduct[]>([]);
  const [sellerAccounts, setSellerAccounts] = useState<SellerAccountSummary[]>([]);
  const [newSellerEmail, setNewSellerEmail] = useState("");
  const [newSellerShopName, setNewSellerShopName] = useState("");
  const [createdSellerTempPassword, setCreatedSellerTempPassword] = useState<string | null>(null);
  const [expandedSellerEmail, setExpandedSellerEmail] = useState<string | null>(null);
  const [sellerPayoutDrafts, setSellerPayoutDrafts] = useState<Record<string, SellerPayoutDraft>>({});
  const [sellerPayoutLoadingEmail, setSellerPayoutLoadingEmail] = useState<string | null>(null);
  const [sellerPayoutSavingEmail, setSellerPayoutSavingEmail] = useState<string | null>(null);
  const [sellerStatusSavingEmail, setSellerStatusSavingEmail] = useState<string | null>(null);
  const [sellerTemplateQuantities, setSellerTemplateQuantities] = useState<Record<string, string>>({});
  const [sellerTemplatePrices, setSellerTemplatePrices] = useState<Record<string, string>>({});
  const [sellerPendingStockDelta, setSellerPendingStockDelta] = useState<Record<string, number>>({});
  const [sellerStockRequestsByTemplate, setSellerStockRequestsByTemplate] = useState<Record<string, number>>({});
  const [sellerPriceSavingSlug, setSellerPriceSavingSlug] = useState<string | null>(null);
  const [sellerUseTemplateImage, setSellerUseTemplateImage] = useState(true);
  const [sellerCustomImageUrl, setSellerCustomImageUrl] = useState("");
  const [sellerOwnPayoutConfig, setSellerOwnPayoutConfig] = useState<SellerPayoutDraft | null>(null);
  const [sellerOwnPayoutLoading, setSellerOwnPayoutLoading] = useState(false);
  const [sellerDetailsModalSlug, setSellerDetailsModalSlug] = useState<string | null>(null);
  const [menuConfigItems, setMenuConfigItems] = useState<AdminMenuConfigResponse["items"]>([]);
  const [brandingConfig, setBrandingConfig] = useState<AdminBrandingDraft>(DEFAULT_ADMIN_BRANDING);
  const [brandingSlideSearch, setBrandingSlideSearch] = useState<Record<number, string>>({});
  const [panelCategories, setPanelCategories] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryItem[]>([]);
  const [salesMetrics, setSalesMetrics] = useState<SalesMetricsResponse | null>(null);
  const [salesMetricsDays, setSalesMetricsDays] = useState(30);
  const [salesMetricsLoading, setSalesMetricsLoading] = useState(false);
  const [salesOrders, setSalesOrders] = useState<SalesOrderRecord[]>([]);
  const [salesOrdersPage, setSalesOrdersPage] = useState(1);
  const [salesOrdersHasMore, setSalesOrdersHasMore] = useState(false);
  const [salesOrdersTotal, setSalesOrdersTotal] = useState(0);
  const [salesOrdersLoading, setSalesOrdersLoading] = useState(false);
  const [salesStatusFilter, setSalesStatusFilter] = useState("all");
  const [salesSearchInput, setSalesSearchInput] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [processOrders, setProcessOrders] = useState<SalesOrderRecord[]>([]);
  const [processOrdersPage, setProcessOrdersPage] = useState(1);
  const [processOrdersHasMore, setProcessOrdersHasMore] = useState(false);
  const [processOrdersTotal, setProcessOrdersTotal] = useState(0);
  const [processOrdersLoading, setProcessOrdersLoading] = useState(false);
  const [processSearchInput, setProcessSearchInput] = useState("");
  const [processSearch, setProcessSearch] = useState("");
  const [processDrafts, setProcessDrafts] = useState<Record<string, ProcessOrderDraft>>({});
  const [processSavingOrderId, setProcessSavingOrderId] = useState<string | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventRecord[]>([]);
  const [webhookEventsPage, setWebhookEventsPage] = useState(1);
  const [webhookEventsHasMore, setWebhookEventsHasMore] = useState(false);
  const [webhookEventsTotal, setWebhookEventsTotal] = useState(0);
  const [webhookEventsLoading, setWebhookEventsLoading] = useState(false);
  const [webhookStatusFilter, setWebhookStatusFilter] = useState("all");
  const [webhookSearchInput, setWebhookSearchInput] = useState("");
  const [webhookSearch, setWebhookSearch] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [cardOptions, setCardOptions] = useState<CardMetadataOptionsResponse | null>(null);
  const [activePage, setActivePage] = useState<AdminPage>("usual_edit");
  const [activeTab, setActiveTab] = useState<AdminTab>("cards");
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [catalogGridColumns, setCatalogGridColumns] = useState<number>(5);
  const [selectedProductSlugs, setSelectedProductSlugs] = useState<string[]>([]);
  const [assistantScope, setAssistantScope] = useState<"selected" | "all">("selected");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantFixingAll, setAssistantFixingAll] = useState(false);
  const [assistantFixingSlug, setAssistantFixingSlug] = useState<string | null>(null);
  const [assistantResult, setAssistantResult] = useState<CatalogAssistantResponse | null>(null);
  const [cardLookupQuery, setCardLookupQuery] = useState("");
  const [cardLookupItems, setCardLookupItems] = useState<CardLookupItem[]>([]);
  const [cardLookupLoading, setCardLookupLoading] = useState(false);
  const [cardLookupError, setCardLookupError] = useState<string | null>(null);
  const [metadataWarning, setMetadataWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(() => emptyDraft("cards"));
  const [suggestedPrice, setSuggestedPrice] = useState<PriceSuggestion | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePrompt | null>(null);
  const [duplicateActionLoading, setDuplicateActionLoading] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState<StoreProduct | null>(null);
  const [deleteActionLoading, setDeleteActionLoading] = useState<"single" | "full" | null>(null);
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
  const [mainImageUploadBusy, setMainImageUploadBusy] = useState(false);
  const [galleryImageUploadBusy, setGalleryImageUploadBusy] = useState(false);
  const [brandingPrimaryUploadBusy, setBrandingPrimaryUploadBusy] = useState(false);
  const [brandingSecondaryUploadBusy, setBrandingSecondaryUploadBusy] = useState(false);
  const [brandingSlideUploadBusyByIndex, setBrandingSlideUploadBusyByIndex] = useState<Record<number, boolean>>({});
  const mainImageInlineInputRef = useRef<HTMLInputElement | null>(null);
  const galleryImageInlineInputRef = useRef<HTMLInputElement | null>(null);
  const mainImageModalInputRef = useRef<HTMLInputElement | null>(null);
  const galleryImageModalInputRef = useRef<HTMLInputElement | null>(null);
  const brandingPrimaryInputRef = useRef<HTMLInputElement | null>(null);
  const brandingSecondaryInputRef = useRef<HTMLInputElement | null>(null);
  const brandingSlideInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const lotImportJobId = lotImportJob?.job_id ?? null;
  const lotImportJobStatus = lotImportJob?.status ?? null;

  const connected = adminToken.trim().length > 0;
  const pageOptions = authRole === "seller" ? SELLER_PAGE_OPTIONS : ADMIN_PAGE_OPTIONS;

  function disconnectSession(reason?: string): void {
    clearStoredAdminSession();
    void logoutAdmin().catch(() => undefined);
    setAdminToken("");
    setAuthRole(null);
    setLoggedEmail(null);
    setLoggedShopName(null);
    setLoggedShopSlug(null);
    setTwoFactorEnabled(false);
    setTwoFactorChallenge(null);
    setTwoFactorCode("");
    setOnboardingChallenge(null);
    setOnboardingQrUri(null);
    setOnboardingCode("");
    setOnboardingPassword("");
    setOnboardingPasswordConfirm("");
    setAdminPassword("");
    setProducts([]);
    setSellerTemplates([]);
    setSellerAccounts([]);
    setExpandedSellerEmail(null);
    setSellerPayoutDrafts({});
    setSellerPayoutLoadingEmail(null);
    setSellerPayoutSavingEmail(null);
    setSellerTemplateQuantities({});
    setSellerTemplatePrices({});
    setSellerPendingStockDelta({});
    setSellerStockRequestsByTemplate({});
    setSellerPriceSavingSlug(null);
    setSellerUseTemplateImage(true);
    setSellerCustomImageUrl("");
    setSellerOwnPayoutConfig(null);
    setSellerOwnPayoutLoading(false);
    setSellerDetailsModalSlug(null);
    setCreatedSellerTempPassword(null);
    setMenuConfigItems([]);
    setBrandingConfig(DEFAULT_ADMIN_BRANDING);
    setBrandingSlideSearch({});
    setPanelCategories([]);
    setAnalytics([]);
    setSalesMetrics(null);
    setSalesOrders([]);
    setSalesOrdersPage(1);
    setSalesOrdersHasMore(false);
    setSalesOrdersTotal(0);
    setSalesStatusFilter("all");
    setSalesSearchInput("");
    setSalesSearch("");
    setProcessOrders([]);
    setProcessOrdersPage(1);
    setProcessOrdersHasMore(false);
    setProcessOrdersTotal(0);
    setProcessSearchInput("");
    setProcessSearch("");
    setProcessDrafts({});
    setProcessSavingOrderId(null);
    setWebhookEvents([]);
    setWebhookEventsPage(1);
    setWebhookEventsHasMore(false);
    setWebhookEventsTotal(0);
    setWebhookStatusFilter("all");
    setWebhookSearchInput("");
    setWebhookSearch("");
    setEditModalOpen(false);
    setEditingSlug(null);
    setDraft(emptyDraft("cards"));
    setMainImageUploadBusy(false);
    setGalleryImageUploadBusy(false);
    setBrandingPrimaryUploadBusy(false);
    setBrandingSecondaryUploadBusy(false);
    setBrandingSlideUploadBusyByIndex({});
    setEditorMode("create");
    setSelectedProductSlugs([]);
    setAssistantResult(null);
    setAssistantError(null);
    setAssistantLoading(false);
    setAssistantFixingAll(false);
    setAssistantFixingSlug(null);
    setActivePage("usual_edit");
    if (reason) {
      setAuthError(reason);
    }
  }

  useEffect(() => {
    if (!connected) {
      setProducts([]);
      setSellerTemplates([]);
      setSellerAccounts([]);
      setExpandedSellerEmail(null);
      setSellerPayoutDrafts({});
      setSellerPayoutLoadingEmail(null);
      setSellerPayoutSavingEmail(null);
      setSellerTemplatePrices({});
      setSellerOwnPayoutConfig(null);
      setSellerOwnPayoutLoading(false);
      setSellerDetailsModalSlug(null);
      setSellerPendingStockDelta({});
      setSellerStockRequestsByTemplate({});
      setSellerPriceSavingSlug(null);
      setMenuConfigItems([]);
      setPanelCategories([]);
      setAnalytics([]);
      setSalesMetrics(null);
      setSalesOrders([]);
      setProcessOrders([]);
      setProcessOrdersPage(1);
      setProcessOrdersHasMore(false);
      setProcessOrdersTotal(0);
      setProcessSearchInput("");
      setProcessSearch("");
      setProcessDrafts({});
      setProcessSavingOrderId(null);
      setWebhookEvents([]);
      setCardOptions(null);
      setMetadataWarning(null);
      setMainImageUploadBusy(false);
      setGalleryImageUploadBusy(false);
      setAuthRole(null);
      setLoggedShopName(null);
      setLoggedShopSlug(null);
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
        setAuthRole(me.role);
        setLoggedShopName(me.shop_name);
        setLoggedShopSlug(me.shop_slug);
        setTwoFactorEnabled(me.two_factor_enabled);

        if (me.role === "seller") {
          setSellerOwnPayoutLoading(true);
          setActivePage((current) =>
            current === "seller_products" ||
            current === "seller_sales" ||
            current === "seller_process"
              ? current
              : "seller_products",
          );
          const [sellerProducts, templates, payoutConfig] = await Promise.all([
            fetchSellerProducts(adminToken),
            fetchSellerTemplates(adminToken),
            fetchSellerPayoutConfig(adminToken),
          ]);
          if (cancelled) {
            return;
          }
          setProducts(sellerProducts);
          setSellerTemplates(templates);
          setSellerPendingStockDelta({});
          setSellerStockRequestsByTemplate({});
          setSellerOwnPayoutConfig({
            base_fee_brl: toNonNegativeMoney(Number(payoutConfig.base_fee_brl)),
            rules: payoutConfig.rules.map((item) => normalizeSellerRule(item)),
          });
          setCardOptions(null);
          setAnalytics([]);
          setPanelCategories([]);
          setBrandingConfig(DEFAULT_ADMIN_BRANDING);
          setBrandingSlideSearch({});
          setSellerOwnPayoutLoading(false);
        } else {
          setActivePage((current) =>
            current === "seller_products" ||
            current === "seller_sales" ||
            current === "seller_process"
              ? "usual_edit"
              : current,
          );
          setSellerOwnPayoutConfig(null);
          setSellerOwnPayoutLoading(false);
          setSellerDetailsModalSlug(null);
          const productsResponse = await fetchAdminProducts(adminToken);
          if (cancelled) {
            return;
          }
          setProducts(productsResponse);

          try {
            const categoriesResponse: AdminCategoryConfigResponse = await fetchAdminCategoriesConfig(
              adminToken,
            );
            if (!cancelled) {
              setPanelCategories(categoriesResponse.items);
            }
          } catch (categoriesErr: unknown) {
            if (!cancelled) {
              warnings.push(
                categoriesErr instanceof Error
                  ? `Categorias indisponíveis agora: ${categoriesErr.message}`
                  : "Categorias indisponíveis agora.",
              );
            }
          }

          try {
            const brandingResponse = await fetchAdminBrandingConfig(adminToken);
            if (!cancelled) {
              const normalizedWidths = normalizeBrandingWidthPair(
                Number(brandingResponse.hero_logo_primary_width),
                Number(brandingResponse.hero_logo_secondary_width),
              );
              setBrandingConfig({
                hero_logo_primary_url:
                  brandingResponse.hero_logo_primary_url || DEFAULT_ADMIN_BRANDING.hero_logo_primary_url,
                hero_logo_secondary_url:
                  brandingResponse.hero_logo_secondary_url || DEFAULT_ADMIN_BRANDING.hero_logo_secondary_url,
                hero_logo_primary_width: normalizedWidths.primary,
                hero_logo_secondary_width: normalizedWidths.secondary,
                hero_slide_targets: Array.isArray(brandingResponse.hero_slide_targets)
                  ? brandingResponse.hero_slide_targets
                      .filter(
                        (item) =>
                          Number.isFinite(item.slide_index) &&
                          item.slide_index >= 1 &&
                          item.product_slug.trim().length > 0,
                      )
                      .map((item) => ({
                        slide_index: Math.trunc(Number(item.slide_index)),
                        product_slug: item.product_slug.trim().toLowerCase(),
                        product_name: item.product_name?.trim() || null,
                      }))
                      .slice(0, 12)
                  : [],
                hero_slides: normalizeBrandingSlideAssets(brandingResponse.hero_slides),
              });
              setBrandingSlideSearch({});
            }
          } catch (brandingErr: unknown) {
            if (!cancelled) {
              setBrandingConfig(DEFAULT_ADMIN_BRANDING);
              setBrandingSlideSearch({});
              warnings.push(
                brandingErr instanceof Error
                  ? `Branding indisponível agora: ${brandingErr.message}`
                  : "Branding indisponível agora.",
              );
            }
          }

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
                  ? `Analytics indisponível agora: ${analyticsErr.message}`
                  : "Analytics indisponível agora.",
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
                  : "Não foi possível carregar opções externas de cards.",
              );
            }
          }
        }

        if (!cancelled) {
          setMetadataWarning(warnings.length > 0 ? warnings.join(" | ") : null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          if (err instanceof AdminApiError && err.status === 401) {
            disconnectSession("Sua sessão expirou. Faça login novamente.");
          } else {
            setError(err instanceof Error ? err.message : "Falha ao carregar painel admin");
          }
        }
      } finally {
        if (!cancelled) {
          setSellerOwnPayoutLoading(false);
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
    if (!connected) {
      return;
    }

    let cancelled = false;

    async function loadActivePageData(): Promise<void> {
      if ((activePage === "sales_metrics" && authRole === "admin") || activePage === "seller_sales") {
        setSalesMetricsLoading(true);
        try {
          const payload =
            authRole === "seller"
              ? await fetchSellerSalesMetrics(adminToken, salesMetricsDays)
              : await fetchAdminSalesMetrics(adminToken, salesMetricsDays);
          if (!cancelled) {
            setSalesMetrics(payload);
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setSalesMetrics(null);
            setError(
              err instanceof Error
                ? err.message
                : "Falha ao carregar métricas de vendas.",
            );
          }
        } finally {
          if (!cancelled) {
            setSalesMetricsLoading(false);
          }
        }
      }

      if ((activePage === "sales" && authRole === "admin") || activePage === "seller_sales") {
        setSalesOrdersLoading(true);
        try {
          const payload =
            authRole === "seller"
              ? await fetchSellerSalesOrders(adminToken, {
                  page: salesOrdersPage,
                  limit: 20,
                  status: salesStatusFilter,
                  query: salesSearch,
                })
              : await fetchAdminSalesOrders(adminToken, {
                  page: salesOrdersPage,
                  limit: 20,
                  status: salesStatusFilter,
                  query: salesSearch,
                });
          if (!cancelled) {
            setSalesOrders(payload.items);
            setSalesOrdersHasMore(payload.has_more);
            setSalesOrdersTotal(payload.total_orders);
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setSalesOrders([]);
            setSalesOrdersHasMore(false);
            setSalesOrdersTotal(0);
            setError(err instanceof Error ? err.message : "Falha ao carregar vendas.");
          }
        } finally {
          if (!cancelled) {
            setSalesOrdersLoading(false);
          }
        }
      }

      if ((activePage === "process" && authRole === "admin") || activePage === "seller_process") {
        setProcessOrdersLoading(true);
        try {
          const payload =
            authRole === "seller"
              ? await fetchSellerSalesOrders(adminToken, {
                  page: processOrdersPage,
                  limit: 20,
                  status: "approved",
                  query: processSearch,
                })
              : await fetchAdminSalesOrders(adminToken, {
                  page: processOrdersPage,
                  limit: 20,
                  status: "approved",
                  query: processSearch,
                });

          if (!cancelled) {
            setProcessOrders(payload.items);
            setProcessOrdersHasMore(payload.has_more);
            setProcessOrdersTotal(payload.total_orders);
            setProcessDrafts((current) => {
              const next: Record<string, ProcessOrderDraft> = { ...current };
              payload.items.forEach((order) => {
                const currentDraft = next[order.order_id];
                if (currentDraft) {
                  return;
                }
                const inferredStatus = resolveOrderFulfillmentStatus(order);
                next[order.order_id] = {
                  fulfillment_status: inferredStatus,
                  cancel_reason: order.fulfillment_cancel_reason ?? "",
                  tracking_code: order.fulfillment_tracking_code ?? "",
                };
              });
              return next;
            });
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setProcessOrders([]);
            setProcessOrdersHasMore(false);
            setProcessOrdersTotal(0);
            setError(
              err instanceof Error
                ? err.message
                : "Falha ao carregar fila de processamento.",
            );
          }
        } finally {
          if (!cancelled) {
            setProcessOrdersLoading(false);
          }
        }
      }

      if (activePage === "webhooks" && authRole === "admin") {
        setWebhookEventsLoading(true);
        try {
          const payload = await fetchAdminWebhookEvents(adminToken, {
            page: webhookEventsPage,
            limit: 30,
            status: webhookStatusFilter,
            search: webhookSearch,
          });
          if (!cancelled) {
            setWebhookEvents(payload.items);
            setWebhookEventsHasMore(payload.has_more);
            setWebhookEventsTotal(payload.total_events);
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setWebhookEvents([]);
            setWebhookEventsHasMore(false);
            setWebhookEventsTotal(0);
            setError(
              err instanceof Error
                ? err.message
                : "Falha ao carregar eventos de webhook.",
            );
          }
        } finally {
          if (!cancelled) {
            setWebhookEventsLoading(false);
          }
        }
      }

      if (activePage === "sellers" && authRole === "admin") {
        try {
          const payload = await fetchAdminSellers(adminToken);
          if (!cancelled) {
            setSellerAccounts(payload.items);
            setExpandedSellerEmail((current) =>
              current && payload.items.some((item) => item.email === current) ? current : null,
            );
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setSellerAccounts([]);
            setExpandedSellerEmail(null);
            setError(err instanceof Error ? err.message : "Falha ao carregar vendedores.");
          }
        }
      }

      if (activePage === "settings" && authRole === "admin") {
        try {
          const [menuConfig, categoriesConfig, branding] = await Promise.all([
            fetchAdminMenuConfig(adminToken),
            fetchAdminCategoriesConfig(adminToken),
            fetchAdminBrandingConfig(adminToken),
          ]);
          if (!cancelled) {
            const normalizedWidths = normalizeBrandingWidthPair(
              Number(branding.hero_logo_primary_width),
              Number(branding.hero_logo_secondary_width),
            );
            setMenuConfigItems(menuConfig.items);
            setPanelCategories(categoriesConfig.items);
            setBrandingConfig({
              hero_logo_primary_url:
                branding.hero_logo_primary_url || DEFAULT_ADMIN_BRANDING.hero_logo_primary_url,
              hero_logo_secondary_url:
                branding.hero_logo_secondary_url || DEFAULT_ADMIN_BRANDING.hero_logo_secondary_url,
              hero_logo_primary_width: normalizedWidths.primary,
              hero_logo_secondary_width: normalizedWidths.secondary,
              hero_slide_targets: Array.isArray(branding.hero_slide_targets)
                ? branding.hero_slide_targets
                    .filter(
                      (item) =>
                        Number.isFinite(item.slide_index) &&
                        item.slide_index >= 1 &&
                        item.product_slug.trim().length > 0,
                    )
                    .map((item) => ({
                      slide_index: Math.trunc(Number(item.slide_index)),
                      product_slug: item.product_slug.trim().toLowerCase(),
                      product_name: item.product_name?.trim() || null,
                    }))
                    .slice(0, 12)
                : [],
              hero_slides: normalizeBrandingSlideAssets(branding.hero_slides),
            });
            setBrandingSlideSearch({});
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Falha ao carregar configurações.");
          }
        }
      }

      if (activePage === "seller_products" && authRole === "seller") {
        setSellerOwnPayoutLoading(true);
        try {
          const [templates, ownProducts, payoutConfig] = await Promise.all([
            fetchSellerTemplates(adminToken),
            fetchSellerProducts(adminToken),
            fetchSellerPayoutConfig(adminToken),
          ]);
          if (!cancelled) {
            setSellerTemplates(templates);
            setProducts(ownProducts);
            setSellerPendingStockDelta({});
            setSellerStockRequestsByTemplate({});
            setSellerOwnPayoutConfig({
              base_fee_brl: toNonNegativeMoney(Number(payoutConfig.base_fee_brl)),
              rules: payoutConfig.rules.map((item) => normalizeSellerRule(item)),
            });
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Falha ao carregar produtos do seller.");
          }
        } finally {
          if (!cancelled) {
            setSellerOwnPayoutLoading(false);
          }
        }
      }
    }

    void loadActivePageData();

    return () => {
      cancelled = true;
    };
  }, [
    activePage,
    adminToken,
    authRole,
    connected,
    salesMetricsDays,
    salesOrdersPage,
    salesSearch,
    salesStatusFilter,
    processOrdersPage,
    processSearch,
    webhookEventsPage,
    webhookSearch,
    webhookStatusFilter,
  ]);

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
    setSelectedProductSlugs([]);
    setAssistantResult(null);
    setAssistantError(null);
    setCardLookupItems([]);
    setCardLookupError(null);
    setCardLookupQuery("");
    setSuggestedPrice(null);
    setDuplicatePrompt(null);
    setEditingSlug(null);
    setEditorMode("create");

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

  useEffect(() => {
    if (activePage !== "catalog_create") {
      return;
    }
    startCreateMode();
    setStatus(null);
    setError(null);
  }, [activePage]);

  useEffect(() => {
    setSelectedProductSlugs((current) =>
      current.filter((slug) => products.some((item) => item.slug === slug)),
    );
  }, [products]);

  const tabProducts = useMemo(() => {
    return products.filter((product) =>
      activeTab === "cards" ? isCardType(product.product_type) : !isCardType(product.product_type),
    );
  }, [products, activeTab]);

  const categoryOptions = useMemo(() => {
    const fromPreset = CATEGORY_PRESET_BY_TAB[activeTab];
    const fromPanelSettings = panelCategories;
    const fromProducts = tabProducts.map((product) => normalizeCategory(product.category));
    return uniqueStrings(fromPreset, fromPanelSettings, fromProducts);
  }, [activeTab, panelCategories, tabProducts]);

  const draftCategoryOptions = useMemo(() => {
    if (activeTab !== "products") {
      return categoryOptions;
    }

    if (draft.product_type === "accessory") {
      const fromProducts = tabProducts
        .filter((product) => product.product_type === "accessory")
        .map((product) => normalizeAccessoryCategoryLabel(product.category));
      const fromPanel = panelCategories
        .map((item) => normalizeAccessoryCategoryLabel(item));
      return uniqueStrings(ACCESSORY_CATEGORY_PRESET, fromPanel, fromProducts);
    }

    const fromTypePreset = PRODUCT_CATEGORY_PRESET_BY_TYPE[draft.product_type] ?? [];
    const fromTypeProducts = tabProducts
      .filter((product) => product.product_type === draft.product_type)
      .map((product) => normalizeCategory(product.category))
      .filter((item) => !isAccessoryCategoryLabel(item));
    const fromPanel = panelCategories.filter((item) => !isAccessoryCategoryLabel(item));
    return uniqueStrings(fromTypePreset, fromTypeProducts, fromPanel);
  }, [activeTab, categoryOptions, draft.product_type, panelCategories, tabProducts]);

  const selectedCategoryOption = useMemo(
    () => findCategoryOptionMatch(draftCategoryOptions, draft.category),
    [draftCategoryOptions, draft.category],
  );

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

  const catalogGridStyle = useMemo(
    () =>
      ({
        "--admin-grid-columns": String(catalogGridColumns),
      }) as CSSProperties,
    [catalogGridColumns],
  );

  const selectedSlugSet = useMemo(() => new Set(selectedProductSlugs), [selectedProductSlugs]);

  const adminSellerTemplateProducts = useMemo(
    () =>
      products
        .filter(
          (item) =>
            item.owner_type === "admin" &&
            (item.seller_template_enabled ?? true),
        )
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [products],
  );

  const sellerStockByTemplateSlug = useMemo(() => {
    const stockMap = new Map<string, number>();
    products.forEach((product) => {
      const sourceTemplateSlug = (product.source_template_slug ?? "").trim();
      if (!sourceTemplateSlug) {
        return;
      }
      stockMap.set(sourceTemplateSlug, (stockMap.get(sourceTemplateSlug) ?? 0) + Math.max(0, product.stock));
    });
    return stockMap;
  }, [products]);

  const sellerProductByTemplateSlug = useMemo(() => {
    const output = new Map<string, StoreProduct>();
    products.forEach((product) => {
      const sourceTemplateSlug = (product.source_template_slug ?? "").trim();
      if (!sourceTemplateSlug) {
        return;
      }

      const current = output.get(sourceTemplateSlug);
      if (!current || product.stock > current.stock) {
        output.set(sourceTemplateSlug, product);
      }
    });
    return output;
  }, [products]);

  const sellerPendingStockDeltaTotal = useMemo(
    () =>
      Object.values(sellerPendingStockDelta).reduce(
        (total, value) => total + (Number.isFinite(value) ? value : 0),
        0,
      ),
    [sellerPendingStockDelta],
  );

  const sellerTotalPublishedStock = useMemo(
    () =>
      Math.max(
        0,
        products.reduce((total, item) => total + Math.max(0, item.stock), 0) +
          sellerPendingStockDeltaTotal,
      ),
    [products, sellerPendingStockDeltaTotal],
  );

  useEffect(() => {
    setSellerTemplateQuantities((current) => {
      const next: Record<string, string> = {};
      sellerTemplates.forEach((template) => {
        const existing = parsePositiveInteger(current[template.slug] ?? "1", 1);
        next[template.slug] = String(existing);
      });
      return next;
    });
  }, [sellerTemplates]);

  useEffect(() => {
    setSellerTemplatePrices((current) => {
      const next: Record<string, string> = {};
      sellerTemplates.forEach((template) => {
        const existing = current[template.slug];
        if (existing && parseBrlToNumber(existing) > 0) {
          next[template.slug] = existing;
          return;
        }

        const ownProduct = sellerProductByTemplateSlug.get(template.slug);
        const sourcePrice = ownProduct?.price_brl ?? template.price_brl;
        next[template.slug] = formatBrlCurrencyFromNumber(sourcePrice);
      });
      return next;
    });
  }, [sellerProductByTemplateSlug, sellerTemplates]);

  useEffect(() => {
    if (!sellerDetailsModalSlug) {
      return;
    }
    const stillExists = sellerTemplates.some((template) => template.slug === sellerDetailsModalSlug);
    if (!stillExists) {
      setSellerDetailsModalSlug(null);
    }
  }, [sellerDetailsModalSlug, sellerTemplates]);

  const selectedVisibleCount = useMemo(
    () => visibleProducts.filter((item) => selectedSlugSet.has(item.slug)).length,
    [selectedSlugSet, visibleProducts],
  );

  const assistantFindings = useMemo(() => assistantResult?.findings ?? [], [assistantResult]);

  const assistantFixableFindings = useMemo(() => {
    const slugSet = new Set(products.map((item) => item.slug));
    return dedupeFixableFindings(assistantFindings).filter((finding) => slugSet.has(finding.slug));
  }, [assistantFindings, products]);

  const assistantFixableSlugSet = useMemo(
    () => new Set(assistantFixableFindings.map((finding) => finding.slug)),
    [assistantFixableFindings],
  );

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

  const setSériesOptions = useMemo(
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

  function applySessionFromAuth(response: {
    access_token: string | null;
    role: "admin" | "seller" | null;
    email: string | null;
    shop_name: string | null;
    shop_slug: string | null;
    expires_in_seconds?: number;
  }): void {
    if (!response.access_token) {
      return;
    }

    const sessionToken = response.access_token.trim();
    if (!sessionToken) {
      return;
    }
    setAdminToken(sessionToken);
    setAuthRole(response.role);
    setLoggedEmail(response.email);
    setLoggedShopName(response.shop_name);
    setLoggedShopSlug(response.shop_slug);
    setTwoFactorChallenge(null);
    setTwoFactorCode("");
    setOnboardingChallenge(null);
    setOnboardingQrUri(null);
    setOnboardingCode("");
    setOnboardingPassword("");
    setOnboardingPasswordConfirm("");
    setAdminPassword("");

    const expiresSeconds = Math.max(3600, Number(response.expires_in_seconds ?? 0));
    persistAdminSession({
      token: sessionToken,
      role: response.role,
      email: response.email,
      shopName: response.shop_name,
      shopSlug: response.shop_slug,
      expiresAt: Date.now() + expiresSeconds * 1000,
    });
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAuthError(null);
    setError(null);
    setStatus(null);
    setAuthLoading(true);

    try {
      const response = await loginAdmin(adminEmail.trim(), adminPassword);
      if (response.requires_onboarding) {
        setOnboardingChallenge(response.challenge_token);
        setOnboardingQrUri(response.onboarding_qr_uri);
        setOnboardingCode("");
        setOnboardingPassword("");
        setOnboardingPasswordConfirm("");
        setTwoFactorChallenge(null);
        setStatus("Primeiro acesso de seller: defina nova senha e configure o 2FA.");
        return;
      }

      if (response.requires_2fa) {
        setTwoFactorChallenge(response.challenge_token);
        setOnboardingChallenge(null);
        setOnboardingQrUri(null);
        setStatus("Senha validada. Digite o código do Google Authenticator.");
        return;
      }

      if (!response.access_token) {
        setAuthError("Falha ao autenticar.");
        return;
      }

      applySessionFromAuth(response);
      setStatus("Login realizado com sucesso.");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Falha ao autenticar.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function submitTwoFactor(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await validateTwoFactorCode(twoFactorCode.trim());
  }

  async function validateTwoFactorCode(code: string): Promise<void> {
    if (!twoFactorChallenge) {
      setAuthError("Fluxo 2FA inválido. Tente o login novamente.");
      return;
    }

    setAuthError(null);
    setStatus(null);
    setAuthLoading(true);

    try {
      const response = await verifyAdminTwoFactor(twoFactorChallenge, code.trim());
      if (!response.access_token) {
        setAuthError("Sessão 2FA inválida.");
        setTwoFactorCode("");
        return;
      }

      applySessionFromAuth(response);
      setStatus(response.role === "seller" ? "2FA validado. Sessão seller iniciada." : "2FA validado. Sessão admin iniciada.");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Código 2FA inválido.");
      setTwoFactorCode("");
    } finally {
      setAuthLoading(false);
    }
  }

  async function submitSellerOnboarding(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!onboardingChallenge) {
      setAuthError("Fluxo de onboarding inválido. Faça login novamente.");
      return;
    }
    if (onboardingPassword.trim().length < 8) {
      setAuthError("Nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (onboardingPassword !== onboardingPasswordConfirm) {
      setAuthError("Confirme a senha exatamente igual.");
      return;
    }

    setAuthError(null);
    setStatus(null);
    setAuthLoading(true);
    try {
      const response = await completeSellerOnboarding(
        onboardingChallenge,
        onboardingPassword,
        onboardingCode.trim(),
      );
      if (!response.access_token) {
        setAuthError("Falha ao concluir onboarding.");
        return;
      }
      applySessionFromAuth(response);
      setStatus("Onboarding concluído. Sessão seller iniciada.");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Falha ao concluir onboarding.");
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    if (!twoFactorChallenge || authLoading) {
      return;
    }

    const normalizedCode = twoFactorCode.trim();
    if (normalizedCode.length !== 6) {
      return;
    }

    void validateTwoFactorCode(normalizedCode);
  }, [authLoading, twoFactorChallenge, twoFactorCode]);

  function resetForm() {
    setEditModalOpen(false);
    setEditingSlug(null);
    setEditorMode("create");
    setDraft(emptyDraft(activeTab));
    setCardLookupItems([]);
    setCardLookupError(null);
    setCardLookupQuery("");
    setSuggestedPrice(null);
    setDuplicatePrompt(null);
  }

  function startCreateMode() {
    setEditModalOpen(false);
    setEditorMode("create");
    setEditingSlug(null);
    setDraft(emptyDraft(activeTab));
    setSuggestedPrice(null);
  }

  function beginEdit(product: StoreProduct) {
    const tab: AdminTab = isCardType(product.product_type) ? "cards" : "products";
    setActiveTab(tab);
    setEditorMode("edit");
    setEditingSlug(product.slug);
    setDraft(toDraft(product));
    setSuggestedPrice(null);
    setEditModalOpen(true);
  }

  function closeEditModal() {
    setEditModalOpen(false);
    resetForm();
  }

  async function saveEditProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected || !editingSlug) {
      setError("Selecione um item para editar.");
      return;
    }

    setStatus(null);
    setError(null);

    const payload = toProduct(draft);
    if (!payload.slug || !payload.name || !payload.image_url) {
      setError("Slug, nome e URL da imagem são obrigatórios.");
      return;
    }
    if (!draft.category.trim()) {
      setError("Categoria é obrigatória.");
      return;
    }

    if (activeTab === "cards") {
      payload.product_type = "single_card";
    }

    if (activeTab === "products" && payload.product_type === "single_card") {
      setError("A aba Produtos não aceita tipo single_card.");
      return;
    }

    if (Number.isNaN(payload.stock) || Number.isNaN(payload.price_brl)) {
      setError("Estoque e preço precisam ser números válidos.");
      return;
    }

    if (draft.release_year.trim() && payload.release_year == null) {
      setError("Ano inválido. Use apenas números, exemplo 2024.");
      return;
    }

    if (draft.booster_pack_count.trim() && payload.booster_pack_count == null) {
      setError("Quantidade de boosters inválida.");
      return;
    }

    try {
      const saved = await updateAdminProduct(adminToken, editingSlug, payload);
      setProducts((current) => {
        const without = current.filter((item) => item.slug !== editingSlug && item.slug !== saved.slug);
        return [...without, saved].sort((left, right) => left.slug.localeCompare(right.slug));
      });
      setStatus("Produto atualizado.");
      closeEditModal();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar produto.");
    }
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
      setError("Slug, nome e URL da imagem são obrigatórios.");
      return;
    }
    if (!draft.category.trim()) {
      setError("Categoria é obrigatória.");
      return;
    }

    if (activeTab === "cards") {
      payload.product_type = "single_card";
    }

    if (activeTab === "products" && payload.product_type === "single_card") {
      setError("A aba Produtos não aceita tipo single_card.");
      return;
    }

    if (Number.isNaN(payload.stock) || Number.isNaN(payload.price_brl)) {
      setError("Estoque e preço precisam ser números válidos.");
      return;
    }

    if (draft.release_year.trim() && payload.release_year == null) {
      setError("Ano inválido. Use apenas números, exemplo 2024.");
      return;
    }

    if (draft.booster_pack_count.trim() && payload.booster_pack_count == null) {
      setError("Quantidade de boosters inválida.");
      return;
    }

    const isEditing = editorMode === "edit";

    const editingSlugValue = editingSlug;

    if (isEditing && !editingSlugValue) {
      setError("Selecione um item da grade para editar.");
      return;
    }

    if (!isEditing && activeTab === "cards") {
      const incomingKey = cardIdentityKey(payload);
      const duplicate = products.find(
        (item) => isCardType(item.product_type) && cardIdentityKey(item) === incomingKey,
      );
      if (duplicate) {
        setDuplicatePrompt({ duplicate, incoming: payload });
        return;
      }
    }

    if (!isEditing) {
      const resolvedSlug = resolveSlugCollisionForCreate(payload, products);
      if (resolvedSlug !== payload.slug) {
        payload.slug = resolvedSlug;
      }
    }

    try {
      const saved =
        isEditing && editingSlugValue
          ? await updateAdminProduct(adminToken, editingSlugValue, payload)
          : await createAdminProduct(adminToken, payload);

      setProducts((current) => {
        const without = current.filter((item) => item.slug !== editingSlug && item.slug !== saved.slug);
        return [...without, saved].sort((left, right) => left.slug.localeCompare(right.slug));
      });

      if (!isEditing && payload.slug !== draft.slug.trim()) {
        setStatus(`Produto criado com slug ajustado para evitar colisão: ${payload.slug}.`);
      } else {
        setStatus(isEditing ? "Produto atualizado." : "Produto criado.");
      }
      if (isEditing) {
        setEditingSlug(saved.slug);
        setDraft(toDraft(saved));
      } else {
        resetForm();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar produto.");
    }
  }

  async function removeProductCompletely(slug: string): Promise<void> {
    if (!connected) {
      return;
    }

    await deleteAdminProduct(adminToken, slug);
    setProducts((current) => current.filter((item) => item.slug !== slug));
    if (editingSlug === slug) {
      resetForm();
    }
  }

  function requestRemoveProduct(product: StoreProduct): void {
    setDeletePrompt(product);
  }

  async function confirmRemoveProductSingleStock(): Promise<void> {
    if (!connected || !deletePrompt) {
      return;
    }

    const latestProduct = products.find((item) => item.slug === deletePrompt.slug) ?? deletePrompt;
    setStatus(null);
    setError(null);
    setDeleteActionLoading("single");
    try {
      if (latestProduct.stock > 1) {
        const saved = await updateAdminProduct(adminToken, latestProduct.slug, {
          ...latestProduct,
          stock: latestProduct.stock - 1,
        });
        setProducts((current) => {
          const without = current.filter((item) => item.slug !== latestProduct.slug && item.slug !== saved.slug);
          return [...without, saved].sort((left, right) => left.slug.localeCompare(right.slug));
        });
        if (editingSlug === latestProduct.slug || editingSlug === saved.slug) {
          setEditingSlug(saved.slug);
          setDraft(toDraft(saved));
        }
        setStatus("Estoque reduzido em 1 unidade.");
      } else {
        await removeProductCompletely(latestProduct.slug);
        setStatus("Produto removido.");
      }
      setDeletePrompt(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao remover produto.");
    } finally {
      setDeleteActionLoading(null);
    }
  }

  async function confirmRemoveProductFullStock(): Promise<void> {
    if (!connected || !deletePrompt) {
      return;
    }

    setStatus(null);
    setError(null);
    setDeleteActionLoading("full");
    try {
      await removeProductCompletely(deletePrompt.slug);
      setDeletePrompt(null);
      setStatus("Produto removido por completo.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao remover produto.");
    } finally {
      setDeleteActionLoading(null);
    }
  }

  function toggleProductSelection(slug: string) {
    setSelectedProductSlugs((current) => {
      if (current.includes(slug)) {
        return current.filter((item) => item !== slug);
      }
      return [...current, slug];
    });
  }

  function selectAllVisibleProducts() {
    setSelectedProductSlugs((current) => {
      const merged = new Set(current);
      visibleProducts.forEach((item) => merged.add(item.slug));
      return [...merged];
    });
  }

  function clearSelectedProducts() {
    setSelectedProductSlugs([]);
  }

  function selectCatalogGridColumns(columns: number) {
    const safeColumns = Math.max(2, Math.min(7, Math.floor(columns)));
    setCatalogGridColumns(safeColumns);
  }

  async function runAssistantAction(action: CatalogAssistantAction, autoApply = false) {
    if (!connected) {
      return;
    }

    const scopedSlugs = assistantScope === "selected" ? selectedProductSlugs : [];
    if (assistantScope === "selected" && scopedSlugs.length === 0) {
      setAssistantError("Selecione ao menos uma carta/produto para executar essa acao.");
      return;
    }

    setAssistantError(null);
    setAssistantLoading(true);
    setAssistantResult(null);
    setStatus(null);

    try {
      const result = await runCatalogAssistant(adminToken, {
        action,
        slugs: scopedSlugs,
        include_non_cards: activeTab === "products",
        auto_apply: autoApply,
      });

      setAssistantResult(result);
      setStatus(
        `Assistente finalizado: ${result.findings.length} achados em ${result.scanned_products} itens.`,
      );

      if (result.updated_count > 0) {
        const productsResponse = await fetchAdminProducts(adminToken);
        setProducts(productsResponse);
        setStatus(
          `Assistente finalizado: ${result.findings.length} achados e ${result.updated_count} preços atualizados.`,
        );
      }
    } catch (err: unknown) {
      setAssistantError(
        err instanceof Error ? err.message : "Falha ao executar assistente de catálogo.",
      );
    } finally {
      setAssistantLoading(false);
    }
  }

  async function applyAssistantFix(finding: CatalogAssistantFinding) {
    if (!connected) {
      return;
    }

    if (!hasSuggestedPrice(finding.suggested_price_brl)) {
      setAssistantError("Esse achado não possui preço sugerido para correção automática.");
      return;
    }

    const product = products.find((item) => item.slug === finding.slug);
    if (!product) {
      setAssistantError(`Não foi possível localizar ${finding.slug} para corrigir.`);
      return;
    }

    setAssistantError(null);
    setAssistantFixingSlug(finding.slug);
    setStatus(null);

    try {
      const updatedPrice = Number(finding.suggested_price_brl.toFixed(2));
      const saved = await updateAdminProduct(adminToken, product.slug, {
        ...product,
        price_brl: updatedPrice,
      });

      setProducts((current) => {
        const without = current.filter((item) => item.slug !== product.slug && item.slug !== saved.slug);
        return [...without, saved].sort((left, right) => left.slug.localeCompare(right.slug));
      });

      setAssistantResult((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          updated_count: current.updated_count + 1,
          findings: current.findings.filter(
            (item) => !(item.slug === finding.slug && hasSuggestedPrice(item.suggested_price_brl)),
          ),
        };
      });

      if (editingSlug === product.slug || editingSlug === saved.slug) {
        setEditingSlug(saved.slug);
        setEditorMode("edit");
        setDraft(toDraft(saved));
      }

      setStatus(`Preço ajustado com sucesso para ${saved.slug}.`);
    } catch (err: unknown) {
      setAssistantError(err instanceof Error ? err.message : "Falha ao aplicar correção automática.");
    } finally {
      setAssistantFixingSlug(null);
    }
  }

  async function applyAllAssistantFixes() {
    if (!connected) {
      return;
    }

    const fixable = assistantFixableFindings;
    if (fixable.length === 0) {
      setAssistantError("Nenhum achado com preço sugerido disponível para correções em lote.");
      return;
    }

    setAssistantError(null);
    setAssistantFixingAll(true);
    setStatus(null);

    const nextBySlug = new Map(products.map((item) => [item.slug, item]));
    const failedSlugs: string[] = [];
    const appliedSlugSet = new Set<string>();
    let appliedCount = 0;

    try {
      for (const finding of fixable) {
        const currentProduct = nextBySlug.get(finding.slug);
        if (!currentProduct || !hasSuggestedPrice(finding.suggested_price_brl)) {
          failedSlugs.push(finding.slug);
          continue;
        }

        const updatedPrice = Number(finding.suggested_price_brl.toFixed(2));
        try {
          const saved = await updateAdminProduct(adminToken, currentProduct.slug, {
            ...currentProduct,
            price_brl: updatedPrice,
          });
          nextBySlug.delete(currentProduct.slug);
          nextBySlug.set(saved.slug, saved);
          appliedCount += 1;
          appliedSlugSet.add(currentProduct.slug);
          appliedSlugSet.add(saved.slug);

          if (editingSlug === currentProduct.slug || editingSlug === saved.slug) {
            setEditingSlug(saved.slug);
            setEditorMode("edit");
            setDraft(toDraft(saved));
          }
        } catch {
          failedSlugs.push(finding.slug);
        }
      }

      setProducts(
        [...nextBySlug.values()].sort((left, right) => left.slug.localeCompare(right.slug)),
      );

      setAssistantResult((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          updated_count: current.updated_count + appliedCount,
          findings: current.findings.filter(
            (item) => !(appliedSlugSet.has(item.slug) && hasSuggestedPrice(item.suggested_price_brl)),
          ),
        };
      });

      if (failedSlugs.length > 0) {
        setAssistantError(
          `Nem todos foram corrigidos. Falharam ${failedSlugs.length} itens: ${failedSlugs.slice(0, 5).join(", ")}${failedSlugs.length > 5 ? "..." : ""}.`,
        );
      }

      setStatus(`Correcoes em lote finalizadas. ${appliedCount} itens atualizados.`);
    } finally {
      setAssistantFixingAll(false);
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
      pokemon_types:
        item.pokemon_types && item.pokemon_types.length > 0
          ? item.pokemon_types.join(", ")
          : current.pokemon_types,
      language: current.language,
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
        throw new Error("Arquivo de lote inválido: JSON raiz deve ser um objeto.");
      }

      const cards = (parsed as { cards?: unknown }).cards;
      if (!Array.isArray(cards)) {
        throw new Error("Arquivo de lote inválido: campo 'cards' ausente ou inválido.");
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

  function resolveAdminImageUploadScope(): AdminImageUploadScope {
    if (activeTab === "cards" || isCardType(draft.product_type)) {
      return "cards";
    }
    return "products";
  }

  async function handleMainImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !connected) {
      return;
    }

    setError(null);
    setStatus(null);
    setMainImageUploadBusy(true);
    try {
      const upload = await uploadAdminImage(
        adminToken,
        file,
        resolveAdminImageUploadScope(),
        "primary",
        draft.slug.trim() || undefined,
      );
      setDraft((current) => ({ ...current, image_url: upload.url }));
      setStatus("Foto principal enviada para o Storage.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao enviar foto principal.");
    } finally {
      setMainImageUploadBusy(false);
    }
  }

  async function handleGalleryImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length === 0 || !connected) {
      return;
    }

    setError(null);
    setStatus(null);
    setGalleryImageUploadBusy(true);
    try {
      const scope = resolveAdminImageUploadScope();
      const uploads = await Promise.all(
        files.map((file) =>
          uploadAdminImage(
            adminToken,
            file,
            scope,
            "gallery",
            draft.slug.trim() || undefined,
          ),
        ),
      );
      const uploadedUrls = uploads.map((item) => item.url);
      setDraft((current) => ({
        ...current,
        image_gallery: appendImageGalleryUrls(
          current.image_gallery,
          uploadedUrls,
          current.image_url,
        ),
      }));
      setStatus(`${uploads.length} foto(s) adicional(is) enviada(s) para o Storage.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao enviar fotos adicionais.");
    } finally {
      setGalleryImageUploadBusy(false);
    }
  }

  function defaultSellerRule(template: StoreProduct): SellerPayoutRuleConfig {
    return {
      template_slug: template.slug,
      template_name: template.name,
      commission_mode: "percent",
      commission_percent: 0,
      commission_fixed_brl: null,
      active: false,
    };
  }

  function normalizeSellerRule(rule: SellerPayoutRuleConfig): SellerPayoutRuleConfig {
    const mode = rule.commission_mode === "fixed" ? "fixed" : "percent";
    return {
      template_slug: rule.template_slug.trim(),
      template_name: rule.template_name?.trim() || null,
      commission_mode: mode,
      commission_percent:
        mode === "percent"
          ? toNonNegativeMoney(Number(rule.commission_percent ?? 0))
          : null,
      commission_fixed_brl:
        mode === "fixed"
          ? toNonNegativeMoney(Number(rule.commission_fixed_brl ?? 0))
          : null,
      active: Boolean(rule.active),
    };
  }

  async function ensureSellerPayoutDraft(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || sellerPayoutDrafts[normalizedEmail]) {
      return;
    }

    setSellerPayoutLoadingEmail(normalizedEmail);
    try {
      const config = await fetchAdminSellerPayoutConfig(adminToken, normalizedEmail);
      setSellerPayoutDrafts((current) => ({
        ...current,
        [normalizedEmail]: {
          base_fee_brl: toNonNegativeMoney(Number(config.base_fee_brl)),
          rules: config.rules.map((item) => normalizeSellerRule(item)),
        },
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao carregar repasse do seller.");
    } finally {
      setSellerPayoutLoadingEmail((current) =>
        current === normalizedEmail ? null : current,
      );
    }
  }

  async function toggleSellerDetails(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return;
    }
    if (expandedSellerEmail === normalizedEmail) {
      setExpandedSellerEmail(null);
      return;
    }

    setExpandedSellerEmail(normalizedEmail);
    await ensureSellerPayoutDraft(normalizedEmail);
  }

  function upsertSellerRuleDraft(
    sellerEmail: string,
    template: StoreProduct,
    updater: (rule: SellerPayoutRuleConfig) => SellerPayoutRuleConfig,
  ): void {
    const normalizedEmail = sellerEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      return;
    }

    setSellerPayoutDrafts((current) => {
      const draftForSeller = current[normalizedEmail] ?? {
        base_fee_brl: 6,
        rules: [],
      };
      const existingRule = draftForSeller.rules.find(
        (rule) => rule.template_slug === template.slug,
      );
      const baseRule = existingRule ?? defaultSellerRule(template);
      const nextRule = normalizeSellerRule(
        updater({
          ...baseRule,
          template_slug: template.slug,
          template_name: template.name,
        }),
      );

      const otherRules = draftForSeller.rules.filter(
        (rule) => rule.template_slug !== template.slug,
      );
      const nextRules = [...otherRules, nextRule].sort((left, right) =>
        left.template_slug.localeCompare(right.template_slug),
      );

      return {
        ...current,
        [normalizedEmail]: {
          base_fee_brl: toNonNegativeMoney(Number(draftForSeller.base_fee_brl)),
          rules: nextRules,
        },
      };
    });
  }

  function estimatePayoutExample({
    unitPrice,
    quantity,
    baseFee,
    rule,
    taxPercent = SELLER_FIXED_TAX_PERCENT,
  }: {
    unitPrice: number;
    quantity: number;
    baseFee: number;
    rule: SellerPayoutRuleConfig;
    taxPercent?: number;
  }): {
    lineTotal: number;
    adminTotal: number;
    sellerTotal: number;
    commissionTotal: number;
    feeTotal: number;
    taxPercent: number;
    taxTotal: number;
  } {
    const safeQuantity = Math.max(1, quantity);
    const lineTotal = toMoney(unitPrice * safeQuantity);
    const feeTotal = toMoney(baseFee * safeQuantity);
    const appliedTaxPercent = toNonNegativeMoney(taxPercent);
    const taxTotal = toMoney((lineTotal * appliedTaxPercent) / 100);

    let commissionTotal = 0;
    if (rule.active) {
      if (rule.commission_mode === "fixed") {
        commissionTotal = toMoney((Number(rule.commission_fixed_brl ?? 0) || 0) * safeQuantity);
      } else {
        commissionTotal = toMoney((lineTotal * (Number(rule.commission_percent ?? 0) || 0)) / 100);
      }
    }

    const adminTotal = toMoney(Math.min(lineTotal, feeTotal + taxTotal + commissionTotal));
    const sellerTotal = toMoney(Math.max(0, lineTotal - adminTotal));
    return {
      lineTotal,
      adminTotal,
      sellerTotal,
      commissionTotal,
      feeTotal,
      taxPercent: appliedTaxPercent,
      taxTotal,
    };
  }

  function resolveSellerRuleForTemplate(
    template: StoreProduct,
    config: SellerPayoutDraft | null,
  ): SellerPayoutRuleConfig {
    if (!config) {
      return defaultSellerRule(template);
    }
    return (
      config.rules.find((rule) => rule.template_slug === template.slug) ??
      defaultSellerRule(template)
    );
  }

  function formatSellerCommissionLabel(rule: SellerPayoutRuleConfig): string {
    if (!rule.active) {
      return "Sem regra";
    }
    if (rule.commission_mode === "fixed") {
      return `Legacy + ${formatCurrency(Number(rule.commission_fixed_brl ?? 0))}`;
    }
    return `Legacy + ${toMoney(Number(rule.commission_percent ?? 0)).toFixed(2)}%`;
  }

  async function saveSellerPayoutDraft(sellerEmail: string): Promise<void> {
    if (!connected || authRole !== "admin") {
      return;
    }
    const normalizedEmail = sellerEmail.trim().toLowerCase();
    const draftForSeller = sellerPayoutDrafts[normalizedEmail];
    if (!draftForSeller) {
      setError("Abra o seller e carregue a configuração antes de salvar.");
      return;
    }

    const payload: SellerPayoutConfigUpdateRequest = {
      base_fee_brl: toNonNegativeMoney(Number(draftForSeller.base_fee_brl)),
      rules: draftForSeller.rules.map((rule) => normalizeSellerRule(rule)),
    };

    setSellerPayoutSavingEmail(normalizedEmail);
    setError(null);
    setStatus(null);
    try {
      const saved = await updateAdminSellerPayoutConfig(adminToken, normalizedEmail, payload);
      const normalizedDraft: SellerPayoutDraft = {
        base_fee_brl: toNonNegativeMoney(Number(saved.base_fee_brl)),
        rules: saved.rules.map((item) => normalizeSellerRule(item)),
      };
      setSellerPayoutDrafts((current) => ({
        ...current,
        [normalizedEmail]: normalizedDraft,
      }));
      setSellerAccounts((current) =>
        current.map((item) =>
          item.email === normalizedEmail
            ? {
                ...item,
                payout_base_fee_brl: normalizedDraft.base_fee_brl,
                payout_rules_count: normalizedDraft.rules.filter((rule) => rule.active).length,
              }
            : item,
        ),
      );
      setStatus(`Repasse do seller ${normalizedEmail} atualizado.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar repasse do seller.");
    } finally {
      setSellerPayoutSavingEmail((current) =>
        current === normalizedEmail ? null : current,
      );
    }
  }

  async function createSellerAccount(): Promise<void> {
    if (!connected || authRole !== "admin") {
      return;
    }
    const email = newSellerEmail.trim();
    const shopName = newSellerShopName.trim();
    if (!email || !shopName) {
      setError("Informe e-mail e nome da loja para criar seller.");
      return;
    }

    setError(null);
    setStatus(null);
    setSettingsBusy(true);
    try {
      const payload = await createAdminSeller(adminToken, { email, shop_name: shopName });
      setSellerAccounts((current) => {
        const next = current.filter((item) => item.email !== payload.account.email);
        next.push(payload.account);
        next.sort((a, b) => a.email.localeCompare(b.email));
        return next;
      });
      setCreatedSellerTempPassword(payload.temporary_password);
      setNewSellerEmail("");
      setNewSellerShopName("");
      setStatus(`Seller ${payload.account.email} criado com sucesso.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar seller.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function toggleSellerAccess(item: SellerAccountSummary): Promise<void> {
    if (!connected || authRole !== "admin") {
      return;
    }
    const sellerEmail = item.email.trim().toLowerCase();
    if (!sellerEmail) {
      return;
    }

    const shouldActivate = item.status.trim().toLowerCase() !== "active";
    const confirmMessage = shouldActivate
      ? `Reativar o seller ${sellerEmail}?`
      : `Desativar o seller ${sellerEmail} e colocar estoque em standby (zerar estoque publicado)?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setError(null);
    setStatus(null);
    setSellerStatusSavingEmail(sellerEmail);
    try {
      const response = await updateAdminSellerStatus(adminToken, sellerEmail, {
        status: shouldActivate ? "active" : "inactive",
        set_inventory_standby: true,
        zero_inventory: !shouldActivate,
        note: shouldActivate
          ? "Reativado manualmente pelo admin."
          : "Desativado manualmente pelo admin: acesso temporariamente bloqueado e estoque em standby.",
      });

      setSellerAccounts((current) =>
        current.map((row) => (row.email === sellerEmail ? response.account : row)),
      );
      if (!shouldActivate) {
        setProducts((current) =>
          current.map((row) =>
            row.owner_type === "seller" && (row.owner_seller_email ?? "").trim().toLowerCase() === sellerEmail
              ? { ...row, stock: 0 }
              : row,
          ),
        );
      }
      setStatus(
        shouldActivate
          ? `Seller ${sellerEmail} reativado.`
          : `Seller ${sellerEmail} desativado. Itens afetados: ${response.seller_products_affected}. Estoque removido: ${response.seller_stock_removed}.`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar status do seller.");
    } finally {
      setSellerStatusSavingEmail((current) => (current === sellerEmail ? null : current));
    }
  }

  async function refreshAutomaticStoreSettings(): Promise<void> {
    if (!connected || authRole !== "admin") {
      return;
    }
    setError(null);
    setStatus(null);
    setSettingsBusy(true);
    try {
      const [menuConfig, categoriesConfig] = await Promise.all([
        fetchAdminMenuConfig(adminToken),
        fetchAdminCategoriesConfig(adminToken),
      ]);
      setMenuConfigItems(menuConfig.items);
      setPanelCategories(categoriesConfig.items);
      setStatus("Menu e categorias sincronizados automaticamente com o catálogo.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao sincronizar menu/categorias.");
    } finally {
      setSettingsBusy(false);
    }
  }

  function parseBrandingWidth(value: string, fallback: number): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(40, Math.min(460, parsed));
  }

  function normalizeBrandingWidthPair(primaryRaw: number, secondaryRaw: number): {
    primary: number;
    secondary: number;
  } {
    const primary = Math.max(40, Math.min(460, Number(primaryRaw) || DEFAULT_ADMIN_BRANDING.hero_logo_primary_width));
    let secondary = Math.max(
      40,
      Math.min(460, Number(secondaryRaw) || DEFAULT_ADMIN_BRANDING.hero_logo_secondary_width),
    );

    if (primary === 140 && secondary === 124) {
      secondary = primary;
    }

    return { primary, secondary };
  }

  function handleBrandingWidthChange(
    field: "hero_logo_primary_width" | "hero_logo_secondary_width",
    value: string,
  ): void {
    const fallback = brandingConfig[field];
    const next = parseBrandingWidth(value, fallback);
    setBrandingConfig((current) => ({
      ...current,
      [field]: next,
    }));
  }

  function parseBrandingFocusPercent(value: unknown, fallback = BRANDING_DEFAULT_FOCUS_X_PERCENT): number {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(0, Math.min(100, parsed));
  }

  function parseBrandingSlideMoney(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      return null;
    }
    const normalized = String(value).replace(",", ".").trim();
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.max(0, Number(parsed.toFixed(2)));
  }

  function sanitizeBrandingSlideText(value: unknown, maxLength: number): string | null {
    const safe = String(value ?? "").trim();
    if (!safe) {
      return null;
    }
    return safe.slice(0, maxLength);
  }

  function normalizeBrandingSlideAssets(
    values: AdminBrandingDraft["hero_slides"] | undefined,
  ): AdminBrandingDraft["hero_slides"] {
    if (!Array.isArray(values)) {
      return [];
    }

    const dedup = new Map<number, AdminBrandingDraft["hero_slides"][number]>();
    values.forEach((item) => {
      const slideIndex = Math.trunc(Number(item.slide_index));
      if (!Number.isFinite(slideIndex) || slideIndex < 1 || slideIndex > 12) {
        return;
      }
      const imageUrl = String(item.image_url ?? "").trim() || null;
      const focus = parseBrandingFocusPercent(item.focus_x_percent, BRANDING_DEFAULT_FOCUS_X_PERCENT);
      const name = sanitizeBrandingSlideText(item.name, 180);
      const category = sanitizeBrandingSlideText(item.category, 120);
      const productType = sanitizeBrandingSlideText(item.product_type, 120);
      const price = parseBrandingSlideMoney(item.price_brl);
      if (
        !imageUrl
        && focus === BRANDING_DEFAULT_FOCUS_X_PERCENT
        && !name
        && !category
        && !productType
        && price === null
      ) {
        return;
      }
      dedup.set(slideIndex, {
        slide_index: slideIndex,
        image_url: imageUrl,
        focus_x_percent: focus,
        name,
        category,
        product_type: productType,
        price_brl: price,
      });
    });
    return Array.from(dedup.values()).sort((left, right) => left.slide_index - right.slide_index);
  }

  function resolveBrandingSlideAsset(slideIndex: number): {
    slide_index: number;
    image_url: string | null;
    focus_x_percent: number;
    name: string | null;
    category: string | null;
    product_type: string | null;
    price_brl: number | null;
  } {
    const existing = brandingConfig.hero_slides.find((item) => item.slide_index === slideIndex);
    return {
      slide_index: slideIndex,
      image_url: existing?.image_url?.trim() || null,
      focus_x_percent: parseBrandingFocusPercent(
        existing?.focus_x_percent,
        BRANDING_DEFAULT_FOCUS_X_PERCENT,
      ),
      name: sanitizeBrandingSlideText(existing?.name, 180),
      category: sanitizeBrandingSlideText(existing?.category, 120),
      product_type: sanitizeBrandingSlideText(existing?.product_type, 120),
      price_brl: parseBrandingSlideMoney(existing?.price_brl),
    };
  }

  function upsertBrandingSlideAsset(
    slideIndex: number,
    updater: (
      current: {
        slide_index: number;
        image_url: string | null;
        focus_x_percent: number;
        name: string | null;
        category: string | null;
        product_type: string | null;
        price_brl: number | null;
      },
    ) => {
      image_url?: string | null;
      focus_x_percent?: number;
      name?: string | null;
      category?: string | null;
      product_type?: string | null;
      price_brl?: number | null;
    },
  ): void {
    if (!Number.isFinite(slideIndex) || slideIndex < 1 || slideIndex > 12) {
      return;
    }
    setBrandingConfig((current) => {
      const currentItem = current.hero_slides.find((item) => item.slide_index === slideIndex);
      const base = {
        slide_index: slideIndex,
        image_url: currentItem?.image_url?.trim() || null,
        focus_x_percent: parseBrandingFocusPercent(
          currentItem?.focus_x_percent,
          BRANDING_DEFAULT_FOCUS_X_PERCENT,
        ),
        name: sanitizeBrandingSlideText(currentItem?.name, 180),
        category: sanitizeBrandingSlideText(currentItem?.category, 120),
        product_type: sanitizeBrandingSlideText(currentItem?.product_type, 120),
        price_brl: parseBrandingSlideMoney(currentItem?.price_brl),
      };
      const patch = updater(base);
      const nextImageUrl = String(patch.image_url ?? base.image_url ?? "").trim() || null;
      const nextFocus = parseBrandingFocusPercent(
        patch.focus_x_percent ?? base.focus_x_percent,
        BRANDING_DEFAULT_FOCUS_X_PERCENT,
      );
      const nextName = sanitizeBrandingSlideText(patch.name ?? base.name, 180);
      const nextCategory = sanitizeBrandingSlideText(patch.category ?? base.category, 120);
      const nextProductType = sanitizeBrandingSlideText(patch.product_type ?? base.product_type, 120);
      const nextPrice = parseBrandingSlideMoney(patch.price_brl ?? base.price_brl);
      const nextList = current.hero_slides.filter((item) => item.slide_index !== slideIndex);
      if (
        nextImageUrl
        || nextFocus !== BRANDING_DEFAULT_FOCUS_X_PERCENT
        || nextName
        || nextCategory
        || nextProductType
        || nextPrice !== null
      ) {
        nextList.push({
          slide_index: slideIndex,
          image_url: nextImageUrl,
          focus_x_percent: nextFocus,
          name: nextName,
          category: nextCategory,
          product_type: nextProductType,
          price_brl: nextPrice,
        });
      }
      return {
        ...current,
        hero_slides: normalizeBrandingSlideAssets(nextList),
      };
    });
  }

  function normalizeBrandingSlideTargets(
    values: AdminBrandingDraft["hero_slide_targets"],
  ): AdminBrandingDraft["hero_slide_targets"] {
    const dedup = new Map<number, AdminBrandingDraft["hero_slide_targets"][number]>();
    values.forEach((item) => {
      const slideIndex = Math.trunc(Number(item.slide_index));
      const productSlug = item.product_slug.trim().toLowerCase();
      if (!Number.isFinite(slideIndex) || slideIndex < 1 || slideIndex > 12 || !productSlug) {
        return;
      }
      dedup.set(slideIndex, {
        slide_index: slideIndex,
        product_slug: productSlug,
        product_name: item.product_name?.trim() || null,
      });
    });
    return Array.from(dedup.values()).sort((left, right) => left.slide_index - right.slide_index);
  }

  function assignBrandingSlideTarget(slideIndex: number, product: StoreProduct): void {
    if (!Number.isFinite(slideIndex) || slideIndex < 1 || slideIndex > 12) {
      return;
    }
    setBrandingConfig((current) => {
      const nextTargets = current.hero_slide_targets.filter((item) => item.slide_index !== slideIndex);
      nextTargets.push({
        slide_index: slideIndex,
        product_slug: product.slug.trim().toLowerCase(),
        product_name: product.name.trim(),
      });
      return {
        ...current,
        hero_slide_targets: normalizeBrandingSlideTargets(nextTargets),
      };
    });
    setBrandingSlideSearch((current) => ({
      ...current,
      [slideIndex]: "",
    }));
  }

  function removeBrandingSlideTarget(slideIndex: number): void {
    if (!Number.isFinite(slideIndex) || slideIndex < 1 || slideIndex > 12) {
      return;
    }
    setBrandingConfig((current) => ({
      ...current,
      hero_slide_targets: current.hero_slide_targets.filter((item) => item.slide_index !== slideIndex),
    }));
    setBrandingSlideSearch((current) => ({
      ...current,
      [slideIndex]: "",
    }));
  }

  function searchProductsForBranding(query: string): StoreProduct[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return [...products]
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((item) => {
        const productSlug = item.slug.trim().toLowerCase();
        const productName = item.name.trim().toLowerCase();
        return productName.includes(normalized) || productSlug.includes(normalized);
      })
      .slice(0, 8);
  }

  async function saveBrandingSettings(): Promise<void> {
    if (!connected || authRole !== "admin") {
      return;
    }
    setError(null);
    setStatus(null);
    setSettingsBusy(true);
    try {
      const saved = await updateAdminBrandingConfig(adminToken, {
        hero_logo_primary_url:
          brandingConfig.hero_logo_primary_url.trim() || DEFAULT_ADMIN_BRANDING.hero_logo_primary_url,
        hero_logo_secondary_url:
          brandingConfig.hero_logo_secondary_url.trim() || DEFAULT_ADMIN_BRANDING.hero_logo_secondary_url,
        hero_logo_primary_width: parseBrandingWidth(
          String(brandingConfig.hero_logo_primary_width),
          DEFAULT_ADMIN_BRANDING.hero_logo_primary_width,
        ),
        hero_logo_secondary_width: parseBrandingWidth(
          String(brandingConfig.hero_logo_secondary_width),
          DEFAULT_ADMIN_BRANDING.hero_logo_secondary_width,
        ),
        hero_slide_targets: normalizeBrandingSlideTargets(brandingConfig.hero_slide_targets),
        hero_slides: normalizeBrandingSlideAssets(brandingConfig.hero_slides),
      });
      const normalizedSavedWidths = normalizeBrandingWidthPair(
        Number(saved.hero_logo_primary_width),
        Number(saved.hero_logo_secondary_width),
      );
      setBrandingConfig({
        hero_logo_primary_url:
          saved.hero_logo_primary_url || DEFAULT_ADMIN_BRANDING.hero_logo_primary_url,
        hero_logo_secondary_url:
          saved.hero_logo_secondary_url || DEFAULT_ADMIN_BRANDING.hero_logo_secondary_url,
        hero_logo_primary_width: normalizedSavedWidths.primary,
        hero_logo_secondary_width: normalizedSavedWidths.secondary,
        hero_slide_targets: normalizeBrandingSlideTargets(saved.hero_slide_targets ?? []),
        hero_slides: normalizeBrandingSlideAssets(saved.hero_slides ?? []),
      });
      setStatus("Branding dos slides atualizado com sucesso.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar branding do slide.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleBrandingLogoUpload(
    event: ChangeEvent<HTMLInputElement>,
    target: "primary" | "secondary",
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !connected || authRole !== "admin") {
      return;
    }

    setError(null);
    setStatus(null);
    if (target === "primary") {
      setBrandingPrimaryUploadBusy(true);
    } else {
      setBrandingSecondaryUploadBusy(true);
    }

    try {
      const upload = await uploadAdminImage(
        adminToken,
        file,
        "branding",
        target === "primary" ? "hero_logo_primary" : "hero_logo_secondary",
        "hero-slide",
      );
      setBrandingConfig((current) => ({
        ...current,
        ...(target === "primary"
          ? { hero_logo_primary_url: upload.url }
          : { hero_logo_secondary_url: upload.url }),
      }));
      setStatus(
        target === "primary"
          ? "Logo principal enviada para o Storage."
          : "Logo secundária enviada para o Storage.",
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao enviar logo para o Storage.",
      );
    } finally {
      if (target === "primary") {
        setBrandingPrimaryUploadBusy(false);
      } else {
        setBrandingSecondaryUploadBusy(false);
      }
    }
  }

  async function handleBrandingSlideImageUpload(
    event: ChangeEvent<HTMLInputElement>,
    slideIndex: number,
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !connected || authRole !== "admin") {
      return;
    }
    if (!Number.isFinite(slideIndex) || slideIndex < 1 || slideIndex > 12) {
      return;
    }

    setError(null);
    setStatus(null);
    setBrandingSlideUploadBusyByIndex((current) => ({
      ...current,
      [slideIndex]: true,
    }));

    try {
      const upload = await uploadAdminImage(
        adminToken,
        file,
        "branding",
        "hero_slide",
        `slide-${slideIndex}`,
      );
      upsertBrandingSlideAsset(slideIndex, () => ({ image_url: upload.url }));
      setStatus(`Imagem do slide ${slideIndex} enviada para o Storage.`);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : `Falha ao enviar imagem do slide ${slideIndex}.`,
      );
    } finally {
      setBrandingSlideUploadBusyByIndex((current) => ({
        ...current,
        [slideIndex]: false,
      }));
    }
  }

  function handleDraftCategorySelect(value: string): void {
    if (value === "__new__") {
      setDraft((current) => ({ ...current, category: "" }));
      return;
    }
    setDraft((current) => ({ ...current, category: value }));
  }

  function handleDraftProductTypeChange(value: string): void {
    setDraft((current) => {
      let nextCategory = current.category;
      if (value === "accessory") {
        if (!isAccessoryCategoryLabel(nextCategory)) {
          nextCategory = ACCESSORY_CATEGORY_PRESET[0];
        }
      } else if (isAccessoryCategoryLabel(nextCategory)) {
        nextCategory = resolveDefaultCategoryForProductType(value);
      } else if (!nextCategory.trim()) {
        nextCategory = resolveDefaultCategoryForProductType(value);
      }

      return {
        ...current,
        product_type: value,
        category: nextCategory,
      };
    });
  }

  function resolveSellerTemplatePrice(templateSlug: string): number {
    const raw = sellerTemplatePrices[templateSlug] ?? "";
    const parsed = parseBrlToNumber(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return Number.NaN;
    }
    return toMoney(parsed);
  }

  function updateSellerPendingStockDelta(templateSlug: string, delta: number): void {
    const safeTemplateSlug = templateSlug.trim().toLowerCase();
    if (!safeTemplateSlug || delta === 0) {
      return;
    }

    setSellerPendingStockDelta((current) => {
      const nextValue = (current[safeTemplateSlug] ?? 0) + delta;
      if (nextValue === 0) {
        const next = { ...current };
        delete next[safeTemplateSlug];
        return next;
      }
      return {
        ...current,
        [safeTemplateSlug]: nextValue,
      };
    });
  }

  function updateSellerStockRequestCounter(templateSlug: string, delta: number): void {
    const safeTemplateSlug = templateSlug.trim().toLowerCase();
    if (!safeTemplateSlug || delta === 0) {
      return;
    }

    setSellerStockRequestsByTemplate((current) => {
      const nextValue = (current[safeTemplateSlug] ?? 0) + delta;
      if (nextValue <= 0) {
        const next = { ...current };
        delete next[safeTemplateSlug];
        return next;
      }
      return {
        ...current,
        [safeTemplateSlug]: nextValue,
      };
    });
  }

  function applySellerStockDeltaToProducts(
    templateSlug: string,
    delta: number,
    fallbackProduct?: StoreProduct,
  ): void {
    const safeTemplateSlug = templateSlug.trim().toLowerCase();
    if (!safeTemplateSlug || delta === 0) {
      return;
    }

    setProducts((current) => {
      const matches = current
        .map((product, index) => ({ product, index }))
        .filter(
          ({ product }) =>
            (product.source_template_slug ?? "").trim().toLowerCase() === safeTemplateSlug,
        );

      if (delta > 0) {
        if (matches.length > 0) {
          const target = [...matches].sort((left, right) => {
            if (right.product.stock !== left.product.stock) {
              return right.product.stock - left.product.stock;
            }
            return left.product.slug.localeCompare(right.product.slug);
          })[0];

          if (!target) {
            return current;
          }

          return current.map((item, index) =>
            index === target.index
              ? {
                  ...item,
                  stock: Math.max(0, item.stock + delta),
                }
              : item,
          );
        }

        if (fallbackProduct) {
          const withoutSameSlug = current.filter((item) => item.slug !== fallbackProduct.slug);
          return [...withoutSameSlug, fallbackProduct].sort((left, right) =>
            left.slug.localeCompare(right.slug),
          );
        }

        return current;
      }

      const remainingStart = Math.abs(delta);
      if (remainingStart <= 0 || matches.length === 0) {
        return current;
      }

      const next = [...current];
      let remaining = remainingStart;
      const orderedMatches = [...matches].sort((left, right) => {
        if (right.product.stock !== left.product.stock) {
          return right.product.stock - left.product.stock;
        }
        return left.product.slug.localeCompare(right.product.slug);
      });

      orderedMatches.forEach(({ index }) => {
        if (remaining <= 0) {
          return;
        }
        const currentStock = Math.max(0, next[index]?.stock ?? 0);
        if (currentStock <= 0) {
          return;
        }
        const consume = Math.min(currentStock, remaining);
        next[index] = {
          ...next[index],
          stock: currentStock - consume,
        };
        remaining -= consume;
      });

      return next;
    });
  }

  async function saveSellerTemplatePrice(templateSlug: string): Promise<void> {
    if (!connected || authRole !== "seller") {
      return;
    }
    const nextPrice = resolveSellerTemplatePrice(templateSlug);
    if (!templateSlug || Number.isNaN(nextPrice) || nextPrice <= 0) {
      setError("Informe um preço válido para o produto.");
      return;
    }

    setError(null);
    setStatus(null);
    setSellerPriceSavingSlug(templateSlug);
    try {
      await updateSellerProductPrice(adminToken, {
        template_slug: templateSlug,
        price_brl: nextPrice,
      });
      const [templates, ownProducts] = await Promise.all([
        fetchSellerTemplates(adminToken),
        fetchSellerProducts(adminToken),
      ]);
      setSellerTemplates(templates);
      setProducts(ownProducts);
      setSellerPendingStockDelta({});
      setSellerStockRequestsByTemplate({});
      setStatus("Preco do produto consignado atualizado.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar preço do produto.");
    } finally {
      setSellerPriceSavingSlug(null);
    }
  }

  async function publishSellerTemplate(templateSlug: string): Promise<void> {
    if (!connected || authRole !== "seller") {
      return;
    }
    const requestedQuantity = 1;
    const configuredPrice = resolveSellerTemplatePrice(templateSlug);
    if (!templateSlug) {
      return;
    }
    if (Number.isNaN(configuredPrice) || configuredPrice <= 0) {
      setError("Informe um preço válido para publicar.");
      return;
    }

    if (!sellerUseTemplateImage && !sellerCustomImageUrl.trim()) {
      setError("Informe URL da imagem própria ou marque para usar imagem do template.");
      return;
    }

    setError(null);
    setStatus(null);
    updateSellerPendingStockDelta(templateSlug, requestedQuantity);
    updateSellerStockRequestCounter(templateSlug, 1);
    try {
      const published = await publishSellerProduct(adminToken, {
        template_slug: templateSlug,
        quantity: requestedQuantity,
        use_template_image: sellerUseTemplateImage,
        custom_image_url: sellerCustomImageUrl.trim() || null,
        price_brl: configuredPrice,
      });
      applySellerStockDeltaToProducts(templateSlug, requestedQuantity, published);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao publicar produto do seller.");
    } finally {
      updateSellerPendingStockDelta(templateSlug, -requestedQuantity);
      updateSellerStockRequestCounter(templateSlug, -1);
    }
  }

  async function withdrawSellerTemplate(
    templateSlug: string,
    availableStock: number,
  ): Promise<void> {
    if (!connected || authRole !== "seller") {
      return;
    }

    const requestedQuantity = 1;
    if (!templateSlug) {
      return;
    }

    if (availableStock <= 0) {
      setError("Você não possui estoque desse item para retirar.");
      return;
    }

    setError(null);
    setStatus(null);
    updateSellerPendingStockDelta(templateSlug, -requestedQuantity);
    updateSellerStockRequestCounter(templateSlug, 1);
    try {
      await withdrawSellerProductStock(adminToken, {
        template_slug: templateSlug,
        quantity: requestedQuantity,
      });
      applySellerStockDeltaToProducts(templateSlug, -requestedQuantity);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao retirar estoque do seller.");
    } finally {
      updateSellerPendingStockDelta(templateSlug, requestedQuantity);
      updateSellerStockRequestCounter(templateSlug, -1);
    }
  }

  function applySalesFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSalesOrdersPage(1);
    setSalesSearch(salesSearchInput.trim());
  }

  function applyProcessFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setProcessOrdersPage(1);
    setProcessSearch(processSearchInput.trim());
  }

  function updateProcessOrderDraft(orderId: string, patch: Partial<ProcessOrderDraft>): void {
    const safeOrderId = orderId.trim();
    if (!safeOrderId) {
      return;
    }

    setProcessDrafts((current) => {
      const currentDraft = current[safeOrderId] ?? {
        fulfillment_status: "em_separacao",
        cancel_reason: "",
        tracking_code: "",
      };
      return {
        ...current,
        [safeOrderId]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  }

  async function saveProcessOrder(order: SalesOrderRecord): Promise<void> {
    if (!connected) {
      return;
    }

    const draft = processDrafts[order.order_id] ?? {
      fulfillment_status: resolveOrderFulfillmentStatus(order),
      cancel_reason: order.fulfillment_cancel_reason ?? "",
      tracking_code: order.fulfillment_tracking_code ?? "",
    };

    const cancelReason = draft.cancel_reason.trim();
    const trackingCode = draft.tracking_code.trim();
    const payload: SalesOrderProcessUpdateRequest = {
      fulfillment_status: draft.fulfillment_status,
    };

    if (draft.fulfillment_status === "cancelado") {
      if (cancelReason.length < 3) {
        setError("Informe um motivo de cancelamento com pelo menos 3 caracteres.");
        return;
      }
      payload.cancel_reason = cancelReason;
    }

    if (draft.fulfillment_status === "enviado") {
      if (trackingCode.length < 4) {
        setError("Informe o código de rastreio para marcar como enviado.");
        return;
      }
      payload.tracking_code = trackingCode;
    }

    setError(null);
    setStatus(null);
    setProcessSavingOrderId(order.order_id);
    try {
      const updated =
        authRole === "seller"
          ? await updateSellerSalesOrderProcess(adminToken, order.order_id, payload)
          : await updateAdminSalesOrderProcess(adminToken, order.order_id, payload);

      setSalesOrders((current) =>
        current.map((item) => (item.order_id === updated.order_id ? updated : item)),
      );
      if ((updated.status ?? "").toLowerCase() !== "approved") {
        setProcessOrders((current) =>
          current.filter((item) => item.order_id !== updated.order_id),
        );
        setProcessOrdersTotal((current) => Math.max(0, current - 1));
      } else {
        setProcessOrders((current) =>
          current.map((item) => (item.order_id === updated.order_id ? updated : item)),
        );
      }

      setProcessDrafts((current) => ({
        ...current,
        [updated.order_id]: {
          fulfillment_status: resolveOrderFulfillmentStatus(updated),
          cancel_reason: updated.fulfillment_cancel_reason ?? "",
          tracking_code: updated.fulfillment_tracking_code ?? "",
        },
      }));

      setStatus(`Pedido ${updated.order_id} atualizado para ${formatStatusLabel(payload.fulfillment_status)}.`);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao atualizar processamento do pedido.",
      );
    } finally {
      setProcessSavingOrderId(null);
    }
  }

  function applyWebhookFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setWebhookEventsPage(1);
    setWebhookSearch(webhookSearchInput.trim());
  }

  return (
    <main className={`admin-page ${connected ? "" : "admin-page-auth"}`.trim()}>
      <header className="admin-header">
        <div>
          <h1>Painel Admin Legacy Cards</h1>
          <p>
            Fluxo separado para criar e editar cards/produtos, com assistente IA para detectar e
            corrigir inconsistências do catálogo.
          </p>
        </div>
        <div className="admin-header-actions" />
      </header>

      {connected && (
        <nav className="admin-main-nav" aria-label="Navegação principal do painel">
          {pageOptions.map((page) => (
            <button
              key={page.value}
              type="button"
              className={activePage === page.value ? "nav-active" : ""}
              onClick={() => setActivePage(page.value)}
            >
              {page.label}
            </button>
          ))}
        </nav>
      )}

      <section className="admin-auth">
        {connected ? (
          <div className="admin-auth-connected">
            <div>
              <strong>{loggedEmail ?? "Sessão ativa"}</strong>
              <p>Perfil: {authRole === "seller" ? "seller" : "admin"}</p>
              {loggedShopName && <p>Loja: {loggedShopName}</p>}
              {loggedShopSlug && <p>Slug loja: {loggedShopSlug}</p>}
              <p>2FA: {twoFactorEnabled ? "ativo" : "desativado"}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                disconnectSession("Sessão encerrada.");
              }}
            >
              Sair
            </button>
          </div>
        ) : onboardingChallenge ? (
          <form className="admin-auth-form admin-auth-form-twofactor" onSubmit={(event) => void submitSellerOnboarding(event)}>
            <div className="admin-auth-head">
              <h2>Primeiro acesso seller</h2>
              <p>Defina sua senha e valide o código do app autenticador para concluir o onboarding.</p>
            </div>
            {onboardingQrUri && (
              <div className="admin-qr-wrap">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(onboardingQrUri)}`}
                  alt="QR Code 2FA seller"
                  loading="lazy"
                />
              </div>
            )}
            <label htmlFor="seller-new-password">Nova senha</label>
            <input
              id="seller-new-password"
              type="password"
              value={onboardingPassword}
              onChange={(event) => setOnboardingPassword(event.target.value)}
              placeholder="Nova senha"
              minLength={8}
              required
            />
            <label htmlFor="seller-new-password-confirm">Confirmar nova senha</label>
            <input
              id="seller-new-password-confirm"
              type="password"
              value={onboardingPasswordConfirm}
              onChange={(event) => setOnboardingPasswordConfirm(event.target.value)}
              placeholder="Repita a nova senha"
              minLength={8}
              required
            />
            <label htmlFor="seller-onboarding-2fa">Código 2FA</label>
            <input
              id="seller-onboarding-2fa"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className="admin-otp-input"
              value={onboardingCode}
              onChange={(event) => setOnboardingCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              required
            />
            <div className="admin-auth-form-actions">
              <button
                type="submit"
                disabled={
                  authLoading ||
                  onboardingCode.trim().length < 6 ||
                  onboardingPassword.trim().length < 8 ||
                  onboardingPassword !== onboardingPasswordConfirm
                }
              >
                {authLoading ? "Concluindo..." : "Concluir onboarding"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={authLoading}
                onClick={() => {
                  setOnboardingChallenge(null);
                  setOnboardingCode("");
                  setOnboardingPassword("");
                  setOnboardingPasswordConfirm("");
                  setOnboardingQrUri(null);
                }}
              >
                Voltar
              </button>
            </div>
          </form>
        ) : twoFactorChallenge ? (
          <form className="admin-auth-form admin-auth-form-twofactor" onSubmit={(event) => void submitTwoFactor(event)}>
            <div className="admin-auth-head">
              <h2>Verificacao de seguranca</h2>
              <p>Digite os 6 digitos do Google Authenticator. Ao completar, valida automaticamente.</p>
            </div>
            <label htmlFor="admin-2fa">Codigo Google Authenticator</label>
            <input
              id="admin-2fa"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className="admin-otp-input"
              value={twoFactorCode}
              onChange={(event) => {
                setAuthError(null);
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
          <form className="admin-auth-form admin-auth-form-login" onSubmit={(event) => void submitLogin(event)}>
            <div className="admin-auth-head">
              <h2>Acesso ao painel</h2>
              <p>Entre com e-mail e senha. Admin e seller usam a mesma tela de login.</p>
            </div>
            <label htmlFor="admin-email">E-mail</label>
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
              Já existe uma carta igual ({duplicatePrompt.duplicate.name}) com mesma raridade e condição.
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

      {deletePrompt && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <h3>Confirmar exclusao</h3>
            <p>
              Item: <strong>{deletePrompt.name}</strong>
            </p>
            <p>
              Estoque atual: <strong>{deletePrompt.stock}</strong>
            </p>
            {deletePrompt.stock > 1 ? (
              <p>
                Confirmar remove apenas <strong>1 unidade</strong>. Para apagar tudo, use
                &nbsp;<strong>Excluir estoque completo</strong>.
              </p>
            ) : (
              <p>Este item possui apenas 1 unidade e sera removido por completo.</p>
            )}
            <div className="admin-modal-actions">
              <button
                type="button"
                className="ghost"
                disabled={deleteActionLoading !== null}
                onClick={() => setDeletePrompt(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteActionLoading !== null}
                onClick={() => {
                  void confirmRemoveProductSingleStock();
                }}
              >
                {deleteActionLoading === "single"
                  ? "Processando..."
                  : deletePrompt.stock > 1
                    ? "Confirmar (-1 estoque)"
                    : "Confirmar exclusao"}
              </button>
              {deletePrompt.stock > 1 && (
                <button
                  type="button"
                  className="danger"
                  disabled={deleteActionLoading !== null}
                  onClick={() => {
                    void confirmRemoveProductFullStock();
                  }}
                >
                  {deleteActionLoading === "full" ? "Excluindo..." : "Excluir estoque completo"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {editModalOpen && editorMode === "edit" && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal admin-modal-edit">
            <div className="admin-modal-head">
              <h3>Editar produto</h3>
              <button type="button" className="ghost" onClick={closeEditModal}>
                Fechar
              </button>
            </div>
            <form className="admin-edit-form" onSubmit={(event) => void saveEditProduct(event)}>
              <div className="admin-edit-grid">
                <label className="admin-field">
                  <span>Slug</span>
                  <input value={draft.slug} disabled />
                </label>
                <label className="admin-field">
                  <span>Tipo</span>
                  <input
                    value={
                      draft.product_type === "accessory"
                        ? normalizeCategory(draft.category)
                        : draft.product_type
                    }
                    disabled
                  />
                </label>
                <label className="admin-field admin-field-full">
                  <span>Nome</span>
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>Categoria</span>
                  <select
                    value={selectedCategoryOption ?? "__new__"}
                    onChange={(event) => handleDraftCategorySelect(event.target.value)}
                  >
                    {draftCategoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                    <option value="__new__">+ Nova categoria</option>
                  </select>
                </label>
                {!selectedCategoryOption && (
                  <label className="admin-field">
                    <span>Nova categoria</span>
                    <input
                      value={draft.category}
                      placeholder="ex: Sleeve"
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, category: event.target.value }))
                      }
                    />
                  </label>
                )}
                <label className="admin-field">
                  <span>Lote ID</span>
                  <input
                    value={draft.lot_id}
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
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, stock: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>Preco (BRL)</span>
                  <input
                    value={draft.price_brl}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        price_brl: formatBrlInputMask(event.target.value),
                      }))
                    }
                    required
                  />
                </label>
                <label className="admin-field admin-field-full">
                  <span>Foto principal (URL ou upload)</span>
                  <input
                    value={draft.image_url}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, image_url: event.target.value }))
                    }
                    required
                  />
                  <div className="admin-image-upload-actions">
                    <button
                      type="button"
                      className="admin-soft-button"
                      disabled={mainImageUploadBusy}
                      onClick={() => {
                        mainImageModalInputRef.current?.click();
                      }}
                    >
                      {mainImageUploadBusy ? "Enviando..." : "Upload da foto principal"}
                    </button>
                    <small>
                      Envia para Storage em{" "}
                      <strong>{resolveAdminImageUploadScope() === "cards" ? "cards" : "products"}</strong>.
                    </small>
                    <input
                      ref={mainImageModalInputRef}
                      className="admin-hidden-file-input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        void handleMainImageUpload(event);
                      }}
                    />
                  </div>
                </label>
                <label className="admin-field admin-field-full">
                  <span>Fotos adicionais (URL ou upload)</span>
                  <textarea
                    rows={2}
                    value={draft.image_gallery}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, image_gallery: event.target.value }))
                    }
                  />
                  <div className="admin-image-upload-actions">
                    <button
                      type="button"
                      className="admin-soft-button"
                      disabled={galleryImageUploadBusy}
                      onClick={() => {
                        galleryImageModalInputRef.current?.click();
                      }}
                    >
                      {galleryImageUploadBusy ? "Enviando..." : "Upload de fotos adicionais"}
                    </button>
                    <small>Selecione uma ou mais imagens.</small>
                    <input
                      ref={galleryImageModalInputRef}
                      className="admin-hidden-file-input"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => {
                        void handleGalleryImageUpload(event);
                      }}
                    />
                  </div>
                </label>

                {activeTab === "cards" ? (
                  <>
                    <label className="admin-field">
                      <span>Número da carta</span>
                      <input
                        value={draft.card_number}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, card_number: event.target.value }))
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span>Set</span>
                      <input
                        value={draft.set_name}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, set_name: event.target.value }))
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span>Raridade</span>
                      <input
                        value={draft.rarity}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, rarity: event.target.value }))
                        }
                      />
                    </label>
                    <label className="admin-field">
                      <span>Condição</span>
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
                    <label className="admin-checkbox admin-field-full">
                      <input
                        type="checkbox"
                        checked={draft.language_tag_enabled}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            language_tag_enabled: event.target.checked,
                          }))
                        }
                      />
                      <span>Exibir tag de país/idioma na loja</span>
                    </label>
                    {draft.language_tag_enabled && (
                      <label className="admin-field">
                        <span>Tag de país/idioma</span>
                        <input
                          list="language-options"
                          value={draft.language}
                          placeholder="PT, EN, JP..."
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              language: event.target.value.toUpperCase(),
                            }))
                          }
                        />
                      </label>
                    )}
                  </>
                ) : (
                  <>
                    <label className="admin-checkbox admin-field-full">
                      <input
                        type="checkbox"
                        checked={draft.language_tag_enabled}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            language_tag_enabled: event.target.checked,
                          }))
                        }
                      />
                      <span>Exibir tag de país/idioma na loja</span>
                    </label>
                    {draft.language_tag_enabled && (
                      <label className="admin-field">
                        <span>Tag de país/idioma</span>
                        <input
                          list="language-options"
                          value={draft.language}
                          placeholder="PT, EN, JP..."
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              language: event.target.value.toUpperCase(),
                            }))
                          }
                        />
                      </label>
                    )}
                    <label className="admin-field">
                      <span>Boosters na embalagem</span>
                      <input
                        type="number"
                        min="0"
                        value={draft.booster_pack_count}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            booster_pack_count: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className="admin-field admin-field-full">
                      <span>Descrição do produto</span>
                      <textarea
                        rows={3}
                        value={draft.description}
                        placeholder="Descrição pública para aparecer na loja"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, description: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field admin-field-full">
                      <span>Observações internas</span>
                      <textarea
                        rows={3}
                        value={draft.observations}
                        placeholder="Notas internas do produto/lote (opcional)"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, observations: event.target.value }))
                        }
                      />
                    </label>
                  </>
                )}

                <label className="admin-field admin-field-full">
                  <span>Tags de temporada</span>
                  <input
                    value={draft.season_tags}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, season_tags: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="admin-edit-preview">
                {draft.image_url ? (
                  <img
                    src={draft.image_url}
                    alt={draft.name || "preview produto"}
                    onError={(event) => {
                      logImageLoadError(event, "edit-modal-preview", draft.image_url, draft.name);
                    }}
                  />
                ) : (
                  <span>Sem imagem definida.</span>
                )}
              </div>

              <div className="admin-edit-flags">
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.seller_template_enabled}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        seller_template_enabled: event.target.checked,
                      }))
                    }
                  />
                  disponível para seller vender
                </label>
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.is_special}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, is_special: event.target.checked }))
                    }
                  />
                  produto em alta
                </label>
              </div>

              <div className="admin-modal-actions">
                <button type="button" className="ghost" onClick={closeEditModal}>
                  Cancelar
                </button>
                <button type="submit">Salvar alterações</button>
              </div>
            </form>
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
              Selecione o JSON do lote. O sistema vai buscar set, imagem e preço automaticamente e
              preencher condição como NM para este lote.
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
                <span>Condição padrão</span>
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
                <span>Acabamento padrão</span>
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
                <span>Categoria padrão</span>
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
                usar IA para preencher regulation mark quando a API não retornar
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
                        {entry.card_number}
                        {entry.language ? ` - ${entry.language.toUpperCase()}` : ""}
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
                        {entry.finish ?? "Sem acabamento"} - {entry.condition ?? "Sem condição"}
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
          {authRole === "admin" &&
            (activePage === "home" || activePage === "usual_edit" || activePage === "sales_metrics") && (
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
          )}

          {authRole === "admin" && activePage === "home" && (
            <section className="admin-placeholder">
              <h2>Home do Painel</h2>
              <p>
                Use o menu superior para abrir a <strong>Edição usual</strong> e acompanhar assistente +
                listagem. Para criar itens novos, use <strong>Cadastro cards/produtos</strong>.
              </p>
              <p>
                Itens cadastrados agora: <strong>{products.length}</strong>.
              </p>
            </section>
          )}

          {authRole === "admin" && activePage === "sales_metrics" && (
            <section className="admin-sales-panel">
              <h2>Métrica de Vendas</h2>
              <form
                className="admin-sales-filters"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSalesMetricsDays((current) => Math.max(1, current));
                }}
              >
                <label className="admin-field">
                  <span>Período (dias)</span>
                  <select
                    value={String(salesMetricsDays)}
                    onChange={(event) => {
                      setSalesMetricsDays(Number(event.target.value));
                    }}
                  >
                    <option value="7">7 dias</option>
                    <option value="15">15 dias</option>
                    <option value="30">30 dias</option>
                    <option value="60">60 dias</option>
                    <option value="90">90 dias</option>
                  </select>
                </label>
              </form>

              {salesMetricsLoading ? (
                <p className="admin-empty">Carregando métricas de vendas...</p>
              ) : !salesMetrics ? (
                <p className="admin-empty">Sem dados de venda para o período selecionado.</p>
              ) : (
                <>
                  <div className="admin-sales-kpis">
                    <article className="analytics-card">
                      <h3>Pedidos no período</h3>
                      <strong>{salesMetrics.total_orders}</strong>
                    </article>
                    <article className="analytics-card">
                      <h3>Receita aprovada</h3>
                      <strong>{formatCurrency(salesMetrics.approved_revenue_brl)}</strong>
                    </article>
                    <article className="analytics-card">
                      <h3>Ticket médio</h3>
                      <strong>{formatCurrency(salesMetrics.average_ticket_brl)}</strong>
                    </article>
                    <article className="analytics-card">
                      <h3>Status (aprovado/pendente/recusado)</h3>
                      <strong>
                        {salesMetrics.approved_orders}/{salesMetrics.pending_orders}/
                        {salesMetrics.rejected_orders}
                      </strong>
                    </article>
                  </div>

                  <div className="admin-sales-grid">
                    <section className="admin-sales-block">
                      <h3>Quebra por status</h3>
                      <ul>
                        {salesMetrics.status_breakdown.map((item) => (
                          <li key={item.status}>
                            <span>{formatStatusLabel(item.status)}</span>
                            <strong>
                              {item.count} - {formatCurrency(item.revenue_brl)}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="admin-sales-block">
                      <h3>Meios de pagamento</h3>
                      <ul>
                        {salesMetrics.payment_method_breakdown.map((item) => (
                          <li key={item.payment_method}>
                            <span>{formatStatusLabel(item.payment_method)}</span>
                            <strong>
                              {item.count} - {formatCurrency(item.revenue_brl)}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  <section className="admin-sales-block">
                    <h3>Top produtos por receita</h3>
                    {salesMetrics.top_products.length === 0 ? (
                      <p className="admin-empty">Nenhum item aprovado no periodo.</p>
                    ) : (
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Produto</th>
                              <th>Slug</th>
                              <th>Qtd</th>
                              <th>Receita</th>
                            </tr>
                          </thead>
                          <tbody>
                            {salesMetrics.top_products.map((item) => (
                              <tr key={`${item.slug}-${item.name}`}>
                                <td>{item.name}</td>
                                <td>{item.slug}</td>
                                <td>{item.quantity}</td>
                                <td>{formatCurrency(item.revenue_brl)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              )}
            </section>
          )}

          {((authRole === "admin" && activePage === "sales") ||
            (authRole === "seller" && activePage === "seller_sales")) && (
            <section className="admin-sales-panel">
              <h2>{authRole === "seller" ? "Minhas vendas" : "Vendas"}</h2>
              {authRole === "seller" && salesMetrics && (
                <div className="admin-sales-kpis">
                  <article className="analytics-card">
                    <h3>Pedidos no período</h3>
                    <strong>{salesMetrics.total_orders}</strong>
                  </article>
                  <article className="analytics-card">
                    <h3>Receita aprovada</h3>
                    <strong>{formatCurrency(salesMetrics.approved_revenue_brl)}</strong>
                  </article>
                  <article className="analytics-card">
                    <h3>Ticket médio</h3>
                    <strong>{formatCurrency(salesMetrics.average_ticket_brl)}</strong>
                  </article>
                </div>
              )}
              <form className="admin-sales-filters" onSubmit={applySalesFilters}>
                <label className="admin-field">
                  <span>Status</span>
                  <select
                    value={salesStatusFilter}
                    onChange={(event) => {
                      setSalesStatusFilter(event.target.value);
                      setSalesOrdersPage(1);
                    }}
                  >
                    {SALES_STATUS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field admin-field-full">
                  <span>Busca (pedido, pagamento, e-mail, UID)</span>
                  <input
                    value={salesSearchInput}
                    onChange={(event) => setSalesSearchInput(event.target.value)}
                    placeholder="Ex: legacy-... ou email@cliente.com"
                  />
                </label>
                <button type="submit">Aplicar filtro</button>
              </form>

              <p className="admin-sales-summary">
                Total filtrado: <strong>{salesOrdersTotal}</strong>
              </p>

              {salesOrdersLoading ? (
                <p className="admin-empty">Carregando pedidos...</p>
              ) : salesOrders.length === 0 ? (
                <p className="admin-empty">Nenhum pedido encontrado com esses filtros.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Status</th>
                        <th>Pagamento</th>
                        <th>Cliente</th>
                        <th>Total</th>
                        <th>Itens</th>
                        <th>Criado em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesOrders.map((item) => (
                        <tr key={item.order_id}>
                          <td>
                            <strong>{item.order_id}</strong>
                            <br />
                            <small>{item.external_reference ?? "-"}</small>
                          </td>
                          <td>
                            <span className={`admin-status admin-status-${item.status}`}>
                              {formatStatusLabel(item.status)}
                            </span>
                            <br />
                            <small>{item.status_detail ?? "-"}</small>
                          </td>
                          <td>
                            {(item.payment_method_id ?? item.payment_type_id ?? "-").toUpperCase()}
                            <br />
                            <small>{item.payment_id ?? "-"}</small>
                          </td>
                          <td>{item.user_email ?? item.uid ?? "-"}</td>
                          <td>{formatCurrency(item.total_brl)}</td>
                          <td>{item.total_items}</td>
                          <td>{formatDateTime(item.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="admin-pagination">
                <button
                  type="button"
                  className="ghost"
                  disabled={salesOrdersPage <= 1 || salesOrdersLoading}
                  onClick={() => setSalesOrdersPage((current) => Math.max(1, current - 1))}
                >
                  Página anterior
                </button>
                <span>Página {salesOrdersPage}</span>
                <button
                  type="button"
                  className="ghost"
                  disabled={!salesOrdersHasMore || salesOrdersLoading}
                  onClick={() => setSalesOrdersPage((current) => current + 1)}
                >
                  Próxima página
                </button>
              </div>
            </section>
          )}

          {((authRole === "admin" && activePage === "process") ||
            (authRole === "seller" && activePage === "seller_process")) && (
            <section className="admin-sales-panel">
              <h2>Processar Pedidos</h2>
              <p className="admin-sales-summary">
                Fila com pagamentos <strong>aprovados</strong> para preparar envio.
              </p>

              <form className="admin-sales-filters" onSubmit={applyProcessFilters}>
                <label className="admin-field admin-field-full">
                  <span>Busca (pedido, pagamento, e-mail)</span>
                  <input
                    value={processSearchInput}
                    onChange={(event) => setProcessSearchInput(event.target.value)}
                    placeholder="Ex: legacy-... ou email@cliente.com"
                  />
                </label>
                <button type="submit">Buscar</button>
              </form>

              <p className="admin-sales-summary">
                Total filtrado na fila: <strong>{processOrdersTotal}</strong>
              </p>

              {processOrdersLoading ? (
                <p className="admin-empty">Carregando fila de processamento...</p>
              ) : processOrders.length === 0 ? (
                <p className="admin-empty">Nenhum pedido aprovado pendente de processamento.</p>
              ) : (
                <div className="admin-process-grid">
                  {processOrders.map((order) => {
                    const draft = processDrafts[order.order_id] ?? {
                      fulfillment_status: resolveOrderFulfillmentStatus(order),
                      cancel_reason: order.fulfillment_cancel_reason ?? "",
                      tracking_code: order.fulfillment_tracking_code ?? "",
                    };
                    const isSavingCurrent = processSavingOrderId === order.order_id;
                    const currentFulfillment = resolveOrderFulfillmentStatus(order);

                    return (
                      <article key={order.order_id} className="admin-process-card">
                        <header>
                          <div>
                            <strong>{order.order_id}</strong>
                            <p>{order.external_reference ?? "-"}</p>
                          </div>
                          <div className="admin-process-chips">
                            <span className={`admin-status admin-status-${order.status}`}>
                              Pagamento: {formatStatusLabel(order.status)}
                            </span>
                            <span className={`admin-status admin-status-${currentFulfillment}`}>
                              Processo: {formatStatusLabel(currentFulfillment)}
                            </span>
                          </div>
                        </header>

                        <div className="admin-process-meta">
                          <span>Cliente: {order.user_email ?? order.uid ?? "-"}</span>
                          <span>Total: {formatCurrency(order.total_brl)}</span>
                          <span>Itens: {order.total_items}</span>
                          <span>Envio: {formatShippingLabel(order)}</span>
                          {order.shipping_eta_label && <span>Prazo: {order.shipping_eta_label}</span>}
                          {order.shipping_destination_cep && (
                            <span>CEP destino: {order.shipping_destination_cep}</span>
                          )}
                          {order.shipping_margin_percent != null && order.shipping_margin_percent > 0 && (
                            <span>
                              Margem frete: {order.shipping_margin_percent.toFixed(0)}% (
                              {formatCurrency(order.shipping_margin_brl ?? 0)})
                            </span>
                          )}
                          <span>Criado em: {formatDateTime(order.created_at)}</span>
                        </div>

                        <div className="admin-process-items">
                          <h3>Produtos do pedido</h3>
                          <ul>
                            {order.items.map((item, index) => (
                              <li key={`${order.order_id}-${item.slug}-${index}`}>
                                <span>
                                  {item.quantity}x {item.name ?? item.slug ?? "Produto"}
                                </span>
                                <strong>{formatCurrency(item.total_price_brl)}</strong>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="admin-process-actions">
                          <label className="admin-field">
                            <span>Status de processamento</span>
                            <select
                              value={draft.fulfillment_status}
                              onChange={(event) =>
                                updateProcessOrderDraft(order.order_id, {
                                  fulfillment_status:
                                    event.target.value as SalesOrderProcessUpdateRequest["fulfillment_status"],
                                })
                              }
                              disabled={isSavingCurrent}
                            >
                              {PROCESS_FULFILLMENT_STATUS_OPTIONS.map((item) => (
                                <option key={`${order.order_id}-${item.value}`} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          {draft.fulfillment_status === "cancelado" && (
                            <label className="admin-field admin-field-full">
                              <span>Motivo do cancelamento (visível para o usuário)</span>
                              <textarea
                                rows={3}
                                value={draft.cancel_reason}
                                onChange={(event) =>
                                  updateProcessOrderDraft(order.order_id, {
                                    cancel_reason: event.target.value,
                                  })
                                }
                                placeholder="Ex: item indisponível, endereço inválido..."
                                disabled={isSavingCurrent}
                              />
                            </label>
                          )}

                          {draft.fulfillment_status === "enviado" && (
                            <label className="admin-field admin-field-full">
                              <span>Código de rastreio</span>
                              <input
                                value={draft.tracking_code}
                                onChange={(event) =>
                                  updateProcessOrderDraft(order.order_id, {
                                    tracking_code: event.target.value,
                                  })
                                }
                                placeholder="Ex: BR123456789..."
                                disabled={isSavingCurrent}
                              />
                            </label>
                          )}

                          <div className="admin-process-footer">
                            {order.fulfillment_tracking_code && (
                              <span>Rastreio atual: {order.fulfillment_tracking_code}</span>
                            )}
                            {order.fulfillment_cancel_reason && (
                              <span>Motivo atual: {order.fulfillment_cancel_reason}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                void saveProcessOrder(order);
                              }}
                              disabled={isSavingCurrent}
                            >
                              {isSavingCurrent ? "Salvando..." : "Salvar status"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="admin-pagination">
                <button
                  type="button"
                  className="ghost"
                  disabled={processOrdersPage <= 1 || processOrdersLoading}
                  onClick={() => setProcessOrdersPage((current) => Math.max(1, current - 1))}
                >
                  Página anterior
                </button>
                <span>Página {processOrdersPage}</span>
                <button
                  type="button"
                  className="ghost"
                  disabled={!processOrdersHasMore || processOrdersLoading}
                  onClick={() => setProcessOrdersPage((current) => current + 1)}
                >
                  Próxima página
                </button>
              </div>
            </section>
          )}

          {authRole === "admin" && activePage === "webhooks" && (
            <section className="admin-sales-panel">
              <h2>Eventos de Webhook (Mercado Pago)</h2>
              <form className="admin-sales-filters" onSubmit={applyWebhookFilters}>
                <label className="admin-field">
                  <span>Status</span>
                  <select
                    value={webhookStatusFilter}
                    onChange={(event) => {
                      setWebhookStatusFilter(event.target.value);
                      setWebhookEventsPage(1);
                    }}
                  >
                    {WEBHOOK_STATUS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field admin-field-full">
                  <span>Busca (event_id, order_id, payment_id, status)</span>
                  <input
                    value={webhookSearchInput}
                    onChange={(event) => setWebhookSearchInput(event.target.value)}
                    placeholder="Ex: updated:approved, legacy-..., 1345..."
                  />
                </label>
                <button type="submit">Aplicar filtro</button>
              </form>

              <p className="admin-sales-summary">
                Total filtrado: <strong>{webhookEventsTotal}</strong>
              </p>

              {webhookEventsLoading ? (
                <p className="admin-empty">Carregando eventos...</p>
              ) : webhookEvents.length === 0 ? (
                <p className="admin-empty">Nenhum evento de webhook encontrado.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Recebido em</th>
                        <th>Status</th>
                        <th>Evento</th>
                        <th>Pagamento</th>
                        <th>Pedido</th>
                        <th>Referência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {webhookEvents.map((item) => (
                        <tr key={item.event_id}>
                          <td>{formatDateTime(item.created_at)}</td>
                          <td>
                            <span className={`admin-status admin-status-${item.status}`}>
                              {formatStatusLabel(item.status)}
                            </span>
                          </td>
                          <td>
                            {formatStatusLabel(item.event_type ?? item.event_name ?? "-")}
                            <br />
                            <small>{item.action ?? "-"}</small>
                          </td>
                          <td>{item.payment_id ?? item.resource_id ?? "-"}</td>
                          <td>{item.order_id ?? "-"}</td>
                          <td>{item.external_reference ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="admin-pagination">
                <button
                  type="button"
                  className="ghost"
                  disabled={webhookEventsPage <= 1 || webhookEventsLoading}
                  onClick={() => setWebhookEventsPage((current) => Math.max(1, current - 1))}
                >
                  Página anterior
                </button>
                <span>Página {webhookEventsPage}</span>
                <button
                  type="button"
                  className="ghost"
                  disabled={!webhookEventsHasMore || webhookEventsLoading}
                  onClick={() => setWebhookEventsPage((current) => current + 1)}
                >
                  Próxima página
                </button>
              </div>
            </section>
          )}

          {authRole === "admin" && activePage === "sellers" && (
            <section className="admin-sales-panel">
              <h2>Gestão de Vendedores</h2>
              <form
                className="admin-sales-filters"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createSellerAccount();
                }}
              >
                <label className="admin-field">
                  <span>E-mail do seller</span>
                  <input
                    type="email"
                    value={newSellerEmail}
                    onChange={(event) => setNewSellerEmail(event.target.value)}
                    placeholder="seller@loja.com"
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>Nome da loja</span>
                  <input
                    value={newSellerShopName}
                    onChange={(event) => setNewSellerShopName(event.target.value)}
                    placeholder="Loja consignada"
                    required
                  />
                </label>
                <button type="submit" disabled={settingsBusy}>
                  {settingsBusy ? "Criando..." : "Criar seller"}
                </button>
              </form>

              {createdSellerTempPassword && (
                <p className="admin-state warning">
                  Senha temporaria gerada: <strong>{createdSellerTempPassword}</strong>
                </p>
              )}

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>E-mail</th>
                      <th>Loja</th>
                      <th>Slug loja</th>
                      <th>Status</th>
                      <th>Primeiro acesso</th>
                      <th>2FA</th>
                      <th>Taxa base</th>
                      <th>Produtos c/regra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellerAccounts.map((item) => {
                      const sellerEmail = item.email.trim().toLowerCase();
                      const isExpanded = expandedSellerEmail === sellerEmail;
                      const payoutDraft = sellerPayoutDrafts[sellerEmail];
                      const loadingPayout = sellerPayoutLoadingEmail === sellerEmail;
                      const savingPayout = sellerPayoutSavingEmail === sellerEmail;
                      const savingStatus = sellerStatusSavingEmail === sellerEmail;
                      const isActiveSeller = item.status.trim().toLowerCase() === "active";
                      const baseFee = Number(
                        payoutDraft?.base_fee_brl ?? item.payout_base_fee_brl ?? 6,
                      );
                      const activeRulesCount = payoutDraft
                        ? payoutDraft.rules.filter((rule) => rule.active).length
                        : item.payout_rules_count;

                      return [
                        <tr
                          key={`${sellerEmail}-summary`}
                          className={`admin-seller-row ${isExpanded ? "is-open" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            void toggleSellerDetails(sellerEmail);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              void toggleSellerDetails(sellerEmail);
                            }
                          }}
                        >
                          <td>{item.email}</td>
                          <td>{item.shop_name}</td>
                          <td>{item.shop_slug}</td>
                          <td>{item.status}</td>
                          <td>{item.must_change_password ? "pendente" : "concluído"}</td>
                          <td>{item.two_factor_enabled ? "ativo" : "desativado"}</td>
                          <td>{formatCurrency(baseFee)}</td>
                          <td>{activeRulesCount}</td>
                        </tr>,
                        ...(isExpanded
                          ? [
                              <tr key={`${sellerEmail}-details`} className="admin-seller-row-details">
                                <td colSpan={8}>
                                  <div className="admin-seller-details-panel">
                                    <div className="admin-seller-details-head">
                                      <div>
                                        <h3>Repasse por produto</h3>
                                        <p>
                                          Configure percentual ou valor fixo para a Legacy em cada produto
                                          do seller.
                                        </p>
                                      </div>
                                      <div className="admin-inline-actions">
                                        <button
                                          type="button"
                                          className={isActiveSeller ? "danger" : "ghost"}
                                          disabled={savingStatus}
                                          onClick={() => {
                                            void toggleSellerAccess(item);
                                          }}
                                        >
                                          {savingStatus
                                            ? "Atualizando..."
                                            : isActiveSeller
                                              ? "Desativar seller"
                                              : "Reativar seller"}
                                        </button>
                                        <button
                                          type="button"
                                          className="ghost"
                                          onClick={() => setExpandedSellerEmail(null)}
                                        >
                                          Fechar
                                        </button>
                                      </div>
                                    </div>

                                    {loadingPayout && (
                                      <p className="admin-empty">Carregando configuração de repasse...</p>
                                    )}

                                    {!loadingPayout && (
                                      <>
                                        <div className="admin-seller-base-fee">
                                          <label className="admin-field">
                                            <span>Taxa fixa por item (R$)</span>
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              value={String(baseFee)}
                                              onChange={(event) => {
                                                const nextValue = Number(event.target.value);
                                                setSellerPayoutDrafts((current) => {
                                                  const draftForSeller = current[sellerEmail] ?? {
                                                    base_fee_brl: Number(baseFee),
                                                    rules: [],
                                                  };
                                                  return {
                                                    ...current,
                                                    [sellerEmail]: {
                                                      ...draftForSeller,
                                                      base_fee_brl: toNonNegativeMoney(
                                                        Number.isFinite(nextValue) ? nextValue : 0,
                                                      ),
                                                    },
                                                  };
                                                });
                                              }}
                                              disabled={savingPayout}
                                            />
                                          </label>
                                          <p className="admin-sales-summary">
                                            Valor padrão sugerido: <strong>R$ 6,00</strong> por item.
                                          </p>
                                        </div>

                                        {adminSellerTemplateProducts.length === 0 ? (
                                          <p className="admin-empty">
                                            Nenhum produto de admin habilitado para seller.
                                          </p>
                                        ) : (
                                          <div className="admin-seller-payout-grid">
                                            {adminSellerTemplateProducts.map((template) => {
                                              const currentRule =
                                                resolveSellerRuleForTemplate(template, payoutDraft ?? null);
                                              const ruleLabel = formatSellerCommissionLabel(currentRule);
                                              const projection = estimatePayoutExample({
                                                unitPrice: template.price_brl,
                                                quantity: 10,
                                                baseFee,
                                                rule: currentRule,
                                              });

                                              return (
                                                <article
                                                  key={`${sellerEmail}-${template.slug}`}
                                                  className="admin-seller-payout-card"
                                                >
                                                  <header>
                                                    <strong>{template.name}</strong>
                                                    <span>{formatCurrency(template.price_brl)}</span>
                                                  </header>
                                                  <p className="admin-seller-rule-preview">
                                                    <span
                                                      className={`admin-seller-rule-chip ${
                                                        currentRule.active ? "is-active" : "is-inactive"
                                                      }`}
                                                    >
                                                      {ruleLabel}
                                                    </span>
                                                  </p>
                                                  <p className="admin-product-slug">{template.slug}</p>
                                                  <div className="admin-seller-payout-controls">
                                                    <label className="admin-checkbox">
                                                      <input
                                                        type="checkbox"
                                                        checked={currentRule.active}
                                                        onChange={(event) => {
                                                          upsertSellerRuleDraft(
                                                            sellerEmail,
                                                            template,
                                                            (rule) => ({
                                                              ...rule,
                                                              active: event.target.checked,
                                                            }),
                                                          );
                                                        }}
                                                        disabled={savingPayout}
                                                      />
                                                      Ativar regra
                                                    </label>

                                                    <label className="admin-field">
                                                      <span>Tipo de ganho</span>
                                                      <select
                                                        value={currentRule.commission_mode}
                                                        onChange={(event) => {
                                                          const nextMode =
                                                            event.target.value === "fixed"
                                                              ? "fixed"
                                                              : "percent";
                                                          upsertSellerRuleDraft(
                                                            sellerEmail,
                                                            template,
                                                            (rule) => ({
                                                              ...rule,
                                                              commission_mode: nextMode,
                                                              commission_percent:
                                                                nextMode === "percent"
                                                                  ? Number(
                                                                      rule.commission_percent ?? 0,
                                                                    )
                                                                  : null,
                                                              commission_fixed_brl:
                                                                nextMode === "fixed"
                                                                  ? Number(
                                                                      rule.commission_fixed_brl ?? 0,
                                                                    )
                                                                  : null,
                                                            }),
                                                          );
                                                        }}
                                                        disabled={savingPayout}
                                                      >
                                                        <option value="percent">Percentual (%)</option>
                                                        <option value="fixed">Valor fixo (R$)</option>
                                                      </select>
                                                    </label>

                                                    {currentRule.commission_mode === "percent" ? (
                                                      <label className="admin-field">
                                                        <span>Percentual da Legacy (%)</span>
                                                        <input
                                                          type="number"
                                                          min="0"
                                                          max="100"
                                                          step="0.01"
                                                          value={String(
                                                            Number(currentRule.commission_percent ?? 0),
                                                          )}
                                                          onChange={(event) => {
                                                            const nextValue = Number(event.target.value);
                                                            upsertSellerRuleDraft(
                                                              sellerEmail,
                                                              template,
                                                              (rule) => ({
                                                                ...rule,
                                                                commission_percent: Number.isFinite(
                                                                  nextValue,
                                                                )
                                                                  ? nextValue
                                                                  : 0,
                                                              }),
                                                            );
                                                          }}
                                                          disabled={savingPayout}
                                                        />
                                                      </label>
                                                    ) : (
                                                      <label className="admin-field">
                                                        <span>Valor por item para Legacy (R$)</span>
                                                        <input
                                                          type="number"
                                                          min="0"
                                                          step="0.01"
                                                          value={String(
                                                            Number(currentRule.commission_fixed_brl ?? 0),
                                                          )}
                                                          onChange={(event) => {
                                                            const nextValue = Number(event.target.value);
                                                            upsertSellerRuleDraft(
                                                              sellerEmail,
                                                              template,
                                                              (rule) => ({
                                                                ...rule,
                                                                commission_fixed_brl: Number.isFinite(
                                                                  nextValue,
                                                                )
                                                                  ? nextValue
                                                                  : 0,
                                                              }),
                                                            );
                                                          }}
                                                          disabled={savingPayout}
                                                        />
                                                      </label>
                                                    )}
                                                  </div>
                                                  <p className="admin-seller-simulation">
                                                    Exemplo (10 vendas): seller{" "}
                                                    <strong>{formatCurrency(projection.sellerTotal)}</strong> |
                                                    Legacy{" "}
                                                    <strong>{formatCurrency(projection.adminTotal)}</strong>
                                                  </p>
                                                </article>
                                              );
                                            })}
                                          </div>
                                        )}

                                        <div className="admin-seller-details-actions">
                                          <button
                                            type="button"
                                            disabled={savingPayout}
                                            onClick={() => {
                                              void saveSellerPayoutDraft(sellerEmail);
                                            }}
                                          >
                                            {savingPayout ? "Salvando..." : "Salvar configuração"}
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>,
                            ]
                          : []),
                      ];
                    })}
                    {sellerAccounts.length === 0 && (
                      <tr>
                        <td colSpan={8}>Nenhum seller cadastrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {authRole === "admin" && activePage === "settings" && (
            <section className="admin-sales-panel">
              <h2>Configurações Modulares</h2>
              <div className="admin-settings-grid">
                <article className="admin-settings-card">
                  <h3>Categorias automáticas</h3>
                  <p className="admin-settings-card-help">
                    Essas categorias são geradas automaticamente a partir dos produtos do catálogo.
                  </p>
                  {panelCategories.length > 0 ? (
                    <div className="admin-settings-pill-list">
                      {panelCategories.map((category) => (
                        <span key={category} className="admin-settings-pill">
                          {category}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-settings-card-help">Nenhuma categoria encontrada no catálogo.</p>
                  )}
                </article>

                <article className="admin-settings-card">
                  <h3>Menu da loja automático</h3>
                  <p className="admin-settings-card-help">
                    O menu é montado automaticamente com base nos tipos/categorias existentes no catálogo.
                  </p>
                  {menuConfigItems.length > 0 ? (
                    <div className="admin-settings-menu-preview">
                      {menuConfigItems.map((item) => (
                        <div key={item.id} className="admin-settings-menu-row">
                          <strong>{item.label}</strong>
                          {item.children.length > 0 ? (
                            <span>{item.children.map((child) => child.label).join(" • ")}</span>
                          ) : (
                            <span>Sem submenus</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-settings-card-help">Menu indisponível no momento.</p>
                  )}
                  <div className="admin-settings-card-actions">
                    <button
                      type="button"
                      onClick={() => {
                        void refreshAutomaticStoreSettings();
                      }}
                      disabled={settingsBusy}
                    >
                      {settingsBusy ? "Sincronizando..." : "Sincronizar agora"}
                    </button>
                  </div>
                </article>
              </div>

              <article className="admin-settings-card admin-settings-branding-card">
                <h3>Logos Fixas do Slide</h3>
                <p className="admin-settings-card-help">
                  Essas duas logos ficam fixas no canto superior direito dos slides.
                </p>

                <div className="admin-branding-form-grid">
                  <label className="admin-field">
                    <span>Logo 1 (URL)</span>
                    <input
                      value={brandingConfig.hero_logo_primary_url}
                      onChange={(event) =>
                        setBrandingConfig((current) => ({
                          ...current,
                          hero_logo_primary_url: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                  </label>
                  <label className="admin-field">
                    <span>Largura da logo 1 (px)</span>
                    <input
                      type="number"
                      min={40}
                      max={460}
                      value={brandingConfig.hero_logo_primary_width}
                      onChange={(event) =>
                        handleBrandingWidthChange("hero_logo_primary_width", event.target.value)
                      }
                    />
                  </label>

                  <label className="admin-field">
                    <span>Logo 2 (URL)</span>
                    <input
                      value={brandingConfig.hero_logo_secondary_url}
                      onChange={(event) =>
                        setBrandingConfig((current) => ({
                          ...current,
                          hero_logo_secondary_url: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                  </label>
                  <label className="admin-field">
                    <span>Largura da logo 2 (px)</span>
                    <input
                      type="number"
                      min={40}
                      max={460}
                      value={brandingConfig.hero_logo_secondary_width}
                      onChange={(event) =>
                        handleBrandingWidthChange("hero_logo_secondary_width", event.target.value)
                      }
                    />
                  </label>
                </div>

                <div className="admin-branding-upload-actions">
                  <button
                    type="button"
                    disabled={brandingPrimaryUploadBusy}
                    onClick={() => brandingPrimaryInputRef.current?.click()}
                  >
                    {brandingPrimaryUploadBusy ? "Enviando..." : "Upload logo 1"}
                  </button>
                  <input
                    ref={brandingPrimaryInputRef}
                    className="admin-hidden-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      void handleBrandingLogoUpload(event, "primary");
                    }}
                  />

                  <button
                    type="button"
                    disabled={brandingSecondaryUploadBusy}
                    onClick={() => brandingSecondaryInputRef.current?.click()}
                  >
                    {brandingSecondaryUploadBusy ? "Enviando..." : "Upload logo 2"}
                  </button>
                  <input
                    ref={brandingSecondaryInputRef}
                    className="admin-hidden-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      void handleBrandingLogoUpload(event, "secondary");
                    }}
                  />
                </div>

                <div className="admin-branding-slide-links">
                  <h4>Vínculo de produto por slide</h4>
                  <p>
                    Selecione um produto para cada slide. Ao clicar no slide na loja, o cliente será
                    levado para o produto escolhido.
                  </p>

                  <div className="admin-branding-slide-links-grid">
                    {Array.from({ length: HERO_SLIDE_SETTINGS_COUNT }, (_, offset) => {
                      const slideIndex = offset + 1;
                      const selectedTarget = brandingConfig.hero_slide_targets.find(
                        (item) => item.slide_index === slideIndex,
                      );
                      const selectedProduct = selectedTarget
                        ? products.find((item) => item.slug === selectedTarget.product_slug)
                        : null;
                      const searchValue = brandingSlideSearch[slideIndex] ?? "";
                      const searchResults = searchProductsForBranding(searchValue);

                      return (
                        <article key={`branding-slide-target-${slideIndex}`} className="admin-branding-slide-target-card">
                          <header>
                            <strong>Slide {slideIndex}</strong>
                            {selectedTarget ? <span>Vinculado</span> : <span>Sem vínculo</span>}
                          </header>

                          <p>
                            Produto atual:{" "}
                            <strong>
                              {selectedProduct
                                ? selectedProduct.name
                                : selectedTarget?.product_name || selectedTarget?.product_slug || "Nenhum"}
                            </strong>
                          </p>

                          <label className="admin-field">
                            <span>Buscar produto por nome ou slug</span>
                            <input
                              value={searchValue}
                              onChange={(event) =>
                                setBrandingSlideSearch((current) => ({
                                  ...current,
                                  [slideIndex]: event.target.value,
                                }))
                              }
                              placeholder="Ex.: charizard, booster, pelucia..."
                            />
                          </label>

                          {searchValue.trim().length > 0 && (
                            <div className="admin-branding-search-results">
                              {searchResults.length === 0 && (
                                <p>Nenhum produto encontrado para essa busca.</p>
                              )}
                              {searchResults.map((item) => (
                                <button
                                  key={`slide-${slideIndex}-pick-${item.slug}`}
                                  type="button"
                                  className="admin-branding-search-item"
                                  onClick={() => {
                                    assignBrandingSlideTarget(slideIndex, item);
                                  }}
                                >
                                  <strong>{item.name}</strong>
                                  <span>{item.slug}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="admin-branding-slide-target-actions">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => {
                                removeBrandingSlideTarget(slideIndex);
                              }}
                            >
                              Limpar vínculo
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <div className="admin-branding-slide-media">
                  <h4>Imagem e posição de cada slide</h4>
                  <p>
                    Você pode subir uma imagem no bucket e ajustar a posição horizontal para ela
                    ficar mais à esquerda ou direita.
                  </p>
                  <div className="admin-branding-slide-media-grid">
                    {Array.from({ length: HERO_SLIDE_SETTINGS_COUNT }, (_, offset) => {
                      const slideIndex = offset + 1;
                      const slideAsset = resolveBrandingSlideAsset(slideIndex);
                      const slideImageUrl = slideAsset.image_url?.trim() || "";
                      const uploadBusy = brandingSlideUploadBusyByIndex[slideIndex] === true;
                      return (
                        <article key={`branding-slide-media-${slideIndex}`} className="admin-branding-slide-media-card">
                          <header>
                            <strong>Slide {slideIndex}</strong>
                            <span>{slideImageUrl ? "Imagem customizada" : "Imagem padrão da loja"}</span>
                          </header>

                          <div className="admin-branding-slide-media-preview">
                            {slideImageUrl ? (
                              <img
                                src={slideImageUrl}
                                alt={`Preview do slide ${slideIndex}`}
                                style={{ objectPosition: `${slideAsset.focus_x_percent}% center` }}
                              />
                            ) : (
                              <div className="admin-branding-slide-media-placeholder">
                                Usando imagem padrão do tema
                              </div>
                            )}
                          </div>

                          <label className="admin-field">
                            <span>Imagem do slide (URL)</span>
                            <input
                              value={slideImageUrl}
                              onChange={(event) => {
                                upsertBrandingSlideAsset(slideIndex, () => ({
                                  image_url: event.target.value,
                                }));
                              }}
                              placeholder="https://..."
                            />
                          </label>

                          <label className="admin-field">
                            <span>Título do slide</span>
                            <input
                              value={slideAsset.name ?? ""}
                              onChange={(event) => {
                                upsertBrandingSlideAsset(slideIndex, () => ({
                                  name: event.target.value,
                                }));
                              }}
                              placeholder="Ex.: Coleção Treinador Avançado..."
                            />
                          </label>

                          <div className="admin-branding-slide-media-meta">
                            <label className="admin-field">
                              <span>Categoria</span>
                              <input
                                value={slideAsset.category ?? ""}
                                onChange={(event) => {
                                  upsertBrandingSlideAsset(slideIndex, () => ({
                                    category: event.target.value,
                                  }));
                                }}
                                placeholder="Ex.: Pré-order"
                              />
                            </label>
                            <label className="admin-field">
                              <span>Tipo</span>
                              <input
                                value={slideAsset.product_type ?? ""}
                                onChange={(event) => {
                                  upsertBrandingSlideAsset(slideIndex, () => ({
                                    product_type: event.target.value,
                                  }));
                                }}
                                placeholder="Ex.: Box de treinador"
                              />
                            </label>
                          </div>

                          <label className="admin-field">
                            <span>Preço (R$)</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={slideAsset.price_brl ?? ""}
                              onChange={(event) => {
                                upsertBrandingSlideAsset(slideIndex, () => ({
                                  price_brl: parseBrandingSlideMoney(event.target.value),
                                }));
                              }}
                              placeholder="0,00"
                            />
                          </label>

                          <label className="admin-field">
                            <span>Posição horizontal: {slideAsset.focus_x_percent}%</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={slideAsset.focus_x_percent}
                              onChange={(event) => {
                                upsertBrandingSlideAsset(slideIndex, () => ({
                                  focus_x_percent: parseBrandingFocusPercent(event.target.value, slideAsset.focus_x_percent),
                                }));
                              }}
                            />
                          </label>

                          <div className="admin-branding-slide-media-actions">
                            <button
                              type="button"
                              onClick={() => brandingSlideInputRefs.current[slideIndex]?.click()}
                              disabled={uploadBusy}
                            >
                              {uploadBusy ? "Enviando..." : "Upload imagem"}
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              disabled={uploadBusy}
                              onClick={() => {
                                upsertBrandingSlideAsset(slideIndex, () => ({
                                  image_url: null,
                                  focus_x_percent: BRANDING_DEFAULT_FOCUS_X_PERCENT,
                                }));
                              }}
                            >
                              Limpar
                            </button>
                            <input
                              ref={(node) => {
                                brandingSlideInputRefs.current[slideIndex] = node;
                              }}
                              className="admin-hidden-file-input"
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                void handleBrandingSlideImageUpload(event, slideIndex);
                              }}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <div className="admin-branding-preview-wrap">
                  <span>Preview no slide</span>
                  <div className="admin-branding-preview-track" aria-hidden="true">
                    {Array.from({ length: HERO_SLIDE_SETTINGS_COUNT }, (_, offset) => {
                      const slideIndex = offset + 1;
                      const slideAsset = resolveBrandingSlideAsset(slideIndex);
                      const fallback = BRANDING_PREVIEW_DEFAULT_COPY[offset] ?? BRANDING_PREVIEW_DEFAULT_COPY[0];
                      const imageUrl = slideAsset.image_url?.trim() || null;
                      const slideName = slideAsset.name ?? fallback.name;
                      const slideCategory = slideAsset.category ?? fallback.category;
                      const slideType = slideAsset.product_type ?? fallback.product_type;
                      const slidePrice = slideAsset.price_brl ?? fallback.price_brl;
                      return (
                        <article key={`branding-preview-${slideIndex}`} className="admin-branding-preview-slide">
                          <div className="admin-branding-preview-media">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={`Preview do slide ${slideIndex}`}
                                style={{ objectPosition: `${slideAsset.focus_x_percent}% center` }}
                              />
                            ) : (
                              <div className="admin-branding-preview-empty">
                                Sem imagem customizada
                              </div>
                            )}
                          </div>
                          <div className="admin-branding-preview-logos">
                            <img
                              src={brandingConfig.hero_logo_primary_url || DEFAULT_ADMIN_BRANDING.hero_logo_primary_url}
                              alt="Logo principal"
                              style={{ width: `${brandingConfig.hero_logo_primary_width}px` }}
                            />
                            <img
                              src={
                                brandingConfig.hero_logo_secondary_url ||
                                DEFAULT_ADMIN_BRANDING.hero_logo_secondary_url
                              }
                              alt="Logo secundária"
                              style={{ width: `${brandingConfig.hero_logo_secondary_width}px` }}
                            />
                          </div>
                          <div className="admin-branding-preview-content">
                            <span>Slide {slideIndex}</span>
                            <strong>{slideName}</strong>
                            <small>
                              {slideCategory} • {slideType}
                            </small>
                            <em>{formatCurrency(slidePrice)}</em>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <div className="admin-settings-card-actions">
                  <button type="button" onClick={() => { void saveBrandingSettings(); }} disabled={settingsBusy}>
                    {settingsBusy ? "Salvando..." : "Salvar branding dos slides"}
                  </button>
                </div>
              </article>
            </section>
          )}

          {authRole === "seller" && activePage === "seller_products" && (
            <section className="admin-sales-panel">
              <h2>Cadastro de produtos consignados</h2>
              <p className="admin-sales-summary">
                Itens liberados para vender: <strong>{sellerTemplates.length}</strong> | Seu estoque
                total publicado: <strong>{sellerTotalPublishedStock}</strong>
              </p>

              <div className="admin-seller-template-controls">
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={sellerUseTemplateImage}
                    onChange={(event) => setSellerUseTemplateImage(event.target.checked)}
                  />
                  Usar imagem do admin
                </label>
                {!sellerUseTemplateImage && (
                  <label className="admin-field admin-field-full">
                    <span>URL da imagem própria para novas adições</span>
                    <input
                      value={sellerCustomImageUrl}
                      onChange={(event) => setSellerCustomImageUrl(event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                )}
              </div>
              {sellerOwnPayoutLoading && (
                <p className="admin-sales-summary">Carregando métricas de repasse...</p>
              )}

              <div className="admin-categories admin-seller-template-categories">
                {sellerTemplates.length === 0 && (
                  <p className="admin-empty">Nenhum item liberado pelo admin para seller vender.</p>
                )}

                {sellerTemplates.length > 0 && (
                  <section className="admin-category-group">
                    <header>
                      <h3>Itens disponíveis para adicionar</h3>
                      <span>{sellerTemplates.length} itens</span>
                    </header>

                    <div className="admin-product-grid admin-seller-template-grid">
                      {sellerTemplates.map((item) => {
                        const currentStock = sellerStockByTemplateSlug.get(item.slug) ?? 0;
                        const pendingDelta = sellerPendingStockDelta[item.slug] ?? 0;
                        const displayedStock = Math.max(0, currentStock + pendingDelta);
                        const pendingRequests = sellerStockRequestsByTemplate[item.slug] ?? 0;
                        const quantityForPreview = 1;
                        const parsedSellerPrice = resolveSellerTemplatePrice(item.slug);
                        const unitPriceForPreview =
                          Number.isFinite(parsedSellerPrice) && parsedSellerPrice > 0
                            ? parsedSellerPrice
                            : item.price_brl;
                        const priceSavingCurrent = sellerPriceSavingSlug === item.slug;
                        const sellerRule = resolveSellerRuleForTemplate(item, sellerOwnPayoutConfig);
                        const projection = estimatePayoutExample({
                          unitPrice: unitPriceForPreview,
                          quantity: quantityForPreview,
                          baseFee: Number(
                            sellerOwnPayoutConfig?.base_fee_brl ?? SELLER_DEFAULT_BASE_FEE_BRL,
                          ),
                          rule: sellerRule,
                        });

                        return (
                          <article key={item.slug} className="admin-product-card admin-seller-template-card">
                            <div className="admin-product-media">
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  loading="lazy"
                                  onError={(event) => {
                                    logImageLoadError(
                                      event,
                                      "seller-template-card",
                                      item.image_url,
                                      item.name,
                                    );
                                  }}
                                />
                              ) : (
                                <span className="admin-image-fallback">Sem foto</span>
                              )}
                            </div>
                            <div className="admin-product-content">
                              <strong>{item.name}</strong>
                              <p>Preço base: {formatCurrency(item.price_brl)}</p>
                              <p>
                                Seu preço:{" "}
                                <strong>
                                  {Number.isFinite(parsedSellerPrice) && parsedSellerPrice > 0
                                    ? formatCurrency(parsedSellerPrice)
                                    : "Não definido"}
                                </strong>
                              </p>
                              <p className="admin-seller-inline-preview">
                                Prévia ({quantityForPreview} un): seller{" "}
                                <strong>{formatCurrency(projection.sellerTotal)}</strong> | Legacy{" "}
                                <strong>{formatCurrency(projection.adminTotal)}</strong>
                              </p>
                            </div>
                            <div className="admin-seller-stock-balance">
                              <span className="admin-seller-stock-label">
                                Estoque: <strong>{displayedStock}</strong>
                              </span>
                              {pendingRequests > 0 && <small>Sincronizando...</small>}
                            </div>
                            <div className="admin-seller-template-actions">
                              <button
                                type="button"
                                className="admin-seller-stock-button is-minus"
                                disabled={
                                  priceSavingCurrent ||
                                  displayedStock <= 0
                                }
                                onClick={() => {
                                  void withdrawSellerTemplate(item.slug, displayedStock);
                                }}
                              >
                                -
                              </button>
                              <input
                                className="admin-seller-qty-input"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={String(displayedStock)}
                                readOnly
                                aria-label={`Estoque atual de ${item.name}${
                                  pendingRequests > 0 ? " (sincronizando)" : ""
                                }`}
                              />
                              <button
                                type="button"
                                className="admin-seller-stock-button is-plus"
                                disabled={priceSavingCurrent}
                                onClick={() => {
                                  void publishSellerTemplate(item.slug);
                                }}
                              >
                                +
                              </button>
                            </div>
                            <button
                              type="button"
                              className="admin-seller-metrics-toggle"
                              disabled={priceSavingCurrent}
                              onClick={() => setSellerDetailsModalSlug(item.slug)}
                            >
                              Detalhes
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            </section>
          )}

          {authRole === "seller" &&
            activePage === "seller_products" &&
            sellerDetailsModalSlug &&
            (() => {
              const template = sellerTemplates.find((item) => item.slug === sellerDetailsModalSlug);
              if (!template) {
                return null;
              }

              const quantity = parsePositiveInteger(
                sellerTemplateQuantities[template.slug] ?? "1",
                1,
              );
              const baseFee = Number(
                sellerOwnPayoutConfig?.base_fee_brl ?? SELLER_DEFAULT_BASE_FEE_BRL,
              );
              const sellerRule = resolveSellerRuleForTemplate(template, sellerOwnPayoutConfig);
              const ruleLabel = formatSellerCommissionLabel(sellerRule);
              const priceInput =
                sellerTemplatePrices[template.slug] ?? formatBrlCurrencyFromNumber(template.price_brl);
              const parsedSellerPrice = resolveSellerTemplatePrice(template.slug);
              const unitPrice = Number.isFinite(parsedSellerPrice) && parsedSellerPrice > 0
                ? parsedSellerPrice
                : template.price_brl;
              const projection = estimatePayoutExample({
                unitPrice,
                quantity,
                baseFee,
                rule: sellerRule,
              });
              const scenarioQuantities = [...new Set([1, 5, 10, quantity])]
                .filter((value) => value > 0)
                .sort((left, right) => left - right);

              return (
                <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
                  <div className="admin-modal admin-seller-details-modal">
                    <div className="admin-modal-head">
                      <h3>{template.name}</h3>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setSellerDetailsModalSlug(null)}
                      >
                        Fechar
                      </button>
                    </div>

                    <p>Preço base do admin: <strong>{formatCurrency(template.price_brl)}</strong></p>

                    <label className="admin-field admin-field-full">
                      <span>Seu preço de venda (R20 20 12 61 79 80 81 701 33 98 100 204 250 395 398 399 400</span>
                      <input
                        className="admin-seller-price-input"
                        value={priceInput}
                        inputMode="decimal"
                        onChange={(event) =>
                          setSellerTemplatePrices((current) => ({
                            ...current,
                            [template.slug]: formatBrlCurrencyInputMask(event.target.value),
                          }))
                        }
                        placeholder="R$ 0,00"
                      />
                    </label>

                    <div className="admin-seller-metrics-panel">
                      <p>
                        Taxa fixa de preparação por item: <strong>{formatCurrency(baseFee)}</strong>
                      </p>
                      <p>
                        Imposto sobre venda:{" "}
                        <strong>{projection.taxPercent.toFixed(2).replace(".", ",")}%</strong>
                      </p>
                      <p>
                        Regra de lucro/repasse:{" "}
                        <span
                          className={`admin-seller-rule-chip ${
                            sellerRule.active ? "is-active" : "is-inactive"
                          }`}
                        >
                          {ruleLabel}
                        </span>
                      </p>
                      <div className="admin-seller-metric-focus">
                        <span>Resumo ({quantity} un)</span>
                        <strong>Venda bruta: {formatCurrency(projection.lineTotal)}</strong>
                        <strong>Taxa fixa: {formatCurrency(projection.feeTotal)}</strong>
                        <strong>Imposto: {formatCurrency(projection.taxTotal)}</strong>
                        <strong>Comissão Legacy: {formatCurrency(projection.commissionTotal)}</strong>
                        <strong>Recebe seller: {formatCurrency(projection.sellerTotal)}</strong>
                        <strong>Recebe Legacy: {formatCurrency(projection.adminTotal)}</strong>
                      </div>
                      <div className="admin-seller-metrics-table">
                        {scenarioQuantities.map((scenarioQty) => {
                          const scenario = estimatePayoutExample({
                            unitPrice,
                            quantity: scenarioQty,
                            baseFee,
                            rule: sellerRule,
                          });
                          return (
                            <div key={`${template.slug}-${scenarioQty}`} className="admin-seller-metric-row">
                              <span>{scenarioQty} un</span>
                              <strong>Seller {formatCurrency(scenario.sellerTotal)}</strong>
                              <strong>Legacy {formatCurrency(scenario.adminTotal)}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="admin-modal-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setSellerDetailsModalSlug(null)}
                      >
                        Fechar
                      </button>
                      <button
                        type="button"
                        disabled={sellerPriceSavingSlug !== null}
                        onClick={() => {
                          void saveSellerTemplatePrice(template.slug);
                        }}
                      >
                        {sellerPriceSavingSlug === template.slug ? "Salvando..." : "Salvar preço"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

          {authRole === "admin" && (activePage === "usual_edit" || activePage === "catalog_create") && (
            <section
              className={`admin-layout admin-layout-usual ${
                activePage === "catalog_create"
                  ? "admin-layout-catalog-create"
                  : "admin-layout-catalog-list"
              }`}
            >
              <aside className="admin-assistant-panel">
                <h3>Assistente de catálogo IA</h3>
                <p>
                  Modelo econômico: <strong>gpt-5-nano</strong>. Use os botões para revisar inconsistências.
                </p>

                <label className="admin-field">
                  <span>Escopo</span>
                  <select
                    value={assistantScope}
                    onChange={(event) =>
                      setAssistantScope(event.target.value === "all" ? "all" : "selected")
                    }
                  >
                    <option value="selected">Somente selecionadas</option>
                    <option value="all">Catálogo inteiro</option>
                  </select>
                </label>

                <div className="admin-assistant-selection">
                  <p>
                    Selecionadas: <strong>{selectedProductSlugs.length}</strong>
                    {visibleProducts.length > 0 && <> ({selectedVisibleCount} visíveis)</>}
                  </p>
                  <div className="admin-assistant-selection-actions">
                    <button type="button" className="admin-soft-button" onClick={selectAllVisibleProducts}>
                      Selecionar visíveis
                    </button>
                    <button type="button" className="admin-soft-button" onClick={clearSelectedProducts}>
                      Limpar seleção
                    </button>
                  </div>
                </div>

                <div className="admin-assistant-actions">
                  {ASSISTANT_ACTION_BUTTONS.map((item) => (
                    <button
                      key={item.action}
                      type="button"
                      className="admin-assistant-action-button"
                      disabled={assistantLoading}
                      onClick={() => {
                        void runAssistantAction(item.action, Boolean(item.applyDirectly));
                      }}
                    >
                      {assistantLoading ? "Processando..." : item.label}
                    </button>
                  ))}
                </div>

                <ul className="admin-assistant-hints">
                  {ASSISTANT_ACTION_BUTTONS.map((item) => (
                    <li key={`${item.action}-hint`}>{item.description}</li>
                  ))}
                </ul>

                {assistantError && <p className="admin-state error">{assistantError}</p>}

                {assistantResult && (
                  <div className="admin-assistant-result">
                    <p>
                      <strong>Escaneados:</strong> {assistantResult.scanned_products}
                    </p>
                    <p>
                      <strong>Achados:</strong> {assistantResult.findings.length}
                    </p>
                    <p>
                      <strong>Atualizados:</strong> {assistantResult.updated_count}
                    </p>
                    {assistantResult.model && (
                      <p>
                        <strong>Modelo:</strong> {assistantResult.model}
                      </p>
                    )}
                    {assistantResult.ai_summary && <p>{assistantResult.ai_summary}</p>}
                    <div className="admin-assistant-bulk-actions">
                      <button
                        type="button"
                        disabled={assistantFixableFindings.length === 0 || assistantFixingAll}
                        onClick={() => {
                          void applyAllAssistantFixes();
                        }}
                      >
                        {assistantFixingAll
                          ? "Corrigindo tudo..."
                          : `Corrigir todos com sugestão (${assistantFixableFindings.length})`}
                      </button>
                    </div>
                    {assistantResult.warnings.length > 0 && (
                      <div className="admin-assistant-warnings">
                        {assistantResult.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    )}
                    {assistantResult.findings.length > 0 && (
                      <div className="admin-assistant-findings">
                        {assistantResult.findings.slice(0, 16).map((finding) => (
                          <article
                            key={`${finding.slug}-${finding.title}`}
                            className={`finding-${finding.severity}`}
                          >
                            <header>
                              <strong>{finding.slug}</strong>
                              <span className={`finding-severity finding-severity-${finding.severity}`}>
                                {finding.severity}
                              </span>
                            </header>
                            <h4>{finding.title}</h4>
                            <p>{finding.message}</p>
                            <div className="finding-prices">
                              <span>
                                Atual:{" "}
                                {typeof finding.current_price_brl === "number"
                                  ? formatCurrency(finding.current_price_brl)
                                  : "-"}
                              </span>
                              <span>
                                Sugerido:{" "}
                                {typeof finding.suggested_price_brl === "number"
                                  ? formatCurrency(finding.suggested_price_brl)
                                  : "-"}
                              </span>
                            </div>
                            {finding.tags.length > 0 && (
                              <div className="finding-tags">
                                {finding.tags.slice(0, 4).map((tag) => (
                                  <span key={`${finding.slug}-${tag}`}>{tag}</span>
                                ))}
                              </div>
                            )}
                            <div className="finding-actions">
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => {
                                  const match = products.find((item) => item.slug === finding.slug);
                                  if (match) {
                                    beginEdit(match);
                                  }
                                }}
                              >
                                Revisar
                              </button>
                              <button
                                type="button"
                                disabled={
                                  !assistantFixableSlugSet.has(finding.slug) ||
                                  assistantFixingSlug === finding.slug ||
                                  assistantFixingAll
                                }
                                onClick={() => {
                                  void applyAssistantFix(finding);
                                }}
                              >
                                {assistantFixingSlug === finding.slug ? "Corrigindo..." : "Corrigir este"}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </aside>

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

              <div className="admin-form-mode">
                <div>
                  <span className={`admin-form-mode-tag mode-${editorMode}`}>
                    {editorMode === "edit" ? "Modo edição" : "Modo criação"}
                  </span>
                  <h2>
                    {editorMode === "edit"
                      ? `Editando ${editingSlug ?? "item selecionado"}`
                      : activeTab === "cards"
                        ? "Criar novo card"
                        : "Criar novo produto"}
                  </h2>
                </div>
                <div className="admin-form-mode-actions">
                  <button type="button" className="ghost" onClick={startCreateMode}>
                    Novo cadastro
                  </button>
                  <button
                    type="button"
                    className="admin-soft-button"
                    onClick={() => {
                      setLotImportModalOpen(true);
                    }}
                  >
                    Importar JSON
                  </button>
                </div>
              </div>

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
                            {item.pokemon_types && item.pokemon_types.length > 0 && (
                              <p>Tipos: {item.pokemon_types.join(" / ")}</p>
                            )}
                            {item.suggested_finish && <p>Acabamento: {item.suggested_finish}</p>}
                            {(item.suggested_price_brl != null || item.suggested_price_usd != null) && (
                              <p className="lookup-price-hint">
                                Preço sugerido:{" "}
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
                    disabled={editorMode === "edit"}
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
                    onChange={(event) => handleDraftProductTypeChange(event.target.value)}
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
                  <select
                    value={selectedCategoryOption ?? "__new__"}
                    onChange={(event) => handleDraftCategorySelect(event.target.value)}
                  >
                    {draftCategoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                    <option value="__new__">+ Nova categoria</option>
                  </select>
                </label>
                {!selectedCategoryOption && (
                  <label className="admin-field">
                    <span>Nova categoria</span>
                    <input
                      value={draft.category}
                      placeholder="ex: Sleeve"
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, category: event.target.value }))
                      }
                    />
                  </label>
                )}

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
                        <p>Cotação USD/BRL: {suggestedPrice.usdToBrlRate.toFixed(4)}</p>
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
                          Aplicar preço sugerido
                        </button>
                      )}
                    </div>
                  )}
                </label>

                <label className="admin-field admin-field-full">
                  <span>Foto principal (URL ou upload)</span>
                  <input
                    value={draft.image_url}
                    placeholder="image_url"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, image_url: event.target.value }))
                    }
                  />
                  <div className="admin-image-upload-actions">
                    <button
                      type="button"
                      className="admin-soft-button"
                      disabled={mainImageUploadBusy}
                      onClick={() => {
                        mainImageInlineInputRef.current?.click();
                      }}
                    >
                      {mainImageUploadBusy ? "Enviando..." : "Upload da foto principal"}
                    </button>
                    <small>
                      Envia para Storage em{" "}
                      <strong>{resolveAdminImageUploadScope() === "cards" ? "cards" : "products"}</strong>.
                    </small>
                    <input
                      ref={mainImageInlineInputRef}
                      className="admin-hidden-file-input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        void handleMainImageUpload(event);
                      }}
                    />
                  </div>
                </label>

                <label className="admin-field admin-field-full">
                  <span>Fotos adicionais (URL ou upload)</span>
                  <textarea
                    value={draft.image_gallery}
                    placeholder="https://.../foto2.png&#10;https://.../foto3.png"
                    rows={3}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, image_gallery: event.target.value }))
                    }
                  />
                  <div className="admin-image-upload-actions">
                    <button
                      type="button"
                      className="admin-soft-button"
                      disabled={galleryImageUploadBusy}
                      onClick={() => {
                        galleryImageInlineInputRef.current?.click();
                      }}
                    >
                      {galleryImageUploadBusy ? "Enviando..." : "Upload de fotos adicionais"}
                    </button>
                    <small>Selecione uma ou mais imagens.</small>
                    <input
                      ref={galleryImageInlineInputRef}
                      className="admin-hidden-file-input"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => {
                        void handleGalleryImageUpload(event);
                      }}
                    />
                  </div>
                </label>

                <label className="admin-checkbox admin-field-full">
                  <input
                    type="checkbox"
                    checked={draft.language_tag_enabled}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        language_tag_enabled: event.target.checked,
                      }))
                    }
                  />
                  <span>Exibir tag de país/idioma na loja</span>
                </label>
                {draft.language_tag_enabled && (
                  <label className="admin-field">
                    <span>Tag de país/idioma</span>
                    <input
                      list="language-options"
                      value={draft.language}
                      placeholder="PT, EN, JP..."
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          language: event.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                )}

                {activeTab === "cards" && (
                  <>
                    <label className="admin-field">
                      <span>Número da carta</span>
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
                      <span>Código do set</span>
                      <input
                        value={draft.set_code}
                        placeholder="TEF"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, set_code: event.target.value.toUpperCase() }))
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
                      <span>Série</span>
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
                      <span>Condição</span>
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
                      <span>Geração</span>
                      <input
                        list="generation-options"
                        value={draft.pokemon_generation}
                        placeholder="generation-ix"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, pokemon_generation: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field admin-field-full">
                      <span>Tipos Pokémon (vírgula)</span>
                      <input
                        value={draft.pokemon_types}
                        placeholder="Water, Lightning"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, pokemon_types: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field admin-field-full">
                      <span>Descrição da carta</span>
                      <textarea
                        rows={3}
                        value={draft.description}
                        placeholder="Descrição pública para aparecer na loja"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, description: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field admin-field-full">
                      <span>Observações internas</span>
                      <textarea
                        rows={3}
                        value={draft.observations}
                        placeholder="Notas internas da carta/lote (opcional)"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, observations: event.target.value }))
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

                    <label className="admin-field admin-field-full">
                      <span>Descrição do produto</span>
                      <textarea
                        rows={3}
                        value={draft.description}
                        placeholder="Descrição pública para aparecer na loja"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, description: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field admin-field-full">
                      <span>Observações internas</span>
                      <textarea
                        rows={3}
                        value={draft.observations}
                        placeholder="Notas internas do produto/lote (opcional)"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, observations: event.target.value }))
                        }
                      />
                    </label>
                  </>
                )}

                <label className="admin-field admin-field-full">
                  <span>Tags de temporada (vírgula)</span>
                  <input
                    value={draft.season_tags}
                    placeholder="megaevolução, evoluções-prismáticas"
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
                  checked={draft.seller_template_enabled}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      seller_template_enabled: event.target.checked,
                    }))
                  }
                />
                disponível para seller vender
              </label>

              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={draft.is_special}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, is_special: event.target.checked }))
                  }
                />
                produto em alta
              </label>

              <div className="admin-form-actions">
                <button type="submit">{editorMode === "edit" ? "Salvar alterações" : "Criar item"}</button>
                <button type="button" className="ghost" onClick={resetForm}>
                  Limpar
                </button>
              </div>

              <datalist id="set-name-options">
                {setNameOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>

              <datalist id="set-series-options">
                {setSériesOptions.map((item) => (
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
              {activePage === "usual_edit" && (
                <div className="admin-tabs admin-list-tabs" role="tablist" aria-label="Filtro da listagem">
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
              )}
              <header className="admin-products-header">
                <div>
                  <h2>
                    {activeTab === "cards" ? "Cards" : "Produtos"} ({visibleProducts.length}/
                    {tabProducts.length})
                  </h2>
                  <p>
                    Listagem por categoria em grade modular ({catalogGridColumns}{" "}
                    {catalogGridColumns === 1 ? "coluna" : "colunas"}).
                  </p>
                </div>
                <div className="admin-products-controls">
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
                      <option value="all">Todas as categorias</option>
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-products-grid-picker" role="group" aria-label="Colunas da grade">
                    <span>Grade</span>
                    <div className="admin-products-grid-picker-options">
                      {CATALOG_GRID_COLUMN_OPTIONS.map((columnCount) => (
                        <button
                          key={`grid-${columnCount}`}
                          type="button"
                          className={
                            columnCount === catalogGridColumns
                              ? "admin-grid-option is-active"
                              : "admin-grid-option"
                          }
                          onClick={() => selectCatalogGridColumns(columnCount)}
                        >
                          {columnCount}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </header>

              <div className="admin-selection-summary">
                <p>
                  Selecionados para IA: <strong>{selectedProductSlugs.length}</strong>
                </p>
                <div className="admin-selection-summary-actions">
                  <button type="button" className="admin-soft-button" onClick={selectAllVisibleProducts}>
                    Selecionar visíveis
                  </button>
                  <button type="button" className="admin-soft-button" onClick={clearSelectedProducts}>
                    Limpar
                  </button>
                </div>
              </div>

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
                    <div
                      className={`admin-product-grid ${
                        activeTab === "cards" ? "admin-product-grid-cards" : "admin-product-grid-products"
                      } admin-product-grid-custom`}
                      style={catalogGridStyle}
                    >
                      {group.items.map((product) => (
                        <article
                          key={product.slug}
                          className={`admin-product-card ${
                            selectedSlugSet.has(product.slug) ? "is-selected" : ""
                          } ${editorMode === "edit" && editingSlug === product.slug ? "is-editing" : ""}`}
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            const target = event.target as HTMLElement;
                            if (target.closest("button,input,label,select,textarea")) {
                              return;
                            }
                            beginEdit(product);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") {
                              return;
                            }
                            event.preventDefault();
                            beginEdit(product);
                          }}
                        >
                          <div
                            className={`admin-product-media ${
                              isCardType(product.product_type) ? "admin-product-media-fit" : ""
                            }`}
                          >
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
                            <label className="admin-select-toggle">
                              <input
                                type="checkbox"
                                checked={selectedSlugSet.has(product.slug)}
                                onChange={() => toggleProductSelection(product.slug)}
                              />
                              Selecionar
                            </label>
                            <strong>{product.name}</strong>
                            <p>Lote: {product.lot_id ?? "-"}</p>
                            <p>
                              {product.product_type === "accessory"
                                ? normalizeCategory(product.category)
                                : product.product_type}
                            </p>
                            <p>
                              Seller:{" "}
                              {(product.seller_template_enabled ?? true)
                                ? "habilitado"
                                : "desativado"}
                            </p>
                            {isCardType(product.product_type) ? (
                              <>
                                <p>
                                  {product.card_number ?? "sem número"}
                                  {product.set_name ? ` - ${product.set_name}` : ""}
                                  {product.release_year ? ` - ${product.release_year}` : ""}
                                </p>
                                {product.finish && <p>{product.finish}</p>}
                                {(product.pokemon_types?.length ?? 0) > 0 && (
                                  <p>Tipos: {product.pokemon_types?.join(" / ")}</p>
                                )}
                                <p>
                                  {(product.regulation_mark ?? "-").toUpperCase()} -{" "}
                                  {(product.set_code ?? "---").toUpperCase()}
                                  {product.language ? ` ${product.language.toUpperCase()}` : ""}
                                </p>
                                {product.description && <p>Desc: {product.description}</p>}
                                {product.observations && <p>Obs: {product.observations}</p>}
                              </>
                            ) : (
                              <p>boosters: {product.booster_pack_count ?? 0}</p>
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
                              onClick={() => requestRemoveProduct(product)}
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
          )}
        </>
      )}
    </main>
  );
}

export default App;
