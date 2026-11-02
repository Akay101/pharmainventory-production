// True only in the build packaged inside the desktop app (desktop/scripts/prepare-web.js).
// The web app is unaffected: this is false there, and the bundler removes what it guards.
export const IS_DESKTOP = process.env.REACT_APP_DESKTOP === "true";

export const openCounters = () => window.davadeskDesktop?.openCounters();
