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

function adminHeaders(token: string): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Admin-Token": token,
  };
}

export async function fetchAdminProducts(token: string): Promise<StoreProduct[]> {
  const response = await fetch(`${API_URL}/api/v1/admin/products`, {
    headers: adminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar produtos admin (${response.status})`);
  }

  const payload = (await response.json()) as StoreProductListResponse;
  return payload.items;
}

export async function createAdminProduct(token: string, product: StoreProduct): Promise<StoreProduct> {
  const response = await fetch(`${API_URL}/api/v1/admin/products`, {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify(product),
  });

  if (!response.ok) {
    throw new Error(`Falha ao criar produto (${response.status})`);
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
    headers: adminHeaders(token),
    body: JSON.stringify(product),
  });

  if (!response.ok) {
    throw new Error(`Falha ao atualizar produto (${response.status})`);
  }

  return (await response.json()) as StoreProduct;
}

export async function deleteAdminProduct(token: string, slug: string): Promise<StoreDeleteResponse> {
  const response = await fetch(`${API_URL}/api/v1/admin/products/${slug}`, {
    method: "DELETE",
    headers: adminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Falha ao remover produto (${response.status})`);
  }

  return (await response.json()) as StoreDeleteResponse;
}

export async function fetchAdminAnalyticsSummary(
  token: string,
  days = 30,
): Promise<AnalyticsSummaryResponse> {
  const response = await fetch(`${API_URL}/api/v1/admin/analytics/summary?days=${days}`, {
    headers: adminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar analytics (${response.status})`);
  }

  return (await response.json()) as AnalyticsSummaryResponse;
}

export async function fetchCardMetadataOptions(token: string): Promise<CardMetadataOptionsResponse> {
  const response = await fetch(`${API_URL}/api/v1/admin/cards/options`, {
    headers: adminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar opcoes de cartas (${response.status})`);
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
    headers: adminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar carta (${response.status})`);
  }

  return (await response.json()) as CardLookupResponse;
}

export async function startLotImport(
  token: string,
  payload: LotImportStartRequest,
): Promise<LotImportStartResponse> {
  const response = await fetch(`${API_URL}/api/v1/admin/lots/import/start`, {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Falha ao iniciar importacao de lote (${response.status})`);
  }

  return (await response.json()) as LotImportStartResponse;
}

export async function fetchLotImportStatus(
  token: string,
  jobId: string,
): Promise<LotImportJobResponse> {
  const response = await fetch(`${API_URL}/api/v1/admin/lots/import/${jobId}`, {
    headers: adminHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar importacao de lote (${response.status})`);
  }

  return (await response.json()) as LotImportJobResponse;
}
