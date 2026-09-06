import { isPostgresConfigured } from "@/lib/config";
import { FileOrderStore } from "@/lib/store/file-store";
import { PostgresOrderStore } from "@/lib/store/pg-store";
import type { OrderStore } from "@/lib/store/types";

export * from "@/lib/store/types";

declare global {
  // Reused across hot reloads so the Postgres pool isn't recreated every edit.
  var __pullvinreportStore: OrderStore | undefined;
}

/**
 * Postgres when DATABASE_URL is set, otherwise a local JSON file so the demo
 * runs with zero infrastructure.
 */
export function getStore(): OrderStore {
  if (!globalThis.__pullvinreportStore) {
    globalThis.__pullvinreportStore = isPostgresConfigured()
      ? new PostgresOrderStore()
      : new FileOrderStore();
  }
  return globalThis.__pullvinreportStore;
}
