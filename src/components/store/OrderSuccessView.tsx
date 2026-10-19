import React from 'react';
import { Order, SiteSettings } from '../../types/index.ts';
import { ThankYouView } from './ThankYouView.tsx';

interface OrderSuccessViewProps {
  order: Order;
  settings?: SiteSettings;
  onTrack: (orderNumber: string) => void;
  onContinueShopping: () => void;
}

/**
 * Thank-you page after the website checkout (and after an online payment).
 * v3.9 — the same design as the landing-page checkout: see ThankYouView.
 */
export const OrderSuccessView: React.FC<OrderSuccessViewProps> = ({ order, settings, onTrack, onContinueShopping }) => (
  <ThankYouView
    orderNumber={order.orderNumber}
    phone={order.customerPhone}
    fallback={order as any}
    settings={settings}
    onTrack={onTrack}
    onContinue={onContinueShopping}
  />
);
