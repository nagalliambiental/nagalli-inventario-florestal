import React, { createContext, useContext, useState } from "react";
import { colors as lightColors } from "../constants/colors";

const darkColors = {
  primary: "#2d8c52",
  primaryDark: "#1a6b3c",
  primaryLight: "#3da866",
  secondary: "#a0522d",
  background: "#121212",
  surface: "#1e1e1e",
  text: "#e1e1e1",
  textSecondary: "#a0a0a0",
  textLight: "#707070",
  border: "#333333",
  error: "#e05050",
  success: "#2d8c52",
  warning: "#cc8800",
  white: "#ffffff",
};

type Theme = typeof lightColors;

interface ThemeContextType {
  isDark: boolean;
  toggle: () => void;
  colors: { light: typeof lightColors; dark: typeof darkColors };
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggle: () => {},
  colors: { light: lightColors, dark: darkColors },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const c = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark((v) => !v), colors: { light: lightColors, dark: darkColors } }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  return { isDark: ctx.isDark, toggle: ctx.toggle, colors: ctx.isDark ? darkColors : lightColors };
}
