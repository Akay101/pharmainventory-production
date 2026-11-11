import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { ImagePlus, Loader2, RotateCw, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // what we accept before cropping; the crop itself is far smaller
const OUTPUT_SIZE = 512;
const MAX_ZOOM = 4;
const CROP_BOX = 220; // px on screen; fits inside the crop area on every screen width

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable image"));
    img.src = src;
  });

// `area` is in pixels of the rotated image, and may reach past its edges when zoomed out
const cropToBlob = async (src, area, rotation, type) => {
  const img = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const boxW = img.width * cos + img.height * sin;
  const boxH = img.width * sin + img.height * cos;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  }
  const scale = OUTPUT_SIZE / area.width;
  ctx.scale(scale, scale);
  ctx.translate(-area.x + boxW / 2, -area.y + boxH / 2);
  ctx.rotate(rad);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("crop failed"))), type, 0.9)
  );
};

function CropDialog({ source, title, shape, fitWhole, outputType, onCancel, onDone }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState(null);
  const [working, setWorking] = useState(false);

  const handleCropComplete = useCallback((_, pixels) => setArea(pixels), []);

  // A logo can be zoomed out until all of it fits, so wide logos aren't cut off
  const handleMediaLoaded = ({ width, height }) => {
    if (!fitWhole) return;
    const fit = CROP_BOX / Math.max(width, height);
    setMinZoom(fit);
    setZoom(fit);
  };

  const handleApply = async () => {
    if (!area) return;
    setWorking(true);
    try {
      onDone(await cropToBlob(source, area, rotation, outputType));
    } catch {
      toast.error("Couldn't crop this image. Please try a different one.");
      setWorking(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !working && onCancel()}>
      <DialogContent className="max-w-lg rounded-2xl border border-border bg-background shadow-2xl p-6 max-md:p-4" data-testid="image-crop-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Drag to position it and use the slider to zoom. It's only saved when you press Update.
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-72 max-md:h-64 w-full overflow-hidden rounded-xl bg-muted" data-testid="image-cropper">
          <Cropper
            image={source}
            crop={crop}
            zoom={zoom}
            minZoom={minZoom}
            maxZoom={MAX_ZOOM}
            rotation={rotation}
            aspect={1}
            cropSize={{ width: CROP_BOX, height: CROP_BOX }}
            objectFit="cover"
            cropShape={shape}
            showGrid={shape === "rect"}
            restrictPosition={!fitWhole}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
            onMediaLoaded={handleMediaLoaded}
          />
        </div>

        <div className="flex items-center gap-3">
          <ZoomOut className="w-4 h-4 text-muted-foreground shrink-0" />
          <Slider
            aria-label="Zoom"
            value={[zoom]}
            min={minZoom}
            max={MAX_ZOOM}
            step={0.01}
            onValueChange={([value]) => setZoom(value)}
            className="flex-1"
            data-testid="image-crop-zoom"
          />
          <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 ml-1"
            aria-label="Rotate 90 degrees"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            data-testid="image-crop-rotate"
          >
            <RotateCw className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={working} className="max-md:flex-1">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={working || !area}
            className="btn-primary max-md:flex-1"
            data-testid="image-crop-apply"
          >
            {working && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Use this image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Choose, crop and preview an image. Nothing is uploaded here: the crop goes to
 * the parent as a draft ({ blob, url } or { removed: true }), which it sends when
 * the user presses Update.
 */
export default function ImageCropField({
  label,
  currentUrl,
  fallback,
  shape = "rect",
  fitWhole = false,
  outputType = "image/jpeg",
  draft,
  onDraftChange,
  disabled = false,
  busy = false,
  percent = null,
  testId,
}) {
  const inputRef = useRef(null);
  const [source, setSource] = useState(null);

  useEffect(() => () => source && URL.revokeObjectURL(source), [source]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // choosing the same file again must still fire
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      toast.error("Please choose a JPG, PNG or WebP image");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error("That image is over 15 MB. Please choose a smaller one.");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      await loadImage(url);
      setSource(url);
    } catch {
      URL.revokeObjectURL(url);
      toast.error("We couldn't read that image. Please use a JPG, PNG or WebP.");
    }
  };

  const shownUrl = draft?.removed ? null : draft?.url || currentUrl;
  const canRemove = !draft?.removed && !draft?.url && !!currentUrl;
  const rounded = shape === "round" ? "rounded-full" : "rounded-2xl";

  return (
    <div className="flex items-center gap-4 min-w-0">
      <div className={cn("relative w-24 h-24 shrink-0 overflow-hidden border border-border/70 shadow-sm", rounded, shownUrl ? "bg-white" : "bg-primary/10")}>
        {shownUrl ? (
          <img src={shownUrl} alt={label} className={cn("w-full h-full", shape === "round" ? "object-cover" : "object-contain")} data-testid={testId && `${testId}-preview`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-primary/60">{fallback}</div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-sm font-bold tabular-nums" data-testid={testId && `${testId}-overlay`}>
            {percent === null ? <Loader2 className="w-5 h-5 animate-spin" /> : `${percent}%`}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-2">
        {draft ? (
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400" data-testid={testId && `${testId}-pending`}>
            {draft.removed ? "Will be removed when you press Update" : "New image. Not saved until you press Update"}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Square image, JPG, PNG or WebP.</p>
        )}
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()} data-testid={testId && `${testId}-choose`}>
              <ImagePlus className="w-4 h-4 mr-1.5" />
              {shownUrl ? "Change" : "Choose image"}
            </Button>
            {canRemove && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onDraftChange({ removed: true })} data-testid={testId && `${testId}-remove`}>
                <Trash2 className="w-4 h-4 mr-1.5" />
                Remove
              </Button>
            )}
            {draft && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onDraftChange(null)} data-testid={testId && `${testId}-undo`}>
                <Undo2 className="w-4 h-4 mr-1.5" />
                Undo
              </Button>
            )}
          </div>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} data-testid={testId && `${testId}-input`} />

      {source && (
        <CropDialog
          source={source}
          title={`Crop ${label.toLowerCase()}`}
          shape={shape}
          fitWhole={fitWhole}
          outputType={outputType}
          onCancel={() => setSource(null)}
          onDone={(blob) => {
            onDraftChange({ blob, url: URL.createObjectURL(blob) });
            setSource(null);
          }}
        />
      )}
    </div>
  );
}
