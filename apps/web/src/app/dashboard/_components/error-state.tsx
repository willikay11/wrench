// apps/web/src/app/dashboard/_components/error-state.tsx
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="col-span-2 flex flex-col items-center justify-center py-16 gap-3">
      <p className="text-sm text-muted-foreground">
        Failed to load builds: {message}
      </p>
    </div>
  )
}