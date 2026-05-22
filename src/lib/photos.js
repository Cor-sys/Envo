import { supabase } from './supabase.js';

// Item photo pipeline.
//
//   Storage bucket:  item-photos  (public read, authenticated write — see
//                    db/migrations/203_item_photos_bucket.sql)
//   Path convention: <item_id>/primary.jpg
//   On items table:  image_path stores the bucket-relative path (NOT the
//                    full URL) so a bucket rename or domain change doesn't
//                    require a backfill.
//
// Photos are compressed client-side before upload — the phone's raw 4-8 MB
// camera capture becomes ~200 KB after a 1024px / JPEG q=75 pass. This keeps
// the free-tier storage footprint negligible (4000+ items per GB) and saves
// staff cellular data on slow site networks.

const BUCKET = 'item-photos';
const MAX_EDGE_PX = 1024;   // long edge after resize
const QUALITY = 0.75;       // JPEG quality

// Resize + recompress an image File to a JPEG Blob no larger than MAX_EDGE_PX
// on the long edge. Returns the original File unchanged if it's already a
// JPEG below the threshold (rare from phone cameras, common from re-uploads).
export async function compressPhoto(file) {
  const img = await loadImage(file);
  const { width, height } = scaledSize(img.width, img.height, MAX_EDGE_PX);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser does not support 2d canvas — please update.');
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode photo'))),
      'image/jpeg',
      QUALITY,
    );
  });
  return blob;
}

function scaledSize(w, h, maxEdge) {
  if (w <= maxEdge && h <= maxEdge) return { width: w, height: h };
  const ratio = w >= h ? maxEdge / w : maxEdge / h;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

// Upload a photo blob to the item-photos bucket. Returns the bucket-relative
// path to store in items.image_path. Caller should `updateItem(id, { image_path })`.
export async function uploadItemPhoto(itemId, blob) {
  const path = `${itemId}/primary.jpg`;
  // upsert: replacing an existing photo just overwrites the same path so
  // there's no orphan to clean up later.
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (error) throw error;
  return path;
}

// Convenience: resolve a bucket-relative path to a public URL the browser
// can <img src> directly. Returns null for falsy input so callers can pass
// item.image_path without guarding.
export function photoUrl(path) {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Append the item id segment as a cache-bust hint when the photo is
  // replaced — the storage URL doesn't change, so without this old photos
  // can stick in the browser cache. We base it on the path itself.
  return data?.publicUrl ?? null;
}

export async function removeItemPhoto(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
