const sizeMap = {
  sm: { container: "w-5 h-5", svg: 10, text: "text-[13px]", gap: "gap-1.5" },
  md: { container: "w-7 h-7", svg: 14, text: "text-[15px]", gap: "gap-2" },
  lg: { container: "w-9 h-9", svg: 18, text: "text-[18px]", gap: "gap-2.5" },
}

interface LogoProps {
  variant?: "full" | "icon"
  size?: "sm" | "md" | "lg"
  theme?: "light" | "dark"
  className?: string
}

function Logo({ variant = "full", size = "md", theme = "light", className }: LogoProps) {
  const s = sizeMap[size]
  const textColor = theme === "dark" ? "text-white" : "text-foreground"

  return (
    <div className={`flex items-center ${s.gap}${className ? ` ${className}` : ""}`}>
      <div className={`${s.container} bg-brand rounded-md flex items-center justify-center flex-shrink-0`}>
        <svg
          width={s.svg}
          height={s.svg}
          viewBox="0 0 14 14"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 10L5 4l3 4 3-4 2 6" />
        </svg>
      </div>
      {variant === "full" && (
        <span className={`${s.text} font-medium tracking-tight ${textColor}`}>Wrench</span>
      )}
    </div>
  )
}

export { Logo }