import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTheme, c, ThemeMode } from './theme';

// Day / Night look. "auto" follows the phone's light/dark setting; the choice is remembered on this phone.
export type ThemePref = 'auto' | 'day' | 'night';
const KEY = 'theme-pref';

const Ctx = createContext<{ pref: ThemePref; mode: ThemeMode; setPref: (p: ThemePref) => void; toggle: () => void }>({
  pref: 'auto', mode: 'night', setPref: () => {}, toggle: () => {},
});
export const useThemeMode = () => useContext(Ctx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const phone = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('auto');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { if (v === 'day' || v === 'night' || v === 'auto') setPrefState(v); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const mode: ThemeMode = pref === 'auto' ? (phone === 'light' ? 'day' : 'night') : pref;
  applyTheme(mode); // updates the shared colours before anything below draws

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(KEY, p).catch(() => {});
  };
  // The ☀️/🌙 button: switch to the other look (and stop following the phone).
  const toggle = () => setPref(mode === 'day' ? 'night' : 'day');

  if (!ready) return null;
  // Changing `key` redraws every screen with the new colours.
  return (
    <Ctx.Provider value={{ pref, mode, setPref, toggle }}>
      <View key={mode} style={{ flex: 1, backgroundColor: c.bg }}>{children}</View>
    </Ctx.Provider>
  );
}
