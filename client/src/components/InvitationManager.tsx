import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Copy,
  UserPlus,
  Upload,
  Mail,
  CheckCircle2,
  Clock,
  MousePointer,
  MessageSquare,
  Link2,
  ExternalLink,
  QrCode,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequestJson, queryClient } from "@/lib/queryClient";
import type { Respondent } from "@shared/schema";

interface InvitationManagerProps {
  collectionId: string;
  shareUrl: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  invited: { label: "Invited", color: "bg-gray-100 text-gray-700", icon: Clock },
  clicked: { label: "Clicked", color: "bg-blue-100 text-blue-700", icon: MousePointer },
  consented: { label: "Consented", color: "bg-purple-100 text-purple-700", icon: CheckCircle2 },
  completed: { label: "Completed", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
};

export function InvitationManager({ collectionId, shareUrl }: InvitationManagerProps) {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [csvData, setCsvData] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<SVGSVGElement>(null);

  const { data: respondents, isLoading: isLoadingRespondents } = useQuery<Respondent[]>({
    queryKey: ["/api/collections", collectionId, "respondents"],
  });

  const inviteSingleMutation = useMutation({
    mutationFn: async (data: { email?: string; fullName?: string }) => {
      return apiRequestJson<Respondent>(
        "POST",
        `/api/collections/${collectionId}/respondents`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections", collectionId, "respondents"] });
      setAddDialogOpen(false);
      setFullName("");
      setEmail("");
      toast({
        title: "Respondent invited",
        description: "A unique invitation link has been created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to invite",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkInviteMutation = useMutation({
    mutationFn: async (respondentsList: Array<{ email?: string; fullName?: string }>) => {
      return apiRequestJson<{ created: number; skipped: number; respondents: Respondent[] }>(
        "POST",
        `/api/collections/${collectionId}/respondents/bulk`,
        { respondents: respondentsList }
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections", collectionId, "respondents"] });
      setCsvData("");
      toast({
        title: "Bulk import complete",
        description: `${data.created} respondents added, ${data.skipped} skipped (duplicates).`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast({
      title: "Link copied",
      description: "Share link copied to clipboard",
    });
  };

  const downloadQRCode = () => {
    const svg = qrRef.current;
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      
      const pngUrl = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `interview-qr-${collectionId.slice(0, 8)}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  const copyRespondentLink = (token: string) => {
    const link = `${shareUrl}?t=${token}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link copied",
      description: "Personal invitation link copied",
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() && !email.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide at least a name or email",
        variant: "destructive",
      });
      return;
    }
    inviteSingleMutation.mutate({
      fullName: fullName.trim() || undefined,
      email: email.trim() || undefined,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvData(content);
    };
    reader.readAsText(file);
  };

  const handleBulkImport = () => {
    if (!csvData.trim()) {
      toast({
        title: "No data",
        description: "Please paste CSV data or upload a file",
        variant: "destructive",
      });
      return;
    }

    const lines = csvData.trim().split("\n");
    const respondentsList: Array<{ email?: string; fullName?: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(",").map(p => p.trim().replace(/^["']|["']$/g, ""));
      
      if (i === 0 && (parts[0].toLowerCase() === "email" || parts[0].toLowerCase() === "name")) {
        continue;
      }

      if (parts.length >= 2) {
        respondentsList.push({
          email: parts[0] || undefined,
          fullName: parts[1] || undefined,
        });
      } else if (parts.length === 1) {
        const value = parts[0];
        if (value.includes("@")) {
          respondentsList.push({ email: value });
        } else {
          respondentsList.push({ fullName: value });
        }
      }
    }

    if (respondentsList.length === 0) {
      toast({
        title: "No valid entries",
        description: "Could not parse any respondents from the data",
        variant: "destructive",
      });
      return;
    }

    bulkInviteMutation.mutate(respondentsList);
  };

  const invitedRespondents = respondents?.filter(r => r.invitationToken) || [];
  const statusCounts = {
    invited: invitedRespondents.filter(r => r.invitationStatus === "invited").length,
    clicked: invitedRespondents.filter(r => r.invitationStatus === "clicked").length,
    consented: invitedRespondents.filter(r => r.invitationStatus === "consented").length,
    completed: invitedRespondents.filter(r => r.invitationStatus === "completed").length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <CardTitle>Invite Respondents</CardTitle>
            <CardDescription>
              Share the public link or invite specific people with trackable links
            </CardDescription>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="shrink-0" data-testid="button-add-respondent">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Respondent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Respondent</DialogTitle>
                <DialogDescription>
                  Create a personal invitation link for a specific person
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Smith"
                      data-testid="input-respondent-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john@example.com"
                      data-testid="input-respondent-email"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={inviteSingleMutation.isPending}
                    data-testid="button-submit-respondent"
                  >
                    {inviteSingleMutation.isPending ? "Adding..." : "Add & Generate Link"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="link">
          <TabsList className="w-full sm:w-auto flex">
            <TabsTrigger value="link" className="flex-1 sm:flex-initial gap-1.5" data-testid="tab-share-link">
              <Link2 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Share</span> Link
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1 sm:flex-initial gap-1.5" data-testid="tab-import">
              <Upload className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Import</span> CSV
            </TabsTrigger>
            <TabsTrigger value="tracking" className="flex-1 sm:flex-initial gap-1.5" data-testid="tab-tracking">
              <Mail className="w-4 h-4 shrink-0" />
              <span className="truncate">Tracking ({invitedRespondents.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4 mt-4">
            <div>
              <Label className="text-sm text-muted-foreground">Public Link</Label>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm truncate">
                  {shareUrl}
                </div>
                <Button
                  variant="outline"
                  onClick={copyShareLink}
                  data-testid="button-copy-share-link"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Anyone with this link can participate. Use personal invitations for tracking.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <a
                href={`mailto:?subject=Interview%20Invitation&body=You%27re%20invited%20to%20participate%20in%20an%20interview.%20Click%20here%20to%20start%3A%20${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" data-testid="button-share-email">
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </Button>
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`You're invited to participate in an interview: ${shareUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" data-testid="button-share-whatsapp">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  WhatsApp
                </Button>
              </a>
              <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-show-qr">
                    <QrCode className="w-4 h-4 mr-2" />
                    QR Code
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>QR Code</DialogTitle>
                    <DialogDescription>
                      Scan this code to access the interview
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="bg-white p-4 rounded-lg">
                      <QRCodeSVG
                        ref={qrRef}
                        value={shareUrl}
                        size={200}
                        level="M"
                        includeMargin={true}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center max-w-xs break-all">
                      {shareUrl}
                    </p>
                  </div>
                  <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      onClick={copyShareLink}
                      data-testid="button-qr-copy-link"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Link
                    </Button>
                    <Button onClick={downloadQRCode} data-testid="button-download-qr">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-4 mt-4">
            <div>
              <Label>Paste CSV Data or Upload File</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Format: email,name (one per line). Header row is optional.
              </p>
              <textarea
                className="w-full h-32 p-3 border rounded-lg font-mono text-sm resize-none"
                placeholder="john@example.com,John Smith&#10;jane@example.com,Jane Doe"
                value={csvData}
                onChange={(e) => setCsvData(e.target.value)}
                data-testid="textarea-csv-data"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-csv"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload CSV
              </Button>
              <Button
                onClick={handleBulkImport}
                disabled={bulkInviteMutation.isPending || !csvData.trim()}
                data-testid="button-import-respondents"
              >
                {bulkInviteMutation.isPending ? "Importing..." : "Import Respondents"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="tracking" className="mt-4">
            {invitedRespondents.length > 0 && (
              <div className="flex items-center gap-4 mb-4 flex-wrap">
                {Object.entries(statusCounts).map(([status, count]) => {
                  if (count === 0) return null;
                  const config = STATUS_CONFIG[status];
                  return (
                    <div key={status} className="flex items-center gap-1.5 text-sm">
                      <div className={`w-2 h-2 rounded-full ${config.color.split(" ")[0]}`} />
                      <span className="text-muted-foreground">{config.label}:</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {isLoadingRespondents ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : invitedRespondents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No personal invitations yet</p>
                <p className="text-xs mt-1">Add respondents to track their progress</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {invitedRespondents.map((respondent) => {
                  const status = respondent.invitationStatus || "invited";
                  const config = STATUS_CONFIG[status] || STATUS_CONFIG.invited;
                  const StatusIcon = config.icon;
                  
                  return (
                    <div
                      key={respondent.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`respondent-row-${respondent.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <StatusIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {respondent.fullName || respondent.email || "Anonymous"}
                          </p>
                          {respondent.email && respondent.fullName && (
                            <p className="text-xs text-muted-foreground truncate">
                              {respondent.email}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={config.color} variant="secondary">
                          {config.label}
                        </Badge>
                        {respondent.invitationToken && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyRespondentLink(respondent.invitationToken!)}
                            data-testid={`button-copy-link-${respondent.id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
