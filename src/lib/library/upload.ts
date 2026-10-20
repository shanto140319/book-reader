// Resumable book upload to Supabase Storage (TUS protocol, via tus-js-client).
//
// The file goes up in 6 MB pieces. A dropped connection (common on phones) retries and carries
// on from the last piece instead of starting over. If the page is closed mid-upload, picking the
// same file again within 24 hours continues the old upload: the browser remembers it (by file
// name, size and date) in localStorage, and the book keeps the id it was given the first time.

import type { DetailedError, Upload } from "tus-js-client";

const BUCKET = "books";
/** Supabase requires exactly 6 MB pieces. */
const CHUNK_SIZE = 6 * 1024 * 1024;

export type ResumableUpload = {
  /** The book id: new, or the one from an unfinished upload of the same file. */
  id: string;
  start: (onProgress: (sent: number, total: number) => void) => Promise<void>;
};

/**
 * Prepares the upload of `file` to `<uid>/<book id>.pdf`. Call `start()` to send it.
 * `token` is asked for before every request, so a long upload survives a session refresh.
 */
export async function prepareUpload(file: File, uid: string, token: () => Promise<string>): Promise<ResumableUpload> {
  const { Upload } = await import("tus-js-client");
  const upload: Upload = new Upload(file, {
    endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
    chunkSize: CHUNK_SIZE,
    retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    async onBeforeRequest(req) {
      req.setHeader("authorization", `Bearer ${await token()}`);
    },
  });

  // An unfinished upload of this same file by this user: keep its book id, so it resumes.
  const prefix = `${uid}/`;
  const previous = (await upload.findPreviousUploads().catch(() => [])).find((p) =>
    p.metadata.objectName?.startsWith(prefix),
  );
  const id = previous ? previous.metadata.objectName.slice(prefix.length).replace(/\.pdf$/, "") : crypto.randomUUID();

  upload.options.metadata = {
    bucketName: BUCKET,
    objectName: `${prefix}${id}.pdf`,
    contentType: "application/pdf",
    cacheControl: "3600",
  };
  if (previous) upload.resumeFromPreviousUpload(previous);

  return {
    id,
    start: (onProgress) =>
      new Promise<void>((resolve, reject) => {
        upload.options.onProgress = onProgress;
        upload.options.onSuccess = () => resolve();
        upload.options.onError = (error) => reject(new Error(uploadMessage(error)));
        upload.start();
      }),
  };
}

function uploadMessage(error: Error | DetailedError) {
  console.error(error);
  const status = "originalResponse" in error ? error.originalResponse?.getStatus() : undefined;
  if (status === 413) return "That file is over the 50 MB limit.";
  if (status === 401 || status === 403) return "You're signed out. Please sign in again.";
  return "Upload failed. Check your connection and try again — it will continue where it stopped.";
}
