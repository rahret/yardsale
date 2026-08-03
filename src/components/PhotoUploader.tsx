"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ItemPhoto } from "@/lib/types";

const BUCKET = "item-photos";

export function photoUrl(path: string): string {
  const supabase = createClient();
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export default function PhotoUploader({
  saleId,
  itemId,
  photos,
  onChange,
}: {
  saleId: string;
  itemId: string;
  photos: ItemPhoto[];
  onChange: (photos: ItemPhoto[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | File[]) {
    const supabase = createClient();
    setUploading(true);
    setError("");
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    let nextPosition = photos.length;
    const newPhotos: ItemPhoto[] = [];

    for (const file of list) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `${saleId}/${itemId}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) {
        setError(upErr.message);
        continue;
      }
      const { data, error: insErr } = await supabase
        .from("item_photos")
        .insert({ item_id: itemId, storage_path: path, position: nextPosition })
        .select()
        .single();
      if (insErr) {
        setError(insErr.message);
        continue;
      }
      newPhotos.push(data);
      nextPosition += 1;
    }

    setUploading(false);
    if (newPhotos.length) onChange([...photos, ...newPhotos]);
  }

  async function deletePhoto(photo: ItemPhoto) {
    const supabase = createClient();
    await supabase.storage.from(BUCKET).remove([photo.storage_path]);
    await supabase.from("item_photos").delete().eq("id", photo.id);
    onChange(photos.filter((p) => p.id !== photo.id));
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center text-sm cursor-pointer transition-colors ${
          dragOver ? "border-grass bg-grass/10" : "border-cardboard-dark"
        }`}
      >
        {uploading ? "Uploading…" : "Drag photos here, or click to choose files"}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>
      {error && <div className="text-marker text-xs font-semibold mt-2">{error}</div>}

      {photos.length > 0 && (
        <div className="flex gap-2 flex-wrap mt-3">
          {photos.map((p) => (
            <div key={p.id} className="relative w-16 h-16">
              <img
                src={photoUrl(p.storage_path)}
                alt=""
                className="w-16 h-16 object-cover rounded-lg border-2 border-cardboard-dark"
              />
              <button
                type="button"
                onClick={() => deletePhoto(p)}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-marker text-white text-xs leading-5"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
