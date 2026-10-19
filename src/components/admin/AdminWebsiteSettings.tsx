import React, { useState } from 'react';
import { Image as ImageIcon, Layers, GalleryHorizontal, Scale, Smartphone, PanelTop, Rows3, Search, Palette, Languages, ShieldCheck } from 'lucide-react';
import { AdminThemesTab } from './AdminThemesTab.tsx';
import { AdminLanguagesTab } from './AdminLanguagesTab.tsx';
import { AdminTrustTab } from './AdminTrustTab.tsx';
import { HeroLayoutCard } from './HeroLayoutCard.tsx';
import { AdminSearchTab } from './AdminSearchTab.tsx';
import { HeaderDesignCard } from './HeaderDesignCard.tsx';
import { MobileDrawerCard } from './MobileDrawerCard.tsx';
import { HomeSectionsCard } from './HomeSectionsCard.tsx';
import { HomeVideosCard } from './HomeVideosCard.tsx';
import { AdminHeaderLogoTab } from './AdminHeaderLogoTab.tsx';
import { AdminFooterTab } from './AdminFooterTab.tsx';
import { AdminBannerTab } from './AdminBannerTab.tsx';
import { AdminPagesTab } from './AdminPagesTab.tsx';
import { AdminMobileNavTab } from './AdminMobileNavTab.tsx';
import {
  AdminSiteMetaPanel,
  AdminServiceFeaturesPanel,
  AdminFlashSalePanel,
} from './AdminSiteMetaPanel.tsx';
import { PageHeader } from './ui.tsx';
import { SiteSettings } from '../../types/index.ts';

type WebsiteTab = 'branding' | 'theme' | 'languages' | 'header' | 'home' | 'trust' | 'search' | 'footer' | 'hero' | 'legal' | 'mobile';

interface AdminWebsiteSettingsProps {
  settings: SiteSettings;
  onSaveSettings: (settings: SiteSettings) => Promise<void> | void;
  initialTab?: WebsiteTab;
}

const TABS: Array<{ id: WebsiteTab; label: string; icon: typeof ImageIcon }> = [
  { id: 'branding', label: 'Branding & SEO', icon: ImageIcon },
  // v3.13 — home / product page design (Classic or Glow) and website languages
  { id: 'theme', label: 'Themes', icon: Palette },
  { id: 'languages', label: 'Languages', icon: Languages },
  { id: 'header', label: 'Header Design', icon: PanelTop },
  { id: 'home', label: 'Home Sections', icon: Rows3 },
  // v3.14 — "why choose us" with certificates, factory & lab gallery
  { id: 'trust', label: 'Trust & Facility', icon: ShieldCheck },
  { id: 'search', label: 'Search & Shop', icon: Search },
  { id: 'footer', label: 'Footer & Social', icon: Layers },
  { id: 'hero', label: 'Hero Banners', icon: GalleryHorizontal },
  { id: 'legal', label: 'Pages & Policies', icon: Scale },
  { id: 'mobile', label: 'Mobile Nav', icon: Smartphone },
];

const SUBTITLES: Record<WebsiteTab, string> = {
  branding: 'Logo, favicon, shop name, the browser-tab title and the picture a shared link shows.',
  theme: 'The design of the home page (Classic, Glow or Luxe) and of the product page.',
  languages: 'Which languages visitors can pick, and the default one.',
  header: 'The look of the top bar, the menu and the search box.',
  home: 'Which sections the home page shows, in what order, and the videos above the footer.',
  trust: '“Why choose us” with certificate badges, and the factory & lab gallery.',
  search: 'Search box text, typing animation, search by photo and products per page.',
  footer: 'The trust cards above the footer, footer columns and social links.',
  hero: 'The banners at the top of the home page, the hero layout and the Flash Sale switch.',
  legal: 'About, contact, privacy, terms, refund and other pages.',
  mobile: 'The side menu and the bottom bar on phones.',
};

/**
 * One "Website" area with five tabs — no duplicated sidebar dropdown.
 * Branding also carries the browser-tab title and share preview, Footer & Social
 * the trust cards above the footer, and Hero the Today's Flash Sale switch, so
 * every storefront-facing text lives behind a single entry.
 */
export const AdminWebsiteSettings: React.FC<AdminWebsiteSettingsProps> = ({
  settings,
  onSaveSettings,
  initialTab = 'branding',
}) => {
  const [activeTab] = useState<WebsiteTab>(initialTab);
  const save = onSaveSettings as (next: SiteSettings) => Promise<void>;

  // v3.15 — each part has its own entry in the sidebar (Online Store → Store
  // Design / Store Content), so the page shows one part with its own title
  // instead of a second row of tabs.
  const current = TABS.find((tab) => tab.id === activeTab) || TABS[0];
  return (
    <div>
      <PageHeader title={current.label} subtitle={SUBTITLES[current.id]} icon={current.icon} />

      <div className="space-y-5">
        {activeTab === 'branding' && (
          <>
            <AdminHeaderLogoTab settings={settings} onSaveSettings={save} />
            <AdminSiteMetaPanel settings={settings} onSaveSettings={onSaveSettings} />
          </>
        )}

        {activeTab === 'theme' && <AdminThemesTab settings={settings} onSaveSettings={save} />}
        {activeTab === 'languages' && <AdminLanguagesTab settings={settings} onSaveSettings={save} />}

        {activeTab === 'header' && <HeaderDesignCard settings={settings} onSaveSettings={save} />}

        {activeTab === 'home' && (
          <>
            <HomeSectionsCard settings={settings} onSaveSettings={save} />
            {/* v3.12 — YouTube videos above the footer */}
            <HomeVideosCard settings={settings} onSaveSettings={save} />
          </>
        )}

        {activeTab === 'trust' && <AdminTrustTab settings={settings} onSaveSettings={save} />}

        {/* v3.11 — search box text, typing animation, search by photo, products per page */}
        {activeTab === 'search' && <AdminSearchTab settings={settings} onSaveSettings={save} />}

        {activeTab === 'footer' && (
          <>
            <AdminServiceFeaturesPanel settings={settings} onSaveSettings={onSaveSettings} />
            <AdminFooterTab settings={settings} onSave={save} />
          </>
        )}

        {activeTab === 'hero' && (
          <>
            {/* v3.14 — banner across the page, or categories + banner */}
            <HeroLayoutCard settings={settings} onSaveSettings={save} />
            <AdminFlashSalePanel settings={settings} onSaveSettings={onSaveSettings} />
            <AdminBannerTab />
          </>
        )}

        {activeTab === 'legal' && <AdminPagesTab settings={settings} onSaveSettings={save} />}

        {activeTab === 'mobile' && (
          <>
            <MobileDrawerCard settings={settings} onSaveSettings={save} />
            <AdminMobileNavTab settings={settings} onSaveSettings={save} />
          </>
        )}
      </div>
    </div>
  );
};
