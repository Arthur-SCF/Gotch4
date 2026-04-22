import { IconPalette } from "@tabler/icons-react";
import { useTheme, type ColorScheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const themes: { value: ColorScheme; label: string; description: string }[] = [
  {
    value: "default",
    label: "Default",
    description: "Clean neutral theme",
  },
  {
    value: "claude",
    label: "Claude",
    description: "Dark subtle theme",
  },
  {
    value: "yuzu",
    label: "Yuzu Marmalade",
    description: "Dark purple with yellow accents",
  },
  {
    value: "midnight-tokyo",
    label: "Midnight Tokyo",
    description: "Purple with white primary",
  },
  {
    value: "green-velvet",
    label: "Green Velvet",
    description: "Fresh green tones",
  },
  {
    value: "skillr",
    label: "Skillr v2",
    description: "Purple and pink tones",
  },
];

export function ThemeSelector() {
  const { colorScheme, setColorScheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="transition-transform hover:scale-110"
        >
          <IconPalette className="size-5" />
          <span className="sr-only">Select color theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {themes.map((theme) => (
          <DropdownMenuItem
            key={theme.value}
            onClick={() => setColorScheme(theme.value)}
            className="flex flex-col items-start gap-1 cursor-pointer"
          >
            <div className="flex items-center gap-2 w-full">
              <span className="font-medium">{theme.label}</span>
              {colorScheme === theme.value && (
                <span className="ml-auto text-xs">✓</span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {theme.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
