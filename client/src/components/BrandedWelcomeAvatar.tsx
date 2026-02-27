import { useState } from "react";
import { motion } from "framer-motion";
import alviaSprite from "@/assets/WELCOMEINTERVIEW.png";

interface BrandedWelcomeAvatarProps {
  brandingLogo?: string | null;
}

export default function BrandedWelcomeAvatar({ brandingLogo }: BrandedWelcomeAvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (brandingLogo && !imgError) {
    return (
      <div className="flex flex-col items-center gap-2" data-testid="branded-avatar">
        <div className="relative w-20 h-20 rounded-full bg-primary flex items-center justify-center mx-auto">
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-primary"
            animate={{ scale: [1, 1.3], opacity: [0.8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center overflow-hidden">
            <img
              src={brandingLogo}
              alt="Organization logo"
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
              data-testid="img-branding-logo"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Powered by Alvia</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-20 h-20 rounded-full bg-primary flex items-center justify-center mx-auto" data-testid="default-avatar">
      <motion.div
        className="absolute inset-0 rounded-full border-4 border-primary"
        animate={{ scale: [1, 1.3], opacity: [0.8, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center overflow-hidden">
        <img src={alviaSprite} alt="Alvia" className="w-full h-full object-contain" />
      </div>
    </div>
  );
}
