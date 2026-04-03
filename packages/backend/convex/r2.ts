import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

export const r2 = new R2(components.r2);

/** Client API consumed by the useUploadFile hook on the frontend. */
export const { generateUploadUrl, syncMetadata } = r2.clientApi<DataModel>({
  checkUpload: async (_ctx, _bucket) => {
    // TODO: add auth check
  },
  onUpload: async (_ctx, _bucket, _key) => {
    // Keys are tracked in messages — no extra action needed
  },
});
