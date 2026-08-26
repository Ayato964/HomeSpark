/**
 * Single source of truth for the app version shown in the UI.
 *
 * The real value lives in `package.json` (which is also what electron-builder
 * stamps into the installer and what `app.getVersion()` returns). `next.config.ts`
 * copies it into `NEXT_PUBLIC_APP_VERSION` at build time, so no component has to
 * hardcode a version string.
 *
 * On the desktop app prefer `electronAPI.getAppVersion()` where an await is
 * acceptable - that reads the installed build's real version, which is
 * authoritative after an auto-update. Use `APP_VERSION` as the synchronous
 * initial value / web fallback.
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || '3.3.1';
