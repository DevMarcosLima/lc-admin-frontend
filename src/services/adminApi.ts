import type {
  AdminBrandingConfigResponse,
  AdminImageUploadResponse,
  AdminImageUploadScope,
  AdminImageUploadSlot,
  AdminCategoryConfigResponse,
  AdminMenuConfigResponse,
  AnalyticsSummaryResponse,
  CatalogAssistantResponse,
  CatalogAssistantRunRequest,
  CardLookupResponse,
  CardMetadataOptionsResponse,
  LotImportJobResponse,
  LotImportStartRequest,
  LotImportStartResponse,
  SalesMetricsResponse,
  SalesOrderListResponse,
  SalesOrderProcessUpdateRequest,
  SalesOrderRecord,
  SellerAccountListResponse,
  SellerCreateRequest,
  SellerCreateResponse,
  SellerStatusUpdateRequest,
  SellerStatusUpdateResponse,
  SellerPayoutConfigResponse,
  SellerPayoutConfigUpdateRequest,
  SellerPublishProductRequest,
  SellerUpdateProductPriceRequest,
  SellerWithdrawProductRequest,
  StoreDeleteResponse,
  StoreProduct,
  StoreProductListResponse,
  WebhookEventListResponse,
} from "../types/store";
import { readRuntimeEnv } from "./runtimeConfig";

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function resolveApiUrl(): string {
  const configuredUrl = readRuntimeEnv("VITE_API_URL");
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window !== "undefined" && isLocalHost(window.location.hostname.toLowerCase())) {
    return "http://localhost:8001";
  }

  throw new Error(
    "VITE_API_URL não configurado para ambiente remoto. Defina a URL da API no build do admin frontend.",
  );
}

const API_URL = resolveApiUrl();

function resolveApiPrefix(): string {
  const configuredPrefix = readRuntimeEnv("VITE_API_PREFIX");
  const normalizedPrefix = (configuredPrefix ?? "/api/v1").trim();
  if (!normalizedPrefix) {
    return "/api/v1";
  }

  const withLeadingSlash = normalizedPrefix.startsWith("/")
    ? normalizedPrefix
    : `/${normalizedPrefix}`;

  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

const API_PREFIX = resolveApiPrefix();

function buildUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${API_PREFIX}${normalizedPath}`;
}

export type AdminLoginResponse = {
  role: "admin" | "seller" | null;
  email: string | null;
  shop_name: string | null;
  shop_slug: string | null;
  requires_2fa: boolean;
  requires_onboarding: boolean;
  token_type: string;
  access_token: string | null;
  challenge_token: string | null;
  onboarding_qr_uri: string | null;
  expires_in_seconds: number;
};

export type AdminMeResponse = {
  email: string;
  role: "admin" | "seller";
  shop_name: string | null;
  shop_slug: string | null;
  must_change_password: boolean;
  two_factor_enabled: boolean;
};

export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

function authHeaders(token: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const normalizedToken = token.trim();
  if (normalizedToken) {
    headers.Authorization = `Bearer ${normalizedToken}`;
  }
  return headers;
}

function authHeadersWithoutContentType(token: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const normalizedToken = token.trim();
  if (normalizedToken) {
    headers.Authorization = `Bearer ${normalizedToken}`;
  }
  return headers;
}

function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: "include",
  });
}

export async function logoutAdmin(): Promise<void> {
  const response = await apiFetch(buildUrl("/auth/logout"), {
    method: "POST",
    headers: jsonHeaders(),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao encerrar sessão");
  }
}

function jsonHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function buildApiError(response: Response, fallbackMessage: string): Promise<never> {
  let detail: string | null = null;
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      detail = payload.detail.trim();
    }
  } catch {
    // Ignora erro de parse e usa mensagem padrão.
  }

  const message = detail ?? `${fallbackMessage} (${response.status})`;
  throw new AdminApiError(message, response.status);
}

export async function loginAdmin(email: string, password: string): Promise<AdminLoginResponse> {
  const response = await apiFetch(buildUrl("/auth/login"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao autenticar");
  }

  return (await response.json()) as AdminLoginResponse;
}

export async function verifyAdminTwoFactor(
  challengeToken: string,
  code: string,
): Promise<AdminLoginResponse> {
  const response = await apiFetch(buildUrl("/auth/verify-2fa"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ challenge_token: challengeToken, code }),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao validar 2FA");
  }

  return (await response.json()) as AdminLoginResponse;
}

export async function completeSellerOnboarding(
  challengeToken: string,
  newPassword: string,
  code: string,
): Promise<AdminLoginResponse> {
  const response = await apiFetch(buildUrl("/auth/onboarding/complete"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ challenge_token: challengeToken, new_password: newPassword, code }),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao concluir onboarding do seller");
  }

  return (await response.json()) as AdminLoginResponse;
}

export async function fetchAdminMe(token: string): Promise<AdminMeResponse> {
  const response = await apiFetch(buildUrl("/auth/me"), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Sessão inválida");
  }

  return (await response.json()) as AdminMeResponse;
}

export async function fetchAdminProducts(token: string): Promise<StoreProduct[]> {
  const response = await apiFetch(buildUrl("/admin/products"), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar produtos admin");
  }

  const payload = (await response.json()) as StoreProductListResponse;
  return payload.items;
}

export async function createAdminProduct(token: string, product: StoreProduct): Promise<StoreProduct> {
  const response = await apiFetch(buildUrl("/admin/products"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(product),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao criar produto");
  }

  return (await response.json()) as StoreProduct;
}

export async function updateAdminProduct(
  token: string,
  slug: string,
  product: StoreProduct,
): Promise<StoreProduct> {
  const response = await apiFetch(buildUrl(`/admin/products/${slug}`), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(product),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao atualizar produto");
  }

  return (await response.json()) as StoreProduct;
}

export async function deleteAdminProduct(token: string, slug: string): Promise<StoreDeleteResponse> {
  const response = await apiFetch(buildUrl(`/admin/products/${slug}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao remover produto");
  }

  return (await response.json()) as StoreDeleteResponse;
}

export async function uploadAdminImage(
  token: string,
  file: File,
  scope: AdminImageUploadScope,
  slot: AdminImageUploadSlot,
  slug?: string,
): Promise<AdminImageUploadResponse> {
  const form = new FormData();
  form.append("scope", scope);
  form.append("slot", slot);
  if (slug && slug.trim()) {
    form.append("slug", slug.trim());
  }
  form.append("file", file);

  const response = await apiFetch(buildUrl("/admin/uploads/image"), {
    method: "POST",
    headers: authHeadersWithoutContentType(token),
    body: form,
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao enviar imagem");
  }

  return (await response.json()) as AdminImageUploadResponse;
}

export async function fetchAdminSellers(token: string): Promise<SellerAccountListResponse> {
  const response = await apiFetch(buildUrl("/admin/sellers"), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar vendedores");
  }

  return (await response.json()) as SellerAccountListResponse;
}

export async function createAdminSeller(
  token: string,
  payload: SellerCreateRequest,
): Promise<SellerCreateResponse> {
  const response = await apiFetch(buildUrl("/admin/sellers"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao criar seller");
  }

  return (await response.json()) as SellerCreateResponse;
}

export async function updateAdminSellerStatus(
  token: string,
  sellerEmail: string,
  payload: SellerStatusUpdateRequest,
): Promise<SellerStatusUpdateResponse> {
  const safeEmail = sellerEmail.trim();
  const response = await apiFetch(
    buildUrl(`/admin/sellers/${encodeURIComponent(safeEmail)}/status`),
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    await buildApiError(response, "Falha ao atualizar status do seller");
  }

  return (await response.json()) as SellerStatusUpdateResponse;
}

export async function fetchAdminSellerPayoutConfig(
  token: string,
  sellerEmail: string,
): Promise<SellerPayoutConfigResponse> {
  const safeEmail = sellerEmail.trim();
  const response = await apiFetch(
    buildUrl(`/admin/sellers/${encodeURIComponent(safeEmail)}/payout-config`),
    {
      headers: authHeaders(token),
    },
  );

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar configuração de repasse");
  }

  return (await response.json()) as SellerPayoutConfigResponse;
}

export async function updateAdminSellerPayoutConfig(
  token: string,
  sellerEmail: string,
  payload: SellerPayoutConfigUpdateRequest,
): Promise<SellerPayoutConfigResponse> {
  const safeEmail = sellerEmail.trim();
  const response = await apiFetch(
    buildUrl(`/admin/sellers/${encodeURIComponent(safeEmail)}/payout-config`),
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    await buildApiError(response, "Falha ao salvar configuração de repasse");
  }

  return (await response.json()) as SellerPayoutConfigResponse;
}

export async function fetchAdminMenuConfig(token: string): Promise<AdminMenuConfigResponse> {
  const response = await apiFetch(buildUrl("/admin/settings/menu"), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar menu");
  }

  return (await response.json()) as AdminMenuConfigResponse;
}

export async function updateAdminMenuConfig(
  token: string,
  items: AdminMenuConfigResponse["items"],
): Promise<AdminMenuConfigResponse> {
  const response = await apiFetch(buildUrl("/admin/settings/menu"), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao salvar menu");
  }

  return (await response.json()) as AdminMenuConfigResponse;
}

export async function fetchAdminCategoriesConfig(token: string): Promise<AdminCategoryConfigResponse> {
  const response = await apiFetch(buildUrl("/admin/settings/categories"), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar categorias");
  }

  return (await response.json()) as AdminCategoryConfigResponse;
}

export async function updateAdminCategoriesConfig(
  token: string,
  items: string[],
): Promise<AdminCategoryConfigResponse> {
  const response = await apiFetch(buildUrl("/admin/settings/categories"), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao salvar categorias");
  }

  return (await response.json()) as AdminCategoryConfigResponse;
}

export async function fetchAdminBrandingConfig(
  token: string,
): Promise<AdminBrandingConfigResponse> {
  const response = await apiFetch(buildUrl("/admin/settings/branding"), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar branding");
  }

  return (await response.json()) as AdminBrandingConfigResponse;
}

export async function updateAdminBrandingConfig(
  token: string,
  payload: Omit<AdminBrandingConfigResponse, "updated_at">,
): Promise<AdminBrandingConfigResponse> {
  const response = await apiFetch(buildUrl("/admin/settings/branding"), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao salvar branding");
  }

  return (await response.json()) as AdminBrandingConfigResponse;
}

export async function fetchAdminAnalyticsSummary(
  token: string,
  days = 30,
): Promise<AnalyticsSummaryResponse> {
  const response = await apiFetch(buildUrl(`/admin/analytics/summary?days=${days}`), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar analytics");
  }

  return (await response.json()) as AnalyticsSummaryResponse;
}

export type SalesOrdersFilters = {
  page?: number;
  limit?: number;
  status?: string;
  query?: string;
  storeSlug?: string;
  ownerSellerEmail?: string;
};

export async function fetchAdminSalesOrders(
  token: string,
  filters: SalesOrdersFilters = {},
): Promise<SalesOrderListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));
  if (filters.status && filters.status.trim()) {
    params.set("status", filters.status.trim());
  }
  if (filters.query && filters.query.trim()) {
    params.set("query", filters.query.trim());
  }
  if (filters.storeSlug && filters.storeSlug.trim()) {
    params.set("store_slug", filters.storeSlug.trim());
  }
  if (filters.ownerSellerEmail && filters.ownerSellerEmail.trim()) {
    params.set("owner_seller_email", filters.ownerSellerEmail.trim());
  }

  const response = await apiFetch(buildUrl(`/admin/sales/orders?${params.toString()}`), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar vendas");
  }

  return (await response.json()) as SalesOrderListResponse;
}

export async function updateAdminSalesOrderProcess(
  token: string,
  orderId: string,
  payload: SalesOrderProcessUpdateRequest,
): Promise<SalesOrderRecord> {
  const response = await apiFetch(buildUrl(`/admin/sales/orders/${encodeURIComponent(orderId)}/process`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao atualizar processamento do pedido");
  }

  return (await response.json()) as SalesOrderRecord;
}

export async function fetchAdminSalesMetrics(
  token: string,
  days = 30,
  storeSlug?: string,
  ownerSellerEmail?: string,
): Promise<SalesMetricsResponse> {
  const params = new URLSearchParams({ days: String(days) });
  if (storeSlug && storeSlug.trim()) {
    params.set("store_slug", storeSlug.trim());
  }
  if (ownerSellerEmail && ownerSellerEmail.trim()) {
    params.set("owner_seller_email", ownerSellerEmail.trim());
  }

  const response = await apiFetch(buildUrl(`/admin/sales/metrics?${params.toString()}`), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar métricas de vendas");
  }

  return (await response.json()) as SalesMetricsResponse;
}

export type WebhookEventsFilters = {
  page?: number;
  limit?: number;
  status?: string;
  paymentId?: string;
  orderId?: string;
  search?: string;
};

export async function fetchAdminWebhookEvents(
  token: string,
  filters: WebhookEventsFilters = {},
): Promise<WebhookEventListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 30));
  if (filters.status && filters.status.trim()) {
    params.set("status", filters.status.trim());
  }
  if (filters.paymentId && filters.paymentId.trim()) {
    params.set("payment_id", filters.paymentId.trim());
  }
  if (filters.orderId && filters.orderId.trim()) {
    params.set("order_id", filters.orderId.trim());
  }
  if (filters.search && filters.search.trim()) {
    params.set("search", filters.search.trim());
  }

  const response = await apiFetch(buildUrl(`/admin/webhooks/events?${params.toString()}`), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar eventos de webhook");
  }

  return (await response.json()) as WebhookEventListResponse;
}

export async function fetchCardMetadataOptions(token: string): Promise<CardMetadataOptionsResponse> {
  const response = await apiFetch(buildUrl("/admin/cards/options"), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar opções de cartas");
  }

  return (await response.json()) as CardMetadataOptionsResponse;
}

export async function fetchCardLookup(
  token: string,
  query: string,
  limit = 12,
): Promise<CardLookupResponse> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const response = await apiFetch(buildUrl(`/admin/cards/lookup?${params.toString()}`), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao buscar carta");
  }

  return (await response.json()) as CardLookupResponse;
}

export async function startLotImport(
  token: string,
  payload: LotImportStartRequest,
): Promise<LotImportStartResponse> {
  const response = await apiFetch(buildUrl("/admin/lots/import/start"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao iniciar importacao de lote");
  }

  return (await response.json()) as LotImportStartResponse;
}

export async function fetchLotImportStatus(
  token: string,
  jobId: string,
): Promise<LotImportJobResponse> {
  const response = await apiFetch(buildUrl(`/admin/lots/import/${jobId}`), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao consultar importacao de lote");
  }

  return (await response.json()) as LotImportJobResponse;
}

export async function fetchSellerTemplates(token: string): Promise<StoreProduct[]> {
  const response = await apiFetch(buildUrl("/seller/templates"), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar templates para seller");
  }

  const payload = (await response.json()) as StoreProductListResponse;
  return payload.items;
}

export async function fetchSellerProducts(token: string): Promise<StoreProduct[]> {
  const response = await apiFetch(buildUrl("/seller/products"), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar produtos do seller");
  }

  const payload = (await response.json()) as StoreProductListResponse;
  return payload.items;
}

export async function fetchSellerPayoutConfig(
  token: string,
): Promise<SellerPayoutConfigResponse> {
  const response = await apiFetch(buildUrl("/seller/payout-config"), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar configuração de repasse do seller");
  }

  return (await response.json()) as SellerPayoutConfigResponse;
}

export async function publishSellerProduct(
  token: string,
  payload: SellerPublishProductRequest,
): Promise<StoreProduct> {
  const response = await apiFetch(buildUrl("/seller/products/publish"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao publicar produto do seller");
  }

  return (await response.json()) as StoreProduct;
}

export async function withdrawSellerProductStock(
  token: string,
  payload: SellerWithdrawProductRequest,
): Promise<StoreProduct> {
  const response = await apiFetch(buildUrl("/seller/products/withdraw"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao retirar estoque do seller");
  }

  return (await response.json()) as StoreProduct;
}

export async function updateSellerProductPrice(
  token: string,
  payload: SellerUpdateProductPriceRequest,
): Promise<StoreProduct> {
  const response = await apiFetch(buildUrl("/seller/products/price"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao atualizar preço do seller");
  }

  return (await response.json()) as StoreProduct;
}

export async function fetchSellerSalesOrders(
  token: string,
  filters: SalesOrdersFilters = {},
): Promise<SalesOrderListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));
  if (filters.status && filters.status.trim()) {
    params.set("status", filters.status.trim());
  }
  if (filters.query && filters.query.trim()) {
    params.set("query", filters.query.trim());
  }

  const response = await apiFetch(buildUrl(`/seller/sales/orders?${params.toString()}`), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar vendas do seller");
  }

  return (await response.json()) as SalesOrderListResponse;
}

export async function updateSellerSalesOrderProcess(
  token: string,
  orderId: string,
  payload: SalesOrderProcessUpdateRequest,
): Promise<SalesOrderRecord> {
  const response = await apiFetch(buildUrl(`/seller/sales/orders/${encodeURIComponent(orderId)}/process`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao atualizar processamento do pedido");
  }

  return (await response.json()) as SalesOrderRecord;
}

export async function fetchSellerSalesMetrics(
  token: string,
  days = 30,
): Promise<SalesMetricsResponse> {
  const response = await apiFetch(buildUrl(`/seller/sales/metrics?days=${days}`), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar métricas do seller");
  }

  return (await response.json()) as SalesMetricsResponse;
}

export async function runCatalogAssistant(
  token: string,
  payload: CatalogAssistantRunRequest,
): Promise<CatalogAssistantResponse> {
  const response = await apiFetch(buildUrl("/admin/catalog/assistant/run"), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao executar assistente do catálogo");
  }

  return (await response.json()) as CatalogAssistantResponse;
}
