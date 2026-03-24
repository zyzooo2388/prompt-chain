"use client";

import { ChangeEvent, useEffect, useSyncExternalStore } from "react";

import { useTheme } from "next-themes";

type ThemePreference = "system" | "light" | "dark";

export function ThemeToggle() {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const value: ThemePreference = mounted && theme ? (theme as ThemePreference) : "system";

  useEffect(() => {
    if (!mounted) {
      return;
    }

    console.info("[theme-toggle] theme state", { theme, resolvedTheme });
  }, [mounted, resolvedTheme, theme]);

  function handleThemeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextTheme = event.target.value as ThemePreference;
    setTheme(nextTheme);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        console.info("[theme-toggle] html className after switch", {
          className: document.documentElement.className,
          hasDarkClass: document.documentElement.classList.contains("dark"),
        });
      });
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700 transition-colors duration-200 dark:text-zinc-300">
      Theme
      <select
        aria-label="Theme selector"
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none ring-offset-2 transition-colors duration-200 focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-zinc-600"
        suppressHydrationWarning
        value={value}
        onChange={handleThemeChange}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
