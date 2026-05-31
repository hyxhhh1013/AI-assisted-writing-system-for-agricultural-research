/** 与主页一致的实验室视觉 token */
export const siteTheme = {
  bg: "#f6f5f1",
  bgSoft: "#faf9f6",
  text: "#122820",
  textSecondary: "#3d4f46",
  textMuted: "#6b7c72",
  textFaint: "#9aa8a0",
  primary: "#1a5632",
  border: "border-[#1a5632]/10",
  borderStrong: "border-[#1a5632]/15",
  card: "rounded-2xl border border-[#1a5632]/10 bg-white/85 shadow-sm",
  cardHover: "hover:border-[#1a5632]/20 hover:shadow-md transition-shadow",
  divider: "h-px bg-gradient-to-r from-transparent via-[#1a5632]/15 to-transparent",
  btnPrimary: "bg-[#1a5632] text-white hover:bg-[#144228]",
  btnGhost: "text-[#3d4f46] hover:bg-[#1a5632]/8 hover:text-[#1a5632]",
} as const;

export const siteShellClass = "min-h-screen bg-[#f6f5f1] text-[#122820]";
