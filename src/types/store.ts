export type StoreProduct = {
  slug: string;
  name: string;
  product_type: string;
  set_name?: string | null;
  set_series?: string | null;
  rarity?: string | null;
  condition?: string | null;
  card_number?: string | null;
  regulation_mark?: string | null;
  set_code?: string | null;
  language?: string | null;
  release_year?: number | null;
  pokemon_generation?: string | null;
  category: string;
  season_tags: string[];
  accessory_kind?: string | null;
  booster_pack_count?: number | null;
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

export type CardLookupItem = {
  card_id: string;
  name: string;
  number: string;
  local_number?: string | null;
  set_id: string;
  set_name: string;
  set_code?: string | null;
  set_series?: string | null;
  printed_total?: number | null;
  release_date?: string | null;
  release_year?: number | null;
  rarity?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  pokemon_generation?: string | null;
};

export type CardLookupResponse = {
  source: string;
  query: string;
  items: CardLookupItem[];
};

export type CardMetadataOptionsResponse = {
  source: string;
  rarity_options: string[];
  set_name_options: string[];
  set_series_options: string[];
  condition_options: string[];
  year_options: number[];
  generation_options: string[];
};
