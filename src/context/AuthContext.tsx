import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, clearToken, getToken, setToken } from '../lib/api.ts';
import { setCacheTier } from '../lib/dataCache.ts';

export interface AppUser {
  id?: number;
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'customer';
  phone?: string;
  /** Staff only: the modules ticked in Staff & Access (src/lib/permissions.ts) */
  permissions?: string[];
  jobRole?: string;
  /** Customers only */
  customerType?: 'regular' | 'wholesale';
  wholesaleStatus?: 'pending' | 'approved' | 'rejected' | 'suspended' | null;
  businessName?: string;
}

/** Wholesale prices apply only to an approved wholesale customer */
export const isWholesaleBuyer = (user?: AppUser | null): boolean =>
  Boolean(user && user.role === 'customer' && user.customerType === 'wholesale' && user.wholesaleStatus === 'approved');

export interface WholesaleRegistration {
  name: string;
  phone: string;
  email?: string;
  password: string;
  businessName: string;
  businessAddress: string;
  businessType: string;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  loginWithCredentials: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; user?: AppUser }>;
  registerCustomer: (data: {
    name: string;
    phone: string;
    email?: string;
    password: string;
  }) => Promise<{ success: boolean; error?: string; user?: AppUser }>;
  loginCustomer: (
    identifier: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; user?: AppUser }>;
  /** One sign-in for owner, staff and customers — the server decides who it is */
  signIn: (
    identifier: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; user?: AppUser }>;
  registerWholesale: (
    data: WholesaleRegistration
  ) => Promise<{ success: boolean; error?: string; user?: AppUser }>;
  /** Re-read the signed-in user (e.g. after a wholesale application) */
  refreshUser: () => Promise<void>;
  signOut: () => void;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loginWithCredentials: async () => ({ success: false }),
  signIn: async () => ({ success: false }),
  registerCustomer: async () => ({ success: false }),
  loginCustomer: async () => ({ success: false }),
  registerWholesale: async () => ({ success: false }),
  refreshUser: async () => {},
  signOut: () => {},
  isLoginModalOpen: false,
  setIsLoginModalOpen: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // No user until the server confirms a valid session. A visitor is never an admin.
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState<boolean>(
    () => Boolean(getToken()) || (typeof window !== 'undefined' && /[#&]oauth_token=/.test(window.location.hash || ''))
  );
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Validate any stored token against the server on boot
  useEffect(() => {
    // v3.12 — back from "Continue with Google / Facebook": the server put the
    // new session in the address #fragment; keep it and clean the address bar
    // Accepted only with the random value this tab kept when the button was
    // pressed — a link someone else made can never sign a visitor in
    try {
      const hash = window.location.hash || '';
      const match = hash.match(/[#&]oauth_token=([^&]+)/);
      if (match) {
        const sent = (hash.match(/[#&]oauth_cn=([^&]+)/) || [])[1] || '';
        let kept = '';
        try {
          kept = sessionStorage.getItem('shop:oauth-cn') || '';
          sessionStorage.removeItem('shop:oauth-cn');
        } catch {
          kept = '';
        }
        if (kept && decodeURIComponent(sent) === kept) setToken(decodeURIComponent(match[1]));
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      }
    } catch {
      /* ignore a malformed address */
    }
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    apiFetch<{ user: AppUser }>('/api/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) {
          clearToken();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The pricing tier follows the account: approved wholesale buyers get their
  // own cached catalogue and their own cart; everyone else shares the regular one.
  useEffect(() => {
    if (loading) return;
    setCacheTier(isWholesaleBuyer(user) ? 'w' : '');
  }, [loading, user?.uid, user?.wholesaleStatus, user?.customerType]);

  const refreshUser = async () => {
    if (!getToken()) return;
    try {
      const data = await apiFetch<{ user: AppUser }>('/api/auth/me');
      setUser(data.user);
    } catch {
      /* a 401 already signs the user out */
    }
  };

  const registerWholesale = async (data: WholesaleRegistration) => {
    try {
      setLoading(true);
      const res = await apiFetch<{ user: AppUser; token: string }>('/api/auth/register-wholesale', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (res.token) setToken(res.token);
      setUser(res.user);
      return { success: true, user: res.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Registration failed. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  // Token rejected mid-session (expired / server restarted) -> drop the user
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('pharma:session-expired', onExpired);
    return () => window.removeEventListener('pharma:session-expired', onExpired);
  }, []);

  const loginWithCredentials = async (email: string, password: string) => {
    try {
      setLoading(true);
      const data = await apiFetch<{ user: AppUser; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (data.token) setToken(data.token);
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Sign-in failed. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  // Customer self sign-up
  const registerCustomer = async (data: {
    name: string;
    phone: string;
    email?: string;
    password: string;
  }) => {
    try {
      setLoading(true);
      const res = await apiFetch<{ user: AppUser; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (res.token) setToken(res.token);
      setUser(res.user);
      return { success: true, user: res.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Registration failed. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  // Customer login by phone or email (admins use loginWithCredentials)
  const loginCustomer = async (identifier: string, password: string) => {
    try {
      setLoading(true);
      const res = await apiFetch<{ user: AppUser; token: string }>('/api/auth/customer-login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      if (res.token) setToken(res.token);
      setUser(res.user);
      return { success: true, user: res.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Sign-in failed. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (identifier: string, password: string) => {
    try {
      setLoading(true);
      const res = await apiFetch<{ user: AppUser; token: string }>('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      if (res.token) setToken(res.token);
      setUser(res.user);
      return { success: true, user: res.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Sign-in failed. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithCredentials,
        registerCustomer,
        loginCustomer,
        registerWholesale,
        refreshUser,
        signIn,
        signOut,
        isLoginModalOpen,
        setIsLoginModalOpen,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
