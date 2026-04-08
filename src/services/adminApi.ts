import type {
  AnalyticsSummaryResponse,
  CardLookupResponse,
  CardMetadataOptionsResponse,
  LotImportJobResponse,
  LotImportStartRequest,
  LotImportStartResponse,
  StoreDeleteResponse,
  StoreProduct,
  StoreProductListResponse,
} from "../types/store";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

export type AdminLoginResponse = {
  requires_2fa: boolean;
  token_type: string;
  access_token: string | null;
  challenge_token: string | null;
  expires_in_seconds: number;
};

export type AdminMeResponse = {
  email: string;
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
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
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
    // Ignora erro de parse e usa mensagem padrao.
  }

  const message = detail ?? `${fallbackMessage} (${response.status})`;
  throw new AdminApiError(message, response.status);
}

export async function loginAdmin(email: string, password: string): Promise<AdminLoginResponse> {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
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
  const response = await fetch(`${API_URL}/api/v1/auth/verify-2fa`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ challenge_token: challengeToken, code }),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao validar 2FA");
  }

  return (await response.json()) as AdminLoginResponse;
}

export async function fetchAdminMe(token: string): Promise<AdminMeResponse> {
  const response = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Sessao invalida");
  }

  return (await response.json()) as AdminMeResponse;
}

export async function fetchAdminProducts(token: string): Promise<StoreProduct[]> {
  const response = await fetch(`${API_URL}/api/v1/admin/products`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar produtos admin");
  }

  const payload = (await response.json()) as StoreProductListResponse;
  return payload.items;
}

export async function createAdminProduct(token: string, product: StoreProduct): Promise<StoreProduct> {
  const response = await fetch(`${API_URL}/api/v1/admin/products`, {
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
  const response = await fetch(`${API_URL}/api/v1/admin/products/${slug}`, {
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
  const response = await fetch(`${API_URL}/api/v1/admin/products/${slug}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao remover produto");
  }

  return (await response.json()) as StoreDeleteResponse;
}

export async function fetchAdminAnalyticsSummary(
  token: string,
  days = 30,
): Promise<AnalyticsSummaryResponse> {
  const response = await fetch(`${API_URL}/api/v1/admin/analytics/summary?days=${days}`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar analytics");
  }

  return (await response.json()) as AnalyticsSummaryResponse;
}

export async function fetchCardMetadataOptions(token: string): Promise<CardMetadataOptionsResponse> {
  const response = await fetch(`${API_URL}/api/v1/admin/cards/options`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao carregar opcoes de cartas");
  }

  return (await response.json()) as CardMetadataOptionsResponse;
}

export async function fetchCardLookup(
  token: string,
  query: string,
  limit = 12,
): Promise<CardLookupResponse> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const response = await fetch(`${API_URL}/api/v1/admin/cards/lookup?${params.toString()}`, {
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
  const response = await fetch(`${API_URL}/api/v1/admin/lots/import/start`, {
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
  const response = await fetch(`${API_URL}/api/v1/admin/lots/import/${jobId}`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    await buildApiError(response, "Falha ao consultar importacao de lote");
  }

  return (await response.json()) as LotImportJobResponse;
}

