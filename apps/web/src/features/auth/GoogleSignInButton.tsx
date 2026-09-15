import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18n.js';
import { getStoredThemeSettings, type ThemeSettings } from '../../lib/theme.js';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            context?: string;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'small' | 'medium' | 'large';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number | string;
              locale?: string;
            }
          ) => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => void;
  onError: (errorKey: string) => void;
  disabled?: boolean;
}

const GIS_SCRIPT_ID = 'google-identity-services-script';

export function GoogleSignInButton({ onSuccess, onError, disabled }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gisLoaded, setGisLoaded] = useState(false);
  const { language } = useI18n();
  const [isFrostTheme, setIsFrostTheme] = useState(() => {
    if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'frost') {
      return true;
    }
    return getStoredThemeSettings().glassTheme === 'frost';
  });
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Listen for theme change events to adapt button style
  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<ThemeSettings>;
      if (customEvent.detail) {
        setIsFrostTheme(customEvent.detail.glassTheme === 'frost');
      }
    };
    window.addEventListener('lightweight_theme_changed', handleThemeChange);
    return () => window.removeEventListener('lightweight_theme_changed', handleThemeChange);
  }, []);

  // Load Google Identity Services script dynamically and safely
  useEffect(() => {
    if (!clientId) return;

    if (window.google?.accounts?.id) {
      setGisLoaded(true);
      return;
    }

    const existingScript = document.getElementById(GIS_SCRIPT_ID);
    if (existingScript) {
      const onLoad = () => setGisLoaded(true);
      existingScript.addEventListener('load', onLoad);
      return () => existingScript.removeEventListener('load', onLoad);
    }

    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGisLoaded(true);
    script.onerror = () => onErrorRef.current('auth.googleNotConfigured');
    document.head.appendChild(script);
  }, [clientId]);

  const renderGoogleButton = useCallback(() => {
    if (!gisLoaded || !clientId || !containerRef.current || !window.google?.accounts?.id) {
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) {
            onSuccessRef.current(response.credential);
          } else {
            onErrorRef.current('auth.error.google_auth_failed');
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true
      });

      const containerWidth = containerRef.current.clientWidth || 320;
      // Google Identity Services button width accepts integers between 200 and 400
      const effectiveWidth = Math.min(380, Math.max(200, Math.floor(containerWidth)));

      containerRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: isFrostTheme ? 'outline' : 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: effectiveWidth,
        locale: language === 'es' ? 'es' : 'en'
      });
    } catch {
      onErrorRef.current('auth.error.google_auth_failed');
    }
  }, [gisLoaded, clientId, language, isFrostTheme]);

  // Render official Google button when script, container, or layout changes
  useEffect(() => {
    renderGoogleButton();

    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastWidth = containerRef.current.clientWidth;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = Math.floor(entry.contentRect.width);
        if (Math.abs(newWidth - lastWidth) > 16) {
          lastWidth = newWidth;
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            renderGoogleButton();
          }, 150);
        }
      }
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [renderGoogleButton]);

  if (!clientId) {
    return null;
  }

  return (
    <div
      className={`relative flex w-full justify-center transition-opacity ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      <div ref={containerRef} className="flex min-h-[44px] w-full items-center justify-center overflow-hidden" />
    </div>
  );
}
