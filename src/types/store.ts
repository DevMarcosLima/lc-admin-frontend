export type StoreProduct = {
  slug: string;
  name: string;
  product_type: string;
  set_name?: string | null;
  set_series?: string | null;
  rarity?: string | null;
  finish?: string | null;
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
  image_gallery: string[];
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
  regulation_mark?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  suggested_price_usd?: number | null;
  suggested_price_brl?: number | null;
  suggested_price_currency?: string | null;
  suggested_price_source?: string | null;
  suggested_finish?: string | null;
  usd_brl_rate?: number | null;
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
  finish_options: string[];
  condition_options: string[];
  year_options: number[];
  generation_options: string[];
};

export type LotImportStartRequest = {
  lot_payload: Record<string, unknown>;
  default_condition: string;
  default_finish: string;
  default_category: string;
  infer_regulation_mark_with_openai: boolean;
};

export type LotImportStartResponse = {
  job_id: string;
  status: string;
  total_cards: number;
};

export type LotImportEntryPreview = {
  index: number;
  status: string;
  action?: string | null;
  message?: string | null;
  slug: string;
  name: string;
  card_number: string;
  category: string;
  language: string;
  quantity: number;
  condition?: string | null;
  finish?: string | null;
  set_name?: string | null;
  set_code?: string | null;
  rarity?: string | null;
  regulation_mark?: string | null;
  release_year?: number | null;
  pokemon_generation?: string | null;
  image_url?: string | null;
  price_brl: number;
};

export type LotImportJobResponse = {
  job_id: string;
  status: string;
  lot_id?: string | null;
  lot_name?: string | null;
  started_at: string;
  finished_at?: string | null;
  total_cards: number;
  prepared_cards: number;
  processed_cards: number;
  created_count: number;
  updated_count: number;
  error_count: number;
  last_error?: string | null;
  entries: LotImportEntryPreview[];
};
