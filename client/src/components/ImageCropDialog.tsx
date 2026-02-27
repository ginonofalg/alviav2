import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut } from "lucide-react";
import { cropAndCompress } from "@/lib/image-utils";

interface ImageCropDialogProps {
  open: boolean;
  imageSrc: string | null;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

export default function ImageCropDialog({
  open,
  imageSrc,
  onConfirm,
  onCancel,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setProcessing(true);
    try {
      const result = await cropAndCompress(imageSrc, croppedAreaPixels);
      onConfirm(result);
    } catch {
      onCancel();
    } finally {
      setProcessing(false);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  };

  const handleCancel = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crop Your Logo</DialogTitle>
        </DialogHeader>

        <div className="relative w-full aspect-square bg-muted rounded-lg overflow-hidden">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              cropShape="rect"
              showGrid={false}
            />
          )}
        </div>

        <div className="flex items-center gap-3 px-2">
          <ZoomOut className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.05}
            onValueChange={([v]) => setZoom(v)}
            data-testid="slider-zoom"
          />
          <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={processing}
            data-testid="button-crop-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={processing || !croppedAreaPixels}
            data-testid="button-crop-confirm"
          >
            {processing ? "Processing..." : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
