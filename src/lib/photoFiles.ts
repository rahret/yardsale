import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "item-photos";

/** Deletes photo files that no item uses any more. Call after deleting the
 * item_photos rows (or the item): a copied sale's items share the original
 * photo files, so a file is only removed once nothing refers to it. */
export async function removeUnusedPhotoFiles(supabase: SupabaseClient, paths: string[]): Promise<void> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (!unique.length) return;
  const { data, error } = await supabase.from("item_photos").select("storage_path").in("storage_path", unique);
  if (error) return; // keep the files rather than risk deleting one still in use
  const stillUsed = new Set((data || []).map((r: { storage_path: string }) => r.storage_path));
  const unused = unique.filter((p) => !stillUsed.has(p));
  for (let i = 0; i < unused.length; i += 100) {
    await supabase.storage.from(PHOTO_BUCKET).remove(unused.slice(i, i + 100));
  }
}
