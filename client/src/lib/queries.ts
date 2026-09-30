import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { ActivityItem, Category, Member, SareeSummary } from './types';
import type { ContributionStatus } from '../components/ui';

export interface Dashboard {
  year: number;
  title: string;
  finance: {
    budget: number;
    contributions: number;
    otherIncome: number;
    sareeSales: number;
    totalIncome: number;
    expenses: number;
    sareePurchases: number;
    totalExpenses: number;
    balance: number;
    budgetUsedPct: number | null;
  };
  contributions: { members: number; paid: number; partial: number; pending: number; expected: number; received: number; pendingAmount: number };
  contributionStatus: Array<{ user_id: number; name: string; expected: number; paid: number; pending: number; status: ContributionStatus }>;
  myContribution: { expected: number; paid: number; pending: number; status: ContributionStatus; lastPaidOn: string | null } | null;
  expensesByCategory: Array<{ category: string; amount: number; count: number }>;
  recentExpenses: Array<{ id: number; amount: number; spent_on: string; description: string; category: string; paid_by_name: string; created_at: string; proof_count: number }>;
  highestExpenses: Array<{ id: number; amount: number; spent_on: string; description: string; category: string; paid_by_name: string }>;
  recentContributions: Array<{ id: number; amount: number; paid_on: string; member_name: string; created_at: string; has_proof: boolean }>;
  sarees: SareeSummary;
  media: { photos: number; videos: number; unpublished: number };
  recentActivity: ActivityItem[];
  generatedAt: string;
}

export const useDashboard = (year: number | null) =>
  useQuery({
    queryKey: ['year', year, 'dashboard'],
    queryFn: async () => (await api.get<Dashboard>(`/events/${year}/dashboard`)).data,
    enabled: !!year,
  });

export const useTrend = () =>
  useQuery({
    queryKey: ['trend'],
    queryFn: async () => (await api.get<{ trend: Array<{ year: number; income: number; expenses: number; balance: number }> }>('/events/trend')).data.trend,
  });

export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<{ categories: Category[] }>('/expense-categories')).data.categories,
    staleTime: 5 * 60 * 1000,
  });

export const useMembers = () =>
  useQuery({
    queryKey: ['members'],
    queryFn: async () => (await api.get<{ members: Member[] }>('/members')).data.members,
    staleTime: 60 * 1000,
  });
