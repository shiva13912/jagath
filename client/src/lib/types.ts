import type { ContributionStatus } from '../components/ui';

export interface Member {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: 'admin' | 'member';
  is_active: boolean;
  show_on_public_site: boolean;
  email_public: boolean;
  phone_public: boolean;
  created_at: string;
  notes?: string | null;
  last_login_at?: string | null;
}

export interface EventYear {
  id: number;
  year: number;
  title: string;
  description: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  default_expected_contribution: number;
  is_published: boolean;
  public_finance: boolean;
  public_contributor_names: boolean;
  public_expense_list: boolean;
  public_saree_sales: boolean;
}

export interface Category {
  id: number;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface FileRef {
  id: number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  kind?: 'payment' | 'bill';
  proof_id?: number;
}

export interface Expense {
  id: number;
  amount: number;
  spent_on: string;
  category_id: number;
  category: string;
  description: string;
  vendor: string | null;
  paid_by: number;
  paid_by_name: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  proof_count: number;
  proofs?: FileRef[];
}

export interface ContributionRow {
  user_id: number;
  name: string;
  expected: number;
  paid: number;
  pending: number;
  status: ContributionStatus;
  last_paid_on: string | null;
  payments: number;
}

export interface Payment {
  id: number;
  user_id: number;
  member_name: string;
  amount: number;
  paid_on: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  proof: FileRef | null;
  created_by: number;
  created_by_name: string;
  created_at: string;
}

export interface OtherIncome {
  id: number;
  amount: number;
  source: string;
  received_on: string;
  notes: string | null;
  created_by_name: string;
}

export interface SareePurchase {
  id: number;
  purchased_on: string;
  vendor: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  purchased_by: number | null;
  purchased_by_name: string | null;
  notes: string | null;
  proof: FileRef | null;
  photo: FileRef | null;
  created_by: number;
}

export interface SareeSale {
  id: number;
  sold_on: string;
  customer_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  recorded_by: number;
  recorded_by_name: string;
  notes: string | null;
  photo: FileRef | null;
  created_by: number;
}

export interface SareeSummary {
  purchased: number;
  sold: number;
  remaining: number;
  purchaseCost: number;
  salesRevenue: number;
  profit: number;
  avgPurchasePrice: number;
  avgSalePrice: number;
}

export interface Album {
  id: number;
  event_id: number;
  year: number;
  name: string;
  description: string | null;
  is_public: boolean;
  sort_order: number;
  photo_count: number;
  video_count: number;
  public_count?: number;
  pending_count?: number;
  cover_media_id: number | null;
  cover_id: number | null;
  created_by: number;
}

export interface Media {
  id: number;
  album_id: number;
  album_name?: string;
  type: 'photo' | 'video';
  original_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  description: string | null;
  is_public: boolean;
  allow_download: boolean;
  is_featured: boolean;
  has_thumb: boolean;
  uploaded_by: number;
  uploaded_by_name?: string;
  created_at: string;
}

export interface ActivityItem {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  user_name: string | null;
  created_at: string;
  year?: number | null;
  details?: Record<string, { from: unknown; to: unknown }> | null;
  ip?: string | null;
}
