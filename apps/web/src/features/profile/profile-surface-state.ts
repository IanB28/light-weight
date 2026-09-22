import type { TabType } from '../../components/BottomNav.js';

export type SettingsTarget = 'root' | 'gender' | 'training' | 'appearance' | 'language' | 'data';

export interface AppSurfaceState {
  currentTab: TabType;
  profileOpen: boolean;
  settingsOpen: boolean;
  settingsTarget: SettingsTarget;
}

export type AppSurfaceAction =
  | { type: 'open_profile' }
  | { type: 'close_profile' }
  | { type: 'open_settings'; target?: SettingsTarget }
  | { type: 'close_settings' }
  | { type: 'select_tab'; tab: TabType };

export const INITIAL_APP_SURFACE_STATE: AppSurfaceState = {
  currentTab: 'home',
  profileOpen: false,
  settingsOpen: false,
  settingsTarget: 'root'
};

/** Keeps secondary app surfaces independent from the five primary tabs. */
export function appSurfaceReducer(state: AppSurfaceState, action: AppSurfaceAction): AppSurfaceState {
  switch (action.type) {
    case 'open_profile':
      return { ...state, profileOpen: true };
    case 'close_profile':
      return { ...state, profileOpen: false };
    case 'open_settings':
      return { ...state, settingsOpen: true, settingsTarget: action.target ?? 'root' };
    case 'close_settings':
      return { ...state, settingsOpen: false };
    case 'select_tab':
      return { ...state, currentTab: action.tab, profileOpen: false, settingsOpen: false };
  }
}
