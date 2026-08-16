import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { uploadPhoto, deletePhoto } from '@/lib/api'
import { toast } from '@/lib/store'
import { Spinner } from '@/components/ui'
import type { ListingPhoto } from '@/types'

const MAX_PHOTOS = 8
const MAX_BYTES = 5 * 1024 * 1024   // matches the bucket's file_size_limit

interface Props {
  userId: string
  listingId: string
  photos: ListingPhoto[]
  onChange: () => void
}

/**
 * Photos upload immediately rather than being staged until save. That
 * requires the listing row to exist first — which is why SellPage
 * creates the listing as a draft before showing this component.
 */
export default function PhotoUploader({ userId, listingId, photos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return

    const room = MAX_PHOTOS - photos.length
    if (room <= 0) {
      toast.error(`${MAX_PHOTOS} photos is the limit`)
      return
    }

    const chosen = Array.from(files).slice(0, room)
    const tooBig = chosen.find((f) => f.size > MAX_BYTES)
    if (tooBig) {
      toast.error(`"${tooBig.name}" is over 5 MB — the upload would be rejected`)
      return
    }

    setBusy(true)
    try {
      // Sequential, not Promise.all: position must be deterministic, and
      // eight parallel uploads on a phone connection is how you get a
      // half-uploaded gallery.
      let position = photos.length
      for (const file of chosen) {
        await uploadPhoto(userId, listingId, file, position)
        position += 1
      }
      onChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async (photo: ListingPhoto) => {
    try {
      await deletePhoto(photo.id, photo.storage_path)
      onChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove that photo')
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((photo, i) => (
          <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl bg-panel2">
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Cover
              </span>
            )}
            <button
              type="button"
              onClick={() => handleDelete(photo)}
              aria-label="Remove photo"
              className="absolute right-1 top-1 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line/10 text-fg-subtle transition-colors hover:border-primary hover:text-primary disabled:opacity-50 "
          >
            {busy ? <Spinner className="h-5 w-5" /> : <ImagePlus className="h-6 w-6" />}
            <span className="text-xs">{busy ? 'Uploading' : 'Add'}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <p className="hint">
        First photo is the cover. Up to {MAX_PHOTOS} photos, 5 MB each.
      </p>
    </div>
  )
}
