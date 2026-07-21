import * as React from "react"
import { Label } from "./label"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, label, leftIcon, rightIcon, helperText, error, ...props }: React.ComponentProps<"input"> & {
  label?: string,
  error?: string,
  leftIcon?: React.ReactNode,
  rightIcon?: React.ReactNode,
  helperText?: string,
}) {
  return (
    <>
      {label&& <Label>{label?.toUpperCase()}</Label>}
      <div className="relative w-full">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
            {leftIcon}
          </span>
        )}
        <InputPrimitive
          type={type}
          data-slot="input"
          aria-invalid={error ? true : undefined}
          className={cn(
            "h-12 md:h-10 w-full min-w-0 rounded-md border border-zinc-800 bg-neutral-900 px-2 py-0.5 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-2 aria-invalid:ring-red-500/20 md:text-xs/relaxed dark:bg-input/30 dark:aria-invalid:border-red-500 dark:aria-invalid:ring-red-500/40",
            leftIcon && "pl-8",
            rightIcon && "pr-8",
            className
          )}
          {...props}
        />
        {rightIcon && (
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
            {rightIcon}
          </span>
        )}
      </div>
      {error ? <p className="text-red-500 text-xs">{error}</p> : helperText ? <p className="text-neutral-500 text-xs">{helperText}</p> : null}
    </>
  )
}

export { Input }
