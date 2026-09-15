import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18n.js';

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
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

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

  // Render official Google button when script and container are ready
  useEffect(() => {
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

      const isFrost = document.documentElement.getAttribute('data-theme') === 'frost';
      const containerWidth = containerRef.current.clientWidth || 320;

      containerRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: isFrost ? 'outline' : 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(380, Math.max(260, containerWidth)),
        locale: language === 'es' ? 'es' : 'en'
      });
    } catch {
      onErrorRef.current('auth.error.google_auth_failed');
    }
  }, [gisLoaded, clientId, language]);

  if (!clientId) {
    return null;
  }

  return (
    <div
      className={`relative flex w-full items-center justify-center transition-opacity ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      <div ref={containerRef} className="flex min-h-[44px] w-full justify-center overflow-hidden" />
    </div>
  );
}
