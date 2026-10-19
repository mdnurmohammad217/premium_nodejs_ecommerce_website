export interface Product {
  id: number;
  /** v3.15 — product SEO and tags */
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoImage?: string | null;
  tags?: string | null;
  name: string;
  genericName?: string | null;
  slug: string;
  sku: string;
  barcode?: string | null;
  categoryId?: number | null;
  categoryName?: string;
  categorySlug?: string;
  brandId?: number | null;
  brandName?: string;
  description?: string | null;
  shortDescription?: string | null;
  price: string;
  salePrice?: string | null;
  costPrice?: string | null;
  stock: number;
  lowStockThreshold?: number;
  unit?: string | null;
  dosage?: string | null;
  requiresPrescription?: boolean;
  batchNumber?: string | null;
  expiryDate?: string | null;
  featured?: boolean;
  isFlashSale?: boolean;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  rating?: string;
  reviewCount?: number;
  image?: string | null;
  images?: string | null;
  status?: string;
  createdAt?: string;
  brandSlug?: string;
  brandLogo?: string;
  /** Set by the API for an approved wholesale buyer: price is the wholesale price */
  isWholesale?: boolean;
  wholesaleMinQty?: number | null;
  wholesaleMaxQty?: number | null;
  /** Dashboard only — never sent to the storefront */
  wholesaleEnabled?: boolean;
  wholesalePrice?: string | null;
  hasVariations?: boolean;
  /** v3.6 — YouTube / Facebook / mp4 link shown in the gallery */
  videoUrl?: string | null;
  /** v3.6 — size chart id (Dashboard → Products → Size Guides) */
  sizeGuideId?: number | null;
  /** v3.6 — ships free */
  freeShipping?: boolean;
  /** v3.6 — own delivery charge per zone, JSON {"zone-id": 80} */
  shippingCharges?: string | null;
}

/** v3.6 — single product page switches */
export interface ProductPageConfig {
  showSpecifications?: boolean;
  showReviews?: boolean;
  allowReviews?: boolean;
  reviewsRequireApproval?: boolean;
  stickyBuyBar?: boolean;
  showVideo?: boolean;
  showRelated?: boolean;
  showSizeGuide?: boolean;
  /** v3.9 — heading inside the Description tab (default "পণ্যের বিবরণ") */
  descriptionTitle?: string;
  descriptionTabLabel?: string;
  howToUseTabLabel?: string;
}

/** v3.6 — blog section and pages */
export interface BlogConfig {
  isEnabled?: boolean;
  showOnHome?: boolean;
  homeTitle?: string;
  homeSubtitle?: string;
  homeCount?: number;
  pageTitle?: string;
  pageSubtitle?: string;
}

/** v3.6 — customer review screenshots on the home page */
export interface ReviewImagesConfig {
  isEnabled?: boolean;
  title?: string;
  subtitle?: string;
  images?: Array<{ id: string; url: string; caption?: string }>;
}

/** v3.6 — store-wide free delivery */
export interface FreeShippingConfig {
  enabled?: boolean;
  minSubtotal?: number | null;
  minQuantity?: number | null;
  zones?: string[];
  excludeWholesale?: boolean;
  showProgress?: boolean;
}

/** v3.6 — online gateway the checkout may offer (no credentials) */
export interface OnlinePaymentOption {
  id: 'sslcommerz' | 'bkash' | 'nagad';
  name: string;
  description?: string;
  /** v3.7 — optional logo shown at checkout */
  logoUrl?: string;
  sandbox?: boolean;
}

/** v3.6 — size chart */
export interface SizeGuide {
  id: number;
  name: string;
  description?: string;
  columns: string[];
  rows: string[][];
  image?: string;
  note?: string;
  status?: string;
  productCount?: number;
}

export interface Category {
  parentId?: number | null;
  level?: number;
  showOnHome?: boolean;
  children?: Category[];
  productCount?: number;
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  icon?: string | null;
  featured?: boolean;
  sortOrder?: number;
}

export interface Brand {
  id: number;
  name: string;
  slug: string;
  logo?: string | null;
  description?: string | null;
  productCount?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Order {
  id: number;
  orderNumber: string;
  source: string;
  customerId?: number | null;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  subtotal: string;
  discount: string;
  shippingCharge: string;
  tax: string;
  total: string;
  cashReceived?: string;
  changeAmount?: string;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  shippingZone?: string | null;
  transactionId?: string | null;
  senderNumber?: string | null;
  notes?: string | null;
  cashierName?: string | null;
  /** v3.6 — placed from a landing page */
  landingPageId?: number | null;
  landingPageName?: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  productName: string;
  sku?: string;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  batchNumber?: string;
  expiryDate?: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  totalOrders?: number;
  totalSpent?: string;
  createdAt?: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  address?: string | null;
  balance?: string;
}

export interface HeroBanner {
  id: number;
  title?: string | null;
  subtitle?: string | null;
  badge?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
  imageUrl: string;
  mobileImageUrl?: string | null;
  bgGradient?: string | null;
  sortOrder?: number;
  status: string;
  /** v3.12 — width ÷ height of the picture(s), sent by the server */
  ratio?: number | null;
  mobileRatio?: number | null;
}

export interface Coupon {
  id: number;
  code: string;
  type: 'percentage' | 'fixed';
  value: string;
  minOrder?: string;
  maxDiscount?: string;
  usageLimit?: number;
  usedCount?: number;
  expiresAt?: string;
  status: string;
}

export interface SiteSettings {
  mobile_nav_config?: MobileNavConfig;
  product_page_config?: ProductPageConfig;
  blog_config?: BlogConfig;
  review_images_config?: ReviewImagesConfig;
  free_shipping_config?: FreeShippingConfig;
  /** Set by the API from Dashboard → Payments (names only) */
  online_payments?: OnlinePaymentOption[];
  general?: {
    storeName: string;
    tagline: string;
    email: string;
    phone: string;
    whatsapp: string;
    address: string;
    currency: string;
    currencyCode: string;
    orderPrefix: string;
    posPrefix: string;
    requirePrescriptionWarning: boolean;
  };
  theme?: {
    preset: string;
    primaryColor: string;
    primaryHover: string;
    primaryLight: string;
    secondaryColor: string;
    accentColor: string;
    radius: string;
  };
  shipping?: {
    zones: Array<{
      id: string;
      name: string;
      charge: number;
      eta: string;
    }>;
  };
  payment?: {
    methods: PaymentMethodConfig[];
  };
  checkout_config?: CheckoutConfig;
  marketing?: {
    metaPixelId?: string;
    metaConversionsToken?: string;
    metaTestEventCode?: string;
    gtmId?: string;
    ga4Id?: string;
    enableMetaPixel?: boolean;
    enableGtm?: boolean;
    enableGa4?: boolean;
    /** Set by the API: a Conversions API token exists (the token itself is never sent) */
    capiEnabled?: boolean;
  };
  topbar?: TopBarConfig;
  /** Brand logo strip on the home page — Dashboard → Brands */
  home_brands_config?: HomeBrandsConfig;
  /** Wholesale Auto Approval — Dashboard → Wholesale Customers */
  wholesale_config?: { autoApprove?: boolean };
  navigation_menu?: NavigationMenuItem[];
  pages?: CmsPage[];
  offers_config?: OffersConfig;
  logo_config?: LogoConfig;
  product_card_config?: ProductCardConfig;
  /** v3.9 — shape of product pictures (square, 400 × 600 …) */
  product_image_config?: import("../lib/productImage.ts").ProductImageConfig;
  footer_config?: FooterConfig;
  social_config?: SocialConfig;
  chat_config?: ChatConfig;
  courier_config?: CourierConfig;
  product_contact_config?: ProductContactConfig;
  homepage_sections?: Array<{ id: string; name: string; isEnabled: boolean; sortOrder: number }>;
  /** Browser tab title, meta tags and favicon — Website → Branding */
  seo_config?: SeoConfig;
  /** Invoice header/footer text — used by every printed invoice */
  invoice_config?: InvoiceConfig;
  /** The four trust cards above the footer — Website → Footer & Social */
  service_features?: ServiceFeaturesConfig;
  /** Today's Flash Sale strip — Website → Hero Slider */
  flash_sale_config?: FlashSaleConfig;
  footer?: {
    title?: string;
    description?: string;
    phone?: string;
    email?: string;
    address?: string;
    copyright?: string;
    facebook?: string;
    whatsapp?: string;
    youtube?: string;
  };
}

export interface TopBarConfig {
  enabled?: boolean;
  /** 'info' = address/phone/shipping text, 'ticker' = scrolling news line. Only one shows. */
  mode?: 'info' | 'ticker';
  addressText?: string;
  phoneText?: string;
  deliveryMessage?: string;
  tickerText?: string;
  /** Seconds for one full pass of the ticker (lower = faster) */
  tickerSpeed?: number;
  bgColor?: string;
  textColor?: string;
  /** Show the bar on phones too */
  showOnMobile?: boolean;
}

export interface HomeBrandsConfig {
  enabled?: boolean;
  title?: string;
  showNames?: boolean;
}

export interface SeoConfig {
  siteTitle?: string;
  titleSuffix?: string;
  metaDescription?: string;
  metaKeywords?: string;
  faviconUrl?: string;
  ogImageUrl?: string;
}

export interface InvoiceConfig {
  businessName?: string;
  tagline?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  drugLicense?: string;
  vatRegistration?: string;
  invoicePrefix?: string;
  footerNote?: string;
  termsNote?: string;
  showLogo?: boolean;
  showSignature?: boolean;
  signatureLabel?: string;
  defaultSize?: 'a4' | 'mm80' | 'mm58';
}

export interface ServiceFeatureItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  isActive?: boolean;
}

export interface ServiceFeaturesConfig {
  isEnabled?: boolean;
  items: ServiceFeatureItem[];
}

export interface FlashSaleConfig {
  isEnabled?: boolean;
  heading?: string;
  subheading?: string;
  badgeText?: string;
  countdownHours?: number;
  maxProducts?: number;
}

export interface ProductCardConfig {
  /** Button captions, editable from Dashboard → Product Card */
  addToCartLabel?: string;
  buyNowLabel?: string;
  showAddToCart: boolean;
  showBuyNow: boolean;
  showWishlist?: boolean;
  showPrice?: boolean;
  showOldPrice?: boolean;
  showDiscount?: boolean;
  showCategory?: boolean;
  showGenericName?: boolean;
  /** v3.10 — the brand's name above the product name */
  showBrand?: boolean;
  showDescription?: boolean;
  showStockText?: boolean;
}

export interface FooterLinkItem {
  id: string;
  label: string;
  url: string;
  isExternal?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface FooterConfig {
  autoUseHeaderLogo?: boolean;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  drugLicense?: string;
  copyrightText?: string;
  companyCredit?: string;
  websiteCredit?: string;
  developerName?: string;
  creditUrl?: string;
  enableCredit?: boolean;
  quickLinksTitle?: string;
  quickLinks?: FooterLinkItem[];
  policyLinksTitle?: string;
  policyLinks?: FooterLinkItem[];
  showLicenseSection?: boolean;
  showPaymentMethods?: boolean;
  contactTitle?: string;
  facebookUrl?: string;
  whatsappNumber?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  messengerUrl?: string;
  showSocialLinks?: boolean;
  /** v3.11 — footer columns in the owner's order: 'brand' | 'quickLinks' | 'policyLinks' | 'contact' */
  sectionOrder?: string[];
  /** v3.11 — columns switched off */
  hiddenSections?: string[];
  /** v3.11 — where the social icons sit: under the contact details, under the store description, or in the bottom bar */
  socialPlacement?: 'contact' | 'brand' | 'bottom';
  /** v3.11 — small heading above the social icons ("Follow us") */
  socialTitle?: string;
}

export interface SocialLinkConfig {
  url?: string;
  enabled?: boolean;
}

export interface SocialConfig {
  facebook?: SocialLinkConfig;
  instagram?: SocialLinkConfig;
  youtube?: SocialLinkConfig;
  tiktok?: SocialLinkConfig;
  whatsapp?: SocialLinkConfig;
  messenger?: SocialLinkConfig;
  /** v3.11 — more networks */
  x?: SocialLinkConfig;
  linkedin?: SocialLinkConfig;
  telegram?: SocialLinkConfig;
  pinterest?: SocialLinkConfig;
  threads?: SocialLinkConfig;
  snapchat?: SocialLinkConfig;
  discord?: SocialLinkConfig;
  /** v3.11 — the order the icons are shown in (network keys) */
  order?: string[];
  /** v3.11 — 'brand' coloured circles, 'tile' quiet tiles that colour on hover, 'outline' rings */
  iconStyle?: 'brand' | 'tile' | 'outline';
  /** v3.11 — circle, rounded square or square */
  iconShape?: 'circle' | 'rounded' | 'square';
}

export interface CourierCredentials {
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  storeId?: string;
  apiKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  /** Pathao: use the sandbox API (for testing with Pathao's test account) */
  sandbox?: boolean;
  /** Pathao: default parcel weight in kg */
  defaultWeight?: string;
}

export interface CourierConfig {
  publicBaseUrl?: string;
  pathao?: CourierCredentials;
  steadfast?: CourierCredentials;
  /** v3.11 — RedX: API access token, pickup store, default weight (kg) */
  redx?: CourierCredentials & { token?: string };
  /** v3.11 — Carrybee: Client ID / Secret / Context, store, delivery & product type */
  carrybee?: CourierCredentials & { clientContext?: string; deliveryType?: string | number; productType?: string | number };
}

export interface PaymentMethodConfig {
  id: string;
  name: string;
  description?: string;
  /** Merchant/personal number shown to the customer (bKash, Nagad, Rocket, Upay) */
  accountNumber?: string;
  /** Free-form extra instructions (bank account details, branch, etc.) */
  instructions?: string;
  requiresTxId: boolean;
  enabled: boolean;
  sortOrder?: number;
  /** Personal / Merchant / Agent / Bank */
  accountType?: string;
  logoUrl?: string;
}

export interface ShippingZoneConfig {
  id: string;
  name: string;
  charge: number;
  eta: string;
  enabled?: boolean;
}

/** Every visible label on the checkout page, editable from the dashboard */
export interface CheckoutConfig {
  deliverySectionTitle?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  phoneLabel?: string;
  phonePlaceholder?: string;
  addressLabel?: string;
  addressPlaceholder?: string;
  zoneLabel?: string;
  notesLabel?: string;
  notesPlaceholder?: string;
  paymentSectionTitle?: string;
  summaryTitle?: string;
  subtotalLabel?: string;
  discountLabel?: string;
  deliveryLabel?: string;
  totalLabel?: string;
  submitLabel?: string;
  trxIdLabel?: string;
  senderNumberLabel?: string;
  /** v3.11 — checkout page layout: classic (cards), express (one page), split (two panels) */
  design?: 'classic' | 'express' | 'split';
  /** v3.11 — false hides the delivery area / charge entirely; orders then carry no delivery charge */
  deliveryEnabled?: boolean;
  /** v3.11 — shown in the summary while delivery is off, e.g. "Delivery charge included" */
  deliveryOffNote?: string;
  /** v3.11 — the order note box (default on) */
  showNotes?: boolean;
  /** v3.11 — the "Have a coupon code?" box (default on) */
  showCoupon?: boolean;
}

/** Call / WhatsApp buttons shown on the single product page */
export interface ProductContactConfig {
  showCallButton?: boolean;
  showWhatsappButton?: boolean;
  callNumber?: string;
  whatsappNumber?: string;
  callLabel?: string;
  whatsappLabel?: string;
  callBgColor?: string;
  whatsappBgColor?: string;
}

export interface ChatConfig {
  enabled?: boolean;
  supportText?: string;
  whatsappNumber?: string;
  messengerUrl?: string;
  phone?: string;
}

export interface NavigationMenuItem {
  id: string;
  title: string;
  url: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  isExternal?: boolean;
  /** 'category' items point at shop?category=<slug> and can pull in sub-categories live */
  type?: 'link' | 'category';
  categoryId?: number;
  categorySlug?: string;
  /** render the category's live sub-categories as a hover dropdown */
  includeChildren?: boolean;
  /** hand-built one-level sub-menu */
  children?: NavigationMenuItem[];
}

/** Mobile bottom navigation bar — Dashboard → Website → Mobile Nav */
export interface MobileNavConfig {
  isEnabled: boolean;
  showLabels: boolean;
  items: Array<{
    id: string;
    icon: string;
    label: string;
    url: string;
    isActive: boolean;
    highlight: boolean;
  }>;
}

export interface CmsPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  isPublished: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OffersConfig {
  heading: string;
  viewAllLink: string;
  badgeText?: string;
  selectedProductIds: number[];
  discountPercentOverride?: number;
  customDiscountPercent?: number;
  startDate?: string;
  endDate?: string;
  isEnabled: boolean;
}

export interface LogoConfig {
  desktopLogoUrl?: string;
  mobileLogoUrl?: string;
  pharmacyName?: string;
  tagline?: string;
  badgeText?: string;
}
