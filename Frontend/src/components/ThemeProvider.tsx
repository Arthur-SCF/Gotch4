import { createContext, useContext, useEffect, useState } from "react";

type Mode = "light" | "dark";
type ColorScheme = "default" | "yuzu" | "green-velvet" | "midnight-tokyo" | "claude" | "skillr";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultMode?: Mode;
  defaultColorScheme?: ColorScheme;
  storageKey?: string;
};

type ThemeProviderState = {
  mode: Mode;
  colorScheme: ColorScheme;
  setMode: (mode: Mode) => void;
  setColorScheme: (colorScheme: ColorScheme) => void;
  toggleMode: () => void;
};

const initialState: ThemeProviderState = {
  mode: "light",
  colorScheme: "default",
  setMode: () => null,
  setColorScheme: () => null,
  toggleMode: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultMode = "light",
  defaultColorScheme = "default",
  storageKey = "ui-theme",
  ...props
}: ThemeProviderProps) {
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem(`${storageKey}-mode`) as Mode) || defaultMode
  );
  const [colorScheme, setColorScheme] = useState<ColorScheme>(
    () => (localStorage.getItem(`${storageKey}-color`) as ColorScheme) || defaultColorScheme
  );

  useEffect(() => {
    const root = window.document.documentElement;

    // Remove all mode classes
    root.classList.remove("light", "dark");
    root.classList.add(mode);

    // Set color scheme as data attribute
    root.setAttribute("data-theme", colorScheme);
  }, [mode, colorScheme]);

  const value = {
    mode,
    colorScheme,
    setMode: (newMode: Mode) => {
      localStorage.setItem(`${storageKey}-mode`, newMode);
      setMode(newMode);
    },
    setColorScheme: (newColorScheme: ColorScheme) => {
      localStorage.setItem(`${storageKey}-color`, newColorScheme);
      setColorScheme(newColorScheme);
    },
    toggleMode: () => {
      const newMode = mode === "light" ? "dark" : "light";
      localStorage.setItem(`${storageKey}-mode`, newMode);
      setMode(newMode);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};

// Export types for use in other components
export type { Mode, ColorScheme };
