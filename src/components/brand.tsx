import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: number;
  showWordmark?: boolean;
  /** "default" = dark text on light bg. "light" = white text. "onBrand" = pops on the red sidebar with a white pill. */
  variant?: "default" | "light" | "onBrand";
};

export function Brand({ className, size = 36, showWordmark = true, variant = "onBrand" }: Props) {
  const isOnBrand = variant === "onBrand";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
          isOnBrand
            ? "bg-white ring-2 ring-white/90 shadow-[0_4px_18px_-2px_rgba(0,0,0,0.35)]"
            : "rounded-md",
        )}
        style={{ width: size + (isOnBrand ? 6 : 0), height: size + (isOnBrand ? 6 : 0) }}
      >
        <img
          src={logo}
          alt="MediFlow AI logo"
          width={size}
          height={size}
          className="object-contain"
        />
      </span>
      {showWordmark && (
        <div className="flex items-baseline gap-1.5 leading-none">
          <span
            className={cn(
              "font-display font-extrabold tracking-tight",
              size >= 36 ? "text-[1.2rem]" : "text-[1.05rem]",
              variant === "light" || isOnBrand ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" : "text-foreground",
            )}
          >
            MediFlow
          </span>
          <span
            className={cn(
              "font-display font-extrabold tracking-tight",
              size >= 36 ? "text-[1.2rem]" : "text-[1.05rem]",
              isOnBrand
                ? "rounded-md bg-white/95 px-1.5 py-0.5 text-[color:var(--primary)] shadow-sm"
                : "text-gradient-brand",
            )}
          >
            AI
          </span>
        </div>
      )}
    </div>
  );
}
