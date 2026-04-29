export type StoreProduct = {
  slug: string;
  name: string;
  product_type: string;
  store_name?: string;
  store_slug?: string;
  owner_type?: "admin" | "seller";
  owner_seller_email?: string | null;
  source_template_slug?: string | null;
  seller_template_enabled?: boolean;
  allow_seller_custom_image?: boolean;
  lot_id?: string | null;
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
  pokemon_types?: string[];
  description?: string | null;
  observations?: string | null;
  category: string;
  season_tags: string[];
  accessory_kind?: string | null;
  booster_pack_count?: number | null;
  shipping_profile?: string | null;
  shipping_weight_grams?: number | null;
  shipping_length_cm?: number | null;
  shipping_width_cm?: number | null;
  shipping_height_cm?: number | null;
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

export type AdminImageUploadScope = "cards" | "products" | "branding";
export type AdminImageUploadSlot =
  | "primary"
  | "gallery"
  | "hero_logo_primary"
  | "hero_logo_secondary"
  | "hero_slide";

export type AdminImageUploadResponse = {
  url: string;
  bucket: string;
  object_name: string;
  scope: AdminImageUploadScope;
  slot: AdminImageUploadSlot;
  filename: string;
  content_type: string;
  size_bytes: number;
};

export type AdminBrandingConfigResponse = {
  hero_logo_primary_url: string;
  hero_logo_secondary_url: string;
  hero_logo_primary_width: number;
  hero_logo_secondary_width: number;
  hero_slide_targets: Array<{
    slide_index: number;
    product_slug: string;
    product_name?: string | null;
  }>;
  hero_slides: Array<{
    slide_index: number;
    image_url?: string | null;
    focus_x_percent: number;
    name?: string | null;
    category?: string | null;
    product_type?: string | null;
    price_brl?: number | null;
  }>;
  updated_at?: string | null;
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

export type SalesOrderItem = {
  slug?: string | null;
  lot_slug?: string | null;
  lot_id?: string | null;
  name?: string | null;
  product_type?: string | null;
  store_name?: string | null;
  store_slug?: string | null;
  owner_type?: string | null;
  owner_seller_email?: string | null;
  quantity: number;
  unit_price_brl: number;
  total_price_brl: number;
};

export type SalesOrderShippingOptionSnapshot = {
  id: string;
  provider: string;
  carrier: string;
  service_name: string;
  service_code?: string | null;
  eta_label?: string | null;
  eta_days_min?: number | null;
  eta_days_max?: number | null;
  price_base_brl: number;
  margin_percent: number;
  margin_brl: number;
  price_final_brl: number;
  cashback_credit_brl: number;
  selected: boolean;
};

export type SalesOrderShippingSnapshot = {
  provider?: string;
  origin_cep?: string;
  destination_cep?: string;
  margin_percent?: number;
  message?: string;
  selected_option?: SalesOrderShippingOptionSnapshot | null;
  packages?: Array<{
    package_id: string;
    profile: string;
    profile_label: string;
    quantity_items: number;
    length_cm: number;
    width_cm: number;
    height_cm: number;
    weight_grams: number;
  }>;
};

export type SalesOrderRecord = {
  order_id: string;
  external_reference?: string | null;
  payment_id?: string | null;
  uid?: string | null;
  user_email?: string | null;
  status: string;
  status_detail?: string | null;
  payment_type_id?: string | null;
  payment_method_id?: string | null;
  subtotal_brl: number;
  shipping_brl: number;
  discount_brl: number;
  total_brl: number;
  total_items: number;
  coupon_code?: string | null;
  shipping_id?: string | null;
  shipping_zip_code?: string | null;
  shipping_provider?: string | null;
  shipping_carrier?: string | null;
  shipping_service_name?: string | null;
  shipping_service_code?: string | null;
  shipping_eta_label?: string | null;
  shipping_eta_days_min?: number | null;
  shipping_eta_days_max?: number | null;
  shipping_margin_percent?: number;
  shipping_margin_brl?: number;
  shipping_base_brl?: number;
  shipping_cashback_credit_brl?: number;
  shipping_packages_count?: number;
  shipping_origin_cep?: string | null;
  shipping_destination_cep?: string | null;
  shipping_snapshot?: SalesOrderShippingSnapshot | null;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  date_approved?: string | null;
  date_last_updated?: string | null;
  inventory_sync_status?: string | null;
  webhook_last_received_at?: string | null;
  webhook_last_action?: string | null;
  fulfillment_status?: string | null;
  fulfillment_status_updated_at?: string | null;
  fulfillment_queue_entered_at?: string | null;
  fulfillment_cancel_reason?: string | null;
  fulfillment_tracking_code?: string | null;
  refund_status?: string | null;
  refund_id?: string | null;
  refund_updated_at?: string | null;
  items: SalesOrderItem[];
};

export type SalesOrderProcessUpdateRequest = {
  fulfillment_status:
    | "em_separacao"
    | "em_preparacao"
    | "separado"
    | "rota_transportadora"
    | "enviado"
    | "cancelado";
  cancel_reason?: string | null;
  tracking_code?: string | null;
};

export type SalesOrderListResponse = {
  source: string;
  page: number;
  limit: number;
  total_orders: number;
  has_more: boolean;
  items: SalesOrderRecord[];
};

export type SalesStatusBreakdownItem = {
  status: string;
  count: number;
  revenue_brl: number;
};

export type SalesPaymentMethodBreakdownItem = {
  payment_method: string;
  count: number;
  revenue_brl: number;
};

export type SalesTopProductItem = {
  slug: string;
  name: string;
  quantity: number;
  revenue_brl: number;
};

export type SalesMetricsResponse = {
  source: string;
  period_days: number;
  total_orders: number;
  approved_orders: number;
  pending_orders: number;
  rejected_orders: number;
  approved_revenue_brl: number;
  total_revenue_brl: number;
  average_ticket_brl: number;
  status_breakdown: SalesStatusBreakdownItem[];
  payment_method_breakdown: SalesPaymentMethodBreakdownItem[];
  top_products: SalesTopProductItem[];
};

export type WebhookEventRecord = {
  event_id: string;
  status: string;
  event_name?: string | null;
  endpoint?: string | null;
  event_type?: string | null;
  action?: string | null;
  payment_id?: string | null;
  order_id?: string | null;
  external_reference?: string | null;
  resource_id?: string | null;
  client_ip?: string | null;
  user_agent?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type WebhookEventListResponse = {
  source: string;
  page: number;
  limit: number;
  total_events: number;
  has_more: boolean;
  items: WebhookEventRecord[];
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
  pokemon_types?: string[];
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
  lot_id?: string | null;
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
  pokemon_types?: string[];
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

export type CatalogAssistantAction =
  | "find_price_outliers"
  | "find_card_inconsistencies"
  | "refresh_market_prices";

export type CatalogAssistantRunRequest = {
  action: CatalogAssistantAction;
  slugs?: string[];
  include_non_cards?: boolean;
  auto_apply?: boolean;
};

export type CatalogAssistantFinding = {
  slug: string;
  severity: "high" | "medium" | "low";
  title: string;
  message: string;
  current_price_brl?: number | null;
  suggested_price_brl?: number | null;
  delta_percent?: number | null;
  tags: string[];
};

export type CatalogAssistantResponse = {
  action: CatalogAssistantAction;
  model?: string | null;
  selected_products: number;
  scanned_products: number;
  updated_count: number;
  findings: CatalogAssistantFinding[];
  ai_summary?: string | null;
  warnings: string[];
};

export type SellerAccountSummary = {
  email: string;
  shop_name: string;
  shop_slug: string;
  status: string;
  must_change_password: boolean;
  two_factor_enabled: boolean;
  payout_base_fee_brl: number;
  payout_rules_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
};

export type SellerAccountListResponse = {
  items: SellerAccountSummary[];
};

export type SellerCreateRequest = {
  email: string;
  shop_name: string;
};

export type SellerCreateResponse = {
  account: SellerAccountSummary;
  temporary_password: string;
};

export type SellerStatusUpdateRequest = {
  status: "active" | "inactive";
  set_inventory_standby: boolean;
  zero_inventory: boolean;
  note?: string | null;
};

export type SellerStatusUpdateResponse = {
  account: SellerAccountSummary;
  inventory_standby: boolean;
  seller_products_affected: number;
  seller_stock_removed: number;
};

export type SellerPayoutRuleConfig = {
  template_slug: string;
  template_name?: string | null;
  commission_mode: "percent" | "fixed";
  commission_percent?: number | null;
  commission_fixed_brl?: number | null;
  active: boolean;
};

export type SellerPayoutConfigResponse = {
  seller_email: string;
  base_fee_brl: number;
  rules: SellerPayoutRuleConfig[];
  updated_at?: string | null;
};

export type SellerPayoutConfigUpdateRequest = {
  base_fee_brl: number;
  rules: SellerPayoutRuleConfig[];
};

export type SellerPublishProductRequest = {
  template_slug: string;
  quantity: number;
  use_template_image: boolean;
  custom_image_url?: string | null;
  price_brl?: number | null;
};

export type SellerWithdrawProductRequest = {
  template_slug: string;
  quantity: number;
};

export type SellerUpdateProductPriceRequest = {
  template_slug: string;
  price_brl: number;
};

export type AdminMenuChildConfig = {
  id: string;
  label: string;
  tab: string;
  subtab?: string | null;
  enabled: boolean;
};

export type AdminMenuItemConfig = {
  id: string;
  label: string;
  tab: string;
  subtab?: string | null;
  enabled: boolean;
  children: AdminMenuChildConfig[];
};

export type AdminMenuConfigResponse = {
  items: AdminMenuItemConfig[];
};

export type AdminCategoryConfigResponse = {
  items: string[];
};
