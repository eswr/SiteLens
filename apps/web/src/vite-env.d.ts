/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the SiteLens API (e.g. http://localhost:4000). Optional. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
