// src/components/ThemeToggle.tsx
// ===============================
// Purpose: The light / dark / system theme switcher used in the navbar
//          (both desktop dropdown and mobile menu).
//
// How it works:
//   - Reads `theme` (the user's preference) and `setTheme` from useTheme
//   - Renders a Sun icon when resolvedTheme is "light", Moon when "dark"
//     (the icons are absolutely positioned and swap via CSS transforms)
//   - Dropdown has three items: Light, Dark, System
//   - The currently-active theme shows a checkmark on the right
//   - The whole control is keyboard-accessible (Radix handles focus + ARIA)
//
// Why a single component for both desktop and mobile:
//   One implementation means one source of truth for the theme UI.
//   NavBar just drops in <ThemeToggle /> wherever it needs the toggle
//   (e.g. desktop right-side controls, mobile menu).
// ===============================

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme } from "@/context/useTheme";
import type { Theme } from "@/context/theme-types";

// Single source of truth for the dropdown rows. Keeping this array
// outside the component means the React reconciler doesn't see a new
// array on every render (avoids unnecessary re-renders in children).
const THEME_OPTIONS: { value: Theme; label: string; description: string; Icon: typeof Sun }[] = [
  { value: "light",  label: "Light",  description: "Always light",          Icon: Sun },
  { value: "dark",   label: "Dark",   description: "Always dark",           Icon: Moon },
  { value: "system", label: "System", description: "Follow OS preference",  Icon: Monitor },
];

export const ThemeToggle = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The button shows a Sun in light mode, Moon in dark mode.
            The Sun is always rendered but rotates/scales out of view
            in dark mode; the Moon is the opposite. This is the same
            animation pattern shadcn/ui uses — feels premium, no flash. */}
        <Button
          variant="outline"
          size="icon"
          aria-label={`Theme: ${resolvedTheme}. Click to change.`}
        >
          <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {THEME_OPTIONS.map((opt) => {
          const isActive = theme === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              // The `inset` class would indent the item (used when an
              // item is preceded by an icon column). We use a custom
              // row layout instead, with a checkmark on the right.
              onSelect={(e) => {
                // Prevent the menu from auto-closing in the middle of
                // the click cycle — Radix closes onSelect by default;
                // calling e.preventDefault() keeps it open until the
                // click finishes (UX: instant feedback, no flicker).
                e.preventDefault();
                setTheme(opt.value);
                // Close the menu manually after the state updates
                // (Radix docs recommend a microtask close).
                queueMicrotask(() => {
                  document.body.click();
                });
              }}
              className="flex items-center gap-2 cursor-pointer py-2 px-2 rounded-md focus:bg-orange-50"
            >
              <opt.Icon className="h-4 w-4 text-gray-600" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900">
                  {opt.label}
                </span>
                <span className="text-[11px] text-gray-500">
                  {opt.description}
                </span>
              </div>
              {/* Checkmark on the right, ONLY for the currently-active
                  theme. Sized to match the 16px icon for visual balance. */}
              {isActive && (
                <Check className="h-4 w-4 text-orange-500 flex-shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
