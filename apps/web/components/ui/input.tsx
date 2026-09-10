import * as React from 'react'
import { Label } from './label'
import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/lib/utils'

function Input({
  className,
  type,
  label,
  leftIcon,
  rightIcon,
  helperText,
  error,
  id,
  ...props
}: React.ComponentProps<'input'> & {
  label?: string
  error?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  helperText?: string
}) {
  // The label has to point at the field, or it is a caption: clicking it
  // focuses nothing and a screen reader reads the input as unlabelled. A
  // caller-supplied id wins so a form can still address its own fields.
  const generatedId = React.useId()
  const inputId = id ?? generatedId

  // Tied to the input the same way, so the reason a field is rejected is
  // announced with it rather than sitting unread beside it.
  const messageId = `${inputId}-message`
  const hasMessage = Boolean(error ?? helperText)

  return (
    <>
      {label && <Label htmlFor={inputId}>{label?.toUpperCase()}</Label>}
      <div className="relative w-full">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
            {leftIcon}
          </span>
        )}
        <InputPrimitive
          id={inputId}
          type={type}
          data-slot="input"
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          className={cn(
            'h-12 md:h-10 w-full min-w-0 rounded-md border border-zinc-800 bg-neutral-900 px-2 py-0.5 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-neutral-600 focus-visible:border-ring focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-2 aria-invalid:ring-red-500/20 md:text-xs/relaxed dark:bg-input/30 dark:aria-invalid:border-red-500 dark:aria-invalid:ring-red-500/40',
            leftIcon && 'pl-8',
            rightIcon && 'pr-8',
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
      {error ? (
        <p id={messageId} className="text-red-500 text-xs">
          {error}
        </p>
      ) : helperText ? (
        <p id={messageId} className="text-neutral-500 text-xs">
          {helperText}
        </p>
      ) : null}
    </>
  )
}

export { Input }
