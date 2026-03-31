export type StoreProduct = {
  slug: string;
  name: string;
  product_type: string;
  set_name?: string | null;
  rarity?: string | null;
  condition?: string | null;
  category: string;
  season_tags: string[];
  accessory_kind?: string | null;
  stock: number;
  price_brl: number;
  image_url: string;
  is_special: boolean;
};

export type StoreProductListResponse = {
  items: StoreProduct[];
};

export type StoreDeleteResponse = {
  slug: string;
  deleted: boolean;
};

export type AnalyticsSummaryItem = {
  endpoint: string;
  count: number;
};

export type AnalyticsSummaryResponse = {
  source: string;
  period_days: number;
  items: AnalyticsSummaryItem[];
};
