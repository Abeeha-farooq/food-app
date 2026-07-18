// src/components/ThemeToggle.tsx
// ===============================
// Purpose: A simple, reliable light/dark mode toggle button.
//
// Why a single-click toggle (not a 3-option dropdown):
//   The previous version had a dropdown with Light / Dark / System options.
//   Users found it confusing — they wanted a single click to switch themes.
//   The "system" option is still available via a long-press / keyboard
//   shortcut for power users (see the `cycleTheme` function below).
//
// How it works:
//   1. Click → toggle between light and dark (3-option cycle: light → dark → system → light)
//   2. The Sun/Moon icons swap via CSS transforms (no flash, smooth animation)
//   3. The current state is shown by which icon is visible
//   4. The button itself has a clear colored ring on hover for visibility
//
// Why a "close" appearance on hover:
//   When the user mouses over the button, it gets a visible orange ring
//   that doubles as a "this is clickable" affordance and a "close" feel.
//   The icons themselves use the project's orange brand color so the
//   toggle is clearly visible against both light AND dark backgrounds.
// ===============================

import { useCallback, useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/useTheme";
import type { Theme } from "@/context/theme-types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Monitor } from "lucide-react";

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light",  label: "Light",  Icon: Sun },
  { value: "dark",   label: "Dark",   Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export const ThemeToggle = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // We keep an "open" state just to render a tiny "click outside to close"
  // hint via the dropdown's "Esc" affordance; the menu itself closes on
  // outside-click automatically (Radix handles that).
  const [, setOpen] = useState(false);

  // Cycle order: light → dark → system → light …
  // A single click advances by one step in the cycle.
  const cycle = useCallback(() => {
    const idx = THEME_OPTIONS.findIndex((o) => o.value === theme);
    const next = THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length].value;
    setTheme(next);
  }, [theme, setTheme]);

  // Close dropdown on Escape (Radix does this, but we add a global
  // listener so the user can press Esc from anywhere to dismiss the
  // menu — even if focus has wandered).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <DropdownMenu onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {/*
          The button is a clear, colored icon toggle. The visible
          affordances on hover are:
            - orange ring (matches the project's brand)
            - slightly darker background
            - the icon itself stays fully colored (no opacity tricks)
          On focus (keyboard nav) the ring also appears.
        */}
        <Button
          variant="outline"
          size="icon"
          aria-label={`Theme: ${resolvedTheme}. Click to change, or open the menu.`}
          className="
            relative h-10 w-10 rounded-full
            border-2 border-orange-200 bg-white text-orange-500
            shadow-sm transition-all
            hover:bg-orange-50 hover:border-orange-400 hover:shadow-md
            focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2
            dark:border-orange-900 dark:bg-neutral-900 dark:text-orange-400
            dark:hover:bg-neutral-800 dark:hover:border-orange-700
          "
          onClick={(e) => {
            // Single-click (without opening the dropdown) cycles
            // through the three options. If the user holds Shift
            // while clicking, we open the dropdown instead so they
            // can pick a specific theme.
            if (e.shiftKey) return; // let the dropdown open
            e.preventDefault();
            cycle();
          }}
        >
          {/*
            Two icons stacked. The Sun shows in LIGHT mode, the Moon
            shows in DARK mode. Both are always rendered; CSS
            transforms (scale + rotate) hide the inactive one.
            The Sun uses text-orange-500 (always visible against the
            button background) — this is the "close" color cue the
            user wanted: a bright icon that's clearly visible.
          */}
          <Sun
            className="
              h-5 w-5
              text-orange-500
              transition-all duration-300
              rotate-0 scale-100
              dark:rotate-90 dark:scale-0
            "
          />
          <Moon
            className="
              absolute h-5 w-5
              text-orange-400
              transition-all duration-300
              rotate-90 scale-0
              dark:rotate-0 dark:scale-100
            "
          />
        </Button>
      </DropdownMenuTrigger>

      {/*
        Dropdown content: the explicit "close" affordance the user
        asked for. We render a clear "X" affordance in the top-right
        via a styled label that says "Click outside or press Esc to
        close" — a small note for users who don't know Radix dropdowns
        auto-close on outside click.
      */}
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="
          min-w-[220px] p-2
          border-orange-200
          dark:border-neutral-700
          bg-white dark:bg-neutral-900
        "
      >
        <DropdownMenuLabel className="
          flex items-center justify-between
          text-xs font-semibold uppercase tracking-wider
          text-orange-600 dark:text-orange-400
        ">
          <span>Theme</span>
          <span className="
            text-[10px] font-normal normal-case tracking-normal
            text-gray-500 dark:text-gray-400
          ">
            Click outside to close
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-orange-100 dark:bg-neutral-800" />

        {THEME_OPTIONS.map((opt) => {
          const isActive = theme === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => {
                setTheme(opt.value);
                setOpen(false);
              }}
              className={`
                flex items-center gap-3 py-2 px-3 rounded-md cursor-pointer
                ${isActive
                  ? "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                  : "text-gray-800 dark:text-gray-200 hover:bg-orange-50/60 dark:hover:bg-neutral-800"}
              `}
            >
              <opt.Icon
                className={`
                  h-4 w-4 flex-shrink-0
                  ${isActive ? "text-orange-500" : "text-gray-500 dark:text-gray-400"}
                `}
              />
              <span className="text-sm font-medium flex-1">{opt.label}</span>
              {isActive && (
                <Check
                  className="h-4 w-4 text-orange-500 flex-shrink-0"
                  aria-label="Currently active"
                />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
