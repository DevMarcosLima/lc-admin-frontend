import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  createAdminProduct,
  deleteAdminProduct,
  fetchAdminAnalyticsSummary,
  fetchAdminProducts,
  updateAdminProduct,
} from "./services/adminApi";
import type { AnalyticsSummaryItem, StoreProduct } from "./types/store";

const TOKEN_STORAGE_KEY = "legacy_cards_admin_token";

type ProductDraft = {
  slug: string;
  name: string;
  product_type: string;
  category: string;
  stock: string;
  price_brl: string;
  image_url: string;
  set_name: string;
  rarity: string;
  condition: string;
  accessory_kind: string;
  season_tags: string;
  is_special: boolean;
};

const EMPTY_DRAFT: ProductDraft = {
  slug: "",
  name: "",
  product_type: "single_card",
  category: "Cartas avulsas",
  stock: "1",
  price_brl: "0",
  image_url: "",
  set_name: "",
  rarity: "",
  condition: "",
  accessory_kind: "",
  season_tags: "",
  is_special: false,
};

function toDraft(product: StoreProduct): ProductDraft {
  return {
    slug: product.slug,
    name: product.name,
    product_type: product.product_type,
    category: product.category,
    stock: String(product.stock),
    price_brl: String(product.price_brl),
    image_url: product.image_url,
    set_name: product.set_name ?? "",
    rarity: product.rarity ?? "",
    condition: product.condition ?? "",
    accessory_kind: product.accessory_kind ?? "",
    season_tags: product.season_tags.join(", "),
    is_special: product.is_special,
  };
}

function toProduct(draft: ProductDraft): StoreProduct {
  return {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    product_type: draft.product_type.trim(),
    category: draft.category.trim(),
    stock: Number(draft.stock || "0"),
    price_brl: Number(draft.price_brl || "0"),
    image_url: draft.image_url.trim(),
    set_name: draft.set_name.trim() || null,
    rarity: draft.rarity.trim() || null,
    condition: draft.condition.trim() || null,
    accessory_kind: draft.accessory_kind.trim() || null,
    season_tags: draft.season_tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    is_special: draft.is_special,
  };
}

function App() {
  const [tokenInput, setTokenInput] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryItem[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);

  const connected = adminToken.trim().length > 0;

  useEffect(() => {
    if (!connected) {
      setProducts([]);
      setAnalytics([]);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([fetchAdminProducts(adminToken), fetchAdminAnalyticsSummary(adminToken)])
      .then(([productsResponse, analyticsResponse]) => {
        setProducts(productsResponse);
        setAnalytics(analyticsResponse.items);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Falha ao carregar painel admin");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [adminToken, connected]);

  const visibleProducts = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return products;
    }

    return products.filter((product) => {
      return (
        product.slug.toLowerCase().includes(trimmed) ||
        product.name.toLowerCase().includes(trimmed) ||
        product.product_type.toLowerCase().includes(trimmed)
      );
    });
  }, [products, query]);

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
    setDraft(EMPTY_DRAFT);
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

    if (Number.isNaN(payload.stock) || Number.isNaN(payload.price_brl)) {
      setError("Stock e preco precisam ser numeros validos.");
      return;
    }

    try {
      const saved = editingSlug
        ? await updateAdminProduct(adminToken, editingSlug, payload)
        : await createAdminProduct(adminToken, payload);

      setProducts((current) => {
        const without = current.filter((item) => item.slug !== editingSlug && item.slug !== saved.slug);
        return [...without, saved].sort((a, b) => a.slug.localeCompare(b.slug));
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

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <h1>Painel Admin Legacy Cards</h1>
          <p>CRUD de produtos no Firestore + resumo de consultas para Power BI</p>
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
              <h2>{editingSlug ? `Editar ${editingSlug}` : "Novo produto"}</h2>

              <input
                value={draft.slug}
                placeholder="slug"
                onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
                disabled={Boolean(editingSlug)}
              />
              <input
                value={draft.name}
                placeholder="nome"
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
              <input
                value={draft.product_type}
                placeholder="product_type"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, product_type: event.target.value }))
                }
              />
              <input
                value={draft.category}
                placeholder="categoria"
                onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              />
              <input
                value={draft.stock}
                placeholder="stock"
                onChange={(event) => setDraft((current) => ({ ...current, stock: event.target.value }))}
              />
              <input
                value={draft.price_brl}
                placeholder="price_brl"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, price_brl: event.target.value }))
                }
              />
              <input
                value={draft.image_url}
                placeholder="image_url"
                onChange={(event) => setDraft((current) => ({ ...current, image_url: event.target.value }))}
              />
              <input
                value={draft.season_tags}
                placeholder="season_tags (separadas por virgula)"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, season_tags: event.target.value }))
                }
              />
              <input
                value={draft.set_name}
                placeholder="set_name"
                onChange={(event) => setDraft((current) => ({ ...current, set_name: event.target.value }))}
              />
              <input
                value={draft.rarity}
                placeholder="rarity"
                onChange={(event) => setDraft((current) => ({ ...current, rarity: event.target.value }))}
              />
              <input
                value={draft.condition}
                placeholder="condition"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, condition: event.target.value }))
                }
              />
              <input
                value={draft.accessory_kind}
                placeholder="accessory_kind"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, accessory_kind: event.target.value }))
                }
              />

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
            </form>

            <section className="admin-products">
              <header>
                <h2>Produtos ({products.length})</h2>
                <input
                  value={query}
                  placeholder="buscar por slug/nome/tipo"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </header>

              {loading && <p className="admin-state">Carregando...</p>}

              <div className="admin-table">
                {visibleProducts.map((product) => (
                  <article key={product.slug} className="admin-row">
                    <div>
                      <strong>{product.slug}</strong>
                      <p>
                        {product.name} • {product.product_type}
                      </p>
                    </div>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSlug(product.slug);
                          setDraft(toDraft(product));
                        }}
                      >
                        Editar
                      </button>
                      <button type="button" className="danger" onClick={() => removeProduct(product.slug)}>
                        Excluir
                      </button>
                    </div>
                  </article>
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
