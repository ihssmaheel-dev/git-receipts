import type { CSSProperties } from "react";
import { ArrowRightIcon, ExternalLinkIcon, GitHubLogoIcon, HeartIcon as HeartIconBase, ReaderIcon } from "@radix-ui/react-icons";

export function PrinterIcon({ size = 22, style }: { size?: number; style?: CSSProperties }) {
  return <ReaderIcon width={size} height={size} aria-hidden="true" style={style} />;
}
export function ArrowIcon({ diagonal = false, size = 18 }: { diagonal?: boolean; size?: number }) {
  const Icon = diagonal ? ExternalLinkIcon : ArrowRightIcon;
  return <Icon width={size} height={size} aria-hidden="true" />;
}
export function GithubIcon({ size = 20 }: { size?: number }) {
  return <GitHubLogoIcon width={size} height={size} aria-hidden="true" />;
}
export function HeartIcon({ size = 12 }: { size?: number }) {
  return <HeartIconBase width={size} height={size} aria-hidden="true" />;
}
