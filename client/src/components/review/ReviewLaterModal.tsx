import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ReviewLaterModalProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ReviewLaterModal({ sessionId, isOpen, onClose }: ReviewLaterModalProps) {
  const [link, setLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const generateLink = async () => {
    setLoading(true);
    try {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/review/generate-link`);
      const data = await response.json();
      setLink(data.url);
      setExpiresAt(new Date(data.expiresAt));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate review link",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      setLink(null);
      setExpiresAt(null);
      setCopied(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="modal-review-later">
        <DialogHeader>
          <DialogTitle>Review Later</DialogTitle>
          <DialogDescription>
            Generate a link to return and complete your review within 48 hours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {!link ? (
            <Button 
              onClick={generateLink} 
              disabled={loading} 
              className="w-full"
              data-testid="button-generate-link"
            >
              {loading ? "Generating..." : "Generate Review Link"}
            </Button>
          ) : (
            <>
              <div className="flex gap-2">
                <Input 
                  value={link} 
                  readOnly 
                  className="font-mono text-sm" 
                  data-testid="input-review-link"
                />
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={copyLink}
                  data-testid="button-copy-link"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>

              {expiresAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  Expires: {expiresAt.toLocaleString()}
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Save this link - you can return within 48 hours to complete your review.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
