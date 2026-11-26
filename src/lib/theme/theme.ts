/** Theme choice, stored per device in a cookie (not the database) and read on the server for the first paint. */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "system";
export const THEME_COOKIE = "ezh-theme";

export const parseTheme = (value: string | null | undefined): Theme =>
  (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : DEFAULT_THEME;

/** Cookie string for `document.cookie`: one year, whole site. */
export const themeCookie = (theme: Theme): string => `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;

/** Browser only: show the theme now and remember it on this device. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.cookie = themeCookie(theme);
}
