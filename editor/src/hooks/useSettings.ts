import { useState, useCallback } from 'react';
import { loadSettings, saveSettings } from '../lib/storage/settings';
import type { AppSettings } from '../lib/storage/settings';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const updateSettings = useCallback((next: AppSettings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  return { settings, updateSettings };
}
