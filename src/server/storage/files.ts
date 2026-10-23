export const VISIT_DOCUMENT_BUCKET = "visit-documents";
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const ALLOWED_DOCUMENT_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export type StoredFile = {
  bytes: Uint8Array;
  contentType: string;
};

export type FileStore = {
  available: boolean;
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<StoredFile | null>;
};

export function createMemoryFileStore(): FileStore {
  const files = new Map<string, StoredFile>();
  return {
    available: true,
    async put(path, bytes, contentType) {
      files.set(path, { bytes, contentType });
    },
    async get(path) {
      return files.get(path) ?? null;
    },
  };
}

export function createUnconfiguredFileStore(): FileStore {
  return {
    available: false,
    async put() {
      throw new Error("Document storage is not configured.");
    },
    async get() {
      return null;
    },
  };
}

export function createSupabaseFileStore(input: { url: string | null; serviceRoleKey: string | null }): FileStore {
  const url = input.url?.replace(/\/$/, "") ?? "";
  const key = input.serviceRoleKey ?? "";
  if (!url.startsWith("https://") || !key) return createUnconfiguredFileStore();

  const headers = {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
  let bucketReady: Promise<void> | null = null;

  async function ensureBucket() {
    const response = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        id: VISIT_DOCUMENT_BUCKET,
        name: VISIT_DOCUMENT_BUCKET,
        public: false,
        fileSizeLimit: String(MAX_UPLOAD_BYTES),
      }),
    });
    if (response.ok || response.status === 409) return;
    const body = await response.text();
    if (response.status === 400 && body.includes("already exists")) return;
    throw new Error("Document storage is not available.");
  }

  return {
    available: true,
    async put(path, bytes, contentType) {
      bucketReady ??= ensureBucket();
      await bucketReady;
      const response = await fetch(`${url}/storage/v1/object/${VISIT_DOCUMENT_BUCKET}/${path}`, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": contentType,
          "x-upsert": "true",
        },
        body: Buffer.from(bytes),
      });
      if (!response.ok) throw new Error("The document could not be stored.");
    },
    async get(path) {
      const response = await fetch(`${url}/storage/v1/object/${VISIT_DOCUMENT_BUCKET}/${path}`, { headers });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("The document could not be read.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { bytes, contentType: response.headers.get("content-type") || "application/octet-stream" };
    },
  };
}
