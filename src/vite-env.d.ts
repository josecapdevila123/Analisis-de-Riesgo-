/// <reference types="vite/client" />

interface ImportMetaEnv {
  // "true" para usar el emulador local de Cloud Functions (ver README).
  readonly VITE_FUNCTIONS_EMULATOR?: string;
}
