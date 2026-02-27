import { useState } from "react";
import { Bot } from "lucide-react";
import alviaSprite from "@/assets/WELCOMEINTERVIEW.png";

interface BrandedWelcomeAvatarProps {
  brandingLogo?: string | null;
}

export default function BrandedWelcomeAvatar({ brandingLogo }: BrandedWelcomeAvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (brandingLogo && !imgError) {
    return (
      <div className="flex flex-col items-center gap-2" data-testid="branded-avatar">
        <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center overflow-hidden">
          <img
            src={brandingLogo}
            alt="Organization logo"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            data-testid="img-branding-logo"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <img src={alviaSprite} alt="Alvia" className="w-5 h-5 object-contain" />
          <span>Powered by Alvia</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto overflow-hidden" data-testid="default-avatar">
      <img src={alviaSprite} alt="Alvia" className="w-10 h-10 object-contain" />
    </div>
  );
}
