import type { CSSProperties } from "react"

const Rex = ({ size = 200 }: { size?: number }) => {
    return (
        <div className="group relative flex flex-col items-center" style={{ "--rex-size": `${size}px` } as CSSProperties}>
            <div className="absolute bottom-[calc(var(--rex-size)+20px)] left-1/2 -translate-x-1/2 translate-y-1.5 min-w-[230px] max-w-[280px] rounded-md border border-primary bg-surface-card-hover px-3.5 py-3 text-center text-[13px] leading-normal text-primary opacity-0 pointer-events-none transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                Your BMW X3 hasn&apos;t had a coolant flush in 14 months.
                <div className="absolute -bottom-[6px] left-1/2 h-[11px] w-[11px] -translate-x-1/2 rotate-45 border-r border-b border-primary bg-surface-card-hover"></div>
            </div>
            <div className="size-(--rex-size) rounded-full bg-[#111111] border-[1.5px] border-primary flex items-center justify-center cursor-pointer relative shadow-[0_0_50px_rgba(232,105,60,0.35)] animate-ring-pulse">
                <svg width="90" height="64" viewBox="0 0 28 20">
                <rect className="animate-eye-scan" x="4" y="7" width="7" height="5" rx="1.5" fill="#E8693C"></rect>
                <rect className="animate-eye-scan" x="17" y="7" width="7" height="5" rx="1.5" fill="#E8693C"></rect>
                <line x1="9" y1="17" x2="19" y2="17" stroke="#E8693C" strokeWidth="1.4" strokeLinecap="round"></line>
                </svg>
            </div>
        </div>
    )
}

export { Rex }
