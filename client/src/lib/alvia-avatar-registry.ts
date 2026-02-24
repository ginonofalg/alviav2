import listening1 from "@/assets/alvia/listening_1.png";
import talking1 from "@/assets/alvia/talking_1.png";
import paused1 from "@/assets/alvia/paused_1.png";
import connecting1 from "@/assets/alvia/connecting_1.png";
import textMode1 from "@/assets/alvia/text_mode_1.png";
import silence1 from "@/assets/alvia/silence_1.png";
import reconnecting1 from "@/assets/alvia/reconnecting_1.png";
import noisy1 from "@/assets/alvia/noisy_1.png";
import thinking1 from "@/assets/alvia/thinking_1.png";
import ready1 from "@/assets/alvia/ready_1.png";
import offline1 from "@/assets/alvia/offline_1.png";

export type AlviaAvatarState =
  | "listening"
  | "talking"
  | "paused"
  | "connecting"
  | "text_mode"
  | "silence"
  | "reconnecting"
  | "noisy"
  | "thinking"
  | "ready"
  | "offline";

export const ALVIA_AVATAR_VARIANTS: Record<AlviaAvatarState, string[]> = {
  listening: [listening1],
  talking: [talking1],
  paused: [paused1],
  connecting: [connecting1],
  text_mode: [textMode1],
  silence: [silence1],
  reconnecting: [reconnecting1],
  noisy: [noisy1],
  thinking: [thinking1],
  ready: [ready1],
  offline: [offline1],
};

let preloaded = false;

export function preloadAlviaAvatars(): void {
  if (preloaded) return;
  preloaded = true;
  for (const urls of Object.values(ALVIA_AVATAR_VARIANTS)) {
    for (const url of urls) {
      const img = new Image();
      img.src = url;
    }
  }
}
