import listening1 from "@/assets/alvia/listening_1.png";
import listening2 from "@/assets/alvia/listening_2.png";
import listening3 from "@/assets/alvia/listening_3.png";
import talking1 from "@/assets/alvia/talking_1.png";
import talking2 from "@/assets/alvia/talking_2.png";
import talking3 from "@/assets/alvia/talking_3.png";
import talking4 from "@/assets/alvia/talking_4.png";
import paused1 from "@/assets/alvia/paused_1.png";
import paused2 from "@/assets/alvia/paused_2.png";
import connecting1 from "@/assets/alvia/connecting_1.png";
import textMode1 from "@/assets/alvia/text_mode_1.png";
import textMode2 from "@/assets/alvia/text_mode_2.png";
import silence1 from "@/assets/alvia/silence_1.png";
import silence2 from "@/assets/alvia/silence_2.png";
import reconnecting1 from "@/assets/alvia/reconnecting_1.png";
import noisy1 from "@/assets/alvia/noisy_1.png";
import noisy2 from "@/assets/alvia/noisy_2.png";
import thinking1 from "@/assets/alvia/thinking_1.png";
import ready1 from "@/assets/alvia/ready_1.png";
import offline1 from "@/assets/alvia/offline_1.png";
import offline2 from "@/assets/alvia/offline_2.png";

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
  listening: [listening1, listening2, listening3],
  talking: [talking1, talking2, talking3, talking4],
  paused: [paused1, paused2],
  connecting: [connecting1],
  text_mode: [textMode1, textMode2],
  silence: [silence1, silence2],
  reconnecting: [reconnecting1],
  noisy: [noisy1, noisy2],
  thinking: [thinking1],
  ready: [ready1],
  offline: [offline1, offline2],
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
