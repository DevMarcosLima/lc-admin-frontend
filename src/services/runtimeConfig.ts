type RuntimeConfig = Record<string, string | undefined>;

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfig;
  }
}

function readWindowConfig(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const value = window.__APP_CONFIG__?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function readRuntimeEnv(key: string): string {
  const fromWindow = readWindowConfig(key);
  if (fromWindow) {
    return fromWindow;
  }

  const metaEnv = import.meta.env as unknown as Record<string, string | undefined>;
  const fromBuild = metaEnv[key];
  return typeof fromBuild === "string" ? fromBuild.trim() : "";
}

