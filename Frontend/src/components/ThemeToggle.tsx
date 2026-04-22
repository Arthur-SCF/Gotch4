import { IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { mode, toggleMode } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleMode}
      className="transition-transform hover:scale-110"
    >
      <span className="transition-transform hover:scale-110 inline-flex items-center">
        {mode === "dark" ? (
          <IconSun className="size-5" />
        ) : (
          <IconMoon className="size-5" />
        )}
      </span>
      <span className="sr-only">Toggle light/dark mode</span>
    </Button>
  );
}
