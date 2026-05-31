import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LabLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: { img: 36, title: "text-sm", sub: "text-[10px]" },
  md: { img: 44, title: "text-[15px]", sub: "text-[11px]" },
  lg: { img: 56, title: "text-base", sub: "text-xs" },
} as const;

export function LabLogo({ size = "md", showText = true, className }: LabLogoProps) {
  const s = sizes[size];

  const content = (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative shrink-0 rounded-full ring-2 ring-[#1a5632]/15 ring-offset-2 ring-offset-[#f6f5f1]">
        <Image
          src="/aifa-logo.png"
          alt="农业人工智能实验室 AIFA"
          width={s.img}
          height={s.img}
          className="rounded-full object-cover"
          priority
        />
      </div>
      {showText && (
        <div className="min-w-0 leading-tight">
          <p className={cn("font-semibold tracking-tight text-[#1a3d2e]", s.title)}>
            农业人工智能实验室
          </p>
          <p className={cn("mt-0.5 text-[#5c6b63]", s.sub)}>
            禾书耕文 <span className="text-[#1a5632]/40">·</span>{" "}
            <span className="font-mono tracking-wide text-[#1a5632]/70">GrainScript</span>
          </p>
        </div>
      )}
    </div>
  );

  return (
    <Link href="/" className="group inline-flex transition-opacity hover:opacity-90">
      {content}
    </Link>
  );
}
