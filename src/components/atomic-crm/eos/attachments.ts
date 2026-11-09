import { getSupabaseClient } from "../providers/supabase/supabase";
import { EOS_BUCKET, EOS_MAX_UPLOAD_BYTES } from "./constants";
import { isBlockedFile, normalizeLinks, sanitizeFileName } from "./links";

export type EosAttachment = {
  path: string;
  title: string;
  type?: string;
  size?: number;
  uploaded_at: string;
  bucket?: string;
};

/**
 * Reuses Atomic's note-attachment pattern (dataProvider lifecycle beforeSave +
 * Supabase Storage upload, see providers/supabase/dataProvider.ts uploadToBucket)
 * but targets a PRIVATE bucket and stores only the object path (no public URL).
 */
export const eosBeforeSave = async (data: any, bucket: string = EOS_BUCKET) => {
  const out = { ...data };
  // Partial updates (e.g. quick-classify sends only {direction}) must not touch
  // attachments: leave the key absent so the stored references are preserved.
  const touchesAttachments = "attachments" in out || "new_files" in out;
  const newFiles: any[] = out.new_files ?? [];
  delete out.new_files;
  const existing: EosAttachment[] = Array.isArray(out.attachments)
    ? out.attachments
    : [];
  const uploaded: EosAttachment[] = [];
  for (const fi of newFiles) {
    const file: File | undefined = fi?.rawFile;
    if (!file) continue;
    if (file.size > EOS_MAX_UPLOAD_BYTES)
      throw new Error(`${file.name}: exceeds 10 MiB limit`);
    if (isBlockedFile(file.name, file.type))
      throw new Error(`${file.name}: file type not allowed`);
    const path = `${crypto.randomUUID()}/${sanitizeFileName(file.name)}`;
    const { error } = await getSupabaseClient()
      .storage.from(bucket)
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    uploaded.push({
      path,
      title: file.name,
      type: file.type,
      size: file.size,
      uploaded_at: new Date().toISOString(),
      ...(bucket !== EOS_BUCKET ? { bucket } : {}),
    });
  }
  if (touchesAttachments) out.attachments = [...existing, ...uploaded];
  if ("links" in out) out.links = normalizeLinks(out.links);
  // computed/view-only fields never written
  delete out.revision;
  return out;
};

export const openSignedAttachment = async (
  path: string,
  bucket: string = EOS_BUCKET,
) => {
  const { data, error } = await getSupabaseClient()
    .storage.from(bucket)
    .createSignedUrl(path, 60);
  if (error || !data) throw new Error(error?.message ?? "Cannot sign URL");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
};
