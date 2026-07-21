// app/(marketing)/layout.tsx
import { Navbar } from '@/components/layout/navbar'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-12">
      <div className="col-start-2 col-span-10">
        <Navbar />
        <main>{children}</main>
      </div>
    </div>
  )
}