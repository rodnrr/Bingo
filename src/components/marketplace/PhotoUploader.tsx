import { useRef, useState } from 'react'
import { ImagePlus, Trash2, Star } from 'lucide-react'
import { uploadPhoto, deletePhoto, setCoverPhoto, nextPhotoPosition } from '@/lib/api'
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
 *
 * The first photo is the cover: it is what the browse grid, the
 * seller's own listings page, and every order summary show. So it has
 * to be choosable, not just whichever file the seller happened to pick
 * first in the dialog.
 */
export default function PhotoUploader({ userId, listingId, photos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pendingCover, setPendingCover] = useState<string | null>(null)

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
      // Read the next slot from the database rather than counting the
      // photos on screen: after a delete, positions have a gap, and a
      // count-based number collides with one already in use.
      let position = await nextPhotoPosition(listingId)

      // Sequential, not Promise.all: position must be deterministic, and
      // eight parallel uploads on a phone connection is how you get a
      // half-uploaded gallery.
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

  const handleCover = async (photo: ListingPhoto) => {
    setPendingCover(photo.id)
    try {
      await setCoverPhoto(listingId, photo.id)
      onChange()
      toast.success('Cover photo updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not set the cover')
    } finally {
      setPendingCover(null)
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((photo, i) => {
          const isCover = i === 0
          return (
            <div
              key={photo.id}
              className={
                'group relative aspect-square overflow-hidden rounded bg-panel2 ' +
                (isCover ? 'ring-1 ring-primary/60' : '')
              }
            >
              <img src={photo.url} alt="" className="h-full w-full object-cover" />

              {isCover && (
                <span className="badge-primary absolute left-1.5 top-1.5 bg-panel/85 backdrop-blur-sm">
                  Cover
                </span>
              )}

              {/* Actions sit under a scrim so they stay legible on a
                  pale photo. Revealed on hover, and on focus so the
                  keyboard path is not a dead end. */}
              <div className="absolute inset-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/70 via-transparent to-transparent p-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                {!isCover ? (
                  <button
                    type="button"
                    onClick={() => handleCover(photo)}
                    disabled={pendingCover !== null}
                    className="flex items-center gap-1 rounded bg-black/60 px-1.5 py-1 font-mono text-[9px] uppercase tracking-micro text-white backdrop-blur-sm transition-colors hover:text-primary disabled:opacity-50"
                    title="Use as the cover photo"
                  >
                    <Star className="h-3 w-3" />
                    {pendingCover === photo.id ? 'Setting' : 'Cover'}
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={() => handleDelete(photo)}
                  aria-label="Remove photo"
                  className="rounded bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:text-danger"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}

        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded border border-dashed border-line/20 text-fg-subtle transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
          >
            {busy ? <Spinner className="w-10" /> : <ImagePlus className="h-5 w-5" />}
            <span className="font-mono text-[9px] uppercase tracking-micro">
              {busy ? 'Uploading' : 'Add'}
            </span>
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
        The cover is what buyers see in the grid. Hover any photo to make it the cover
        or remove it. Up to {MAX_PHOTOS} photos, 5 MB each.
      </p>
    </div>
  )
}
