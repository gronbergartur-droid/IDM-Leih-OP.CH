/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_TESSERACT_LANG_PATH?: string;
  readonly VITE_IDM_AI_AGENT_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
