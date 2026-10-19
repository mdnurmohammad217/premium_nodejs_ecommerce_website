import React from 'react';
import { SiteSettings } from '../../types/index.ts';
import { CmsPageArticle, findCmsPage } from './DynamicPageView.tsx';

interface PolicyViewProps {
  page: 'about' | 'contact' | 'faq' | 'privacy' | 'terms' | 'refund' | 'return' | 'shipping';
  onNavigate: (view: string, param?: any) => void;
  settings?: SiteSettings;
}

/**
 * Slugs to try for each fixed policy route. The page editor's starter slugs
 * differ from these route names in two places (`delivery`, and one combined
 * return-and-refund page), so both spellings resolve to the same CMS page.
 */
const SLUG_CANDIDATES: Record<PolicyViewProps['page'], string[]> = {
  about: ['about'],
  contact: ['contact'],
  faq: ['faq'],
  privacy: ['privacy'],
  terms: ['terms'],
  refund: ['refund', 'return'],
  return: ['return', 'refund'],
  shipping: ['shipping', 'delivery'],
};

/**
 * Store policy pages. Every word on them is written by the store owner in
 * Dashboard → Pages; nothing is filled in here, so a page that has not been
 * written yet says so instead of showing someone else's policy.
 */
export const PolicyView: React.FC<PolicyViewProps> = ({ page, onNavigate, settings }) => (
  <CmsPageArticle page={findCmsPage(settings, ...SLUG_CANDIDATES[page])} onBack={() => onNavigate('home')} />
);
