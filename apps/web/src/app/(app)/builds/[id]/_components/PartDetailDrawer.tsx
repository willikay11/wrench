"use client"

import * as React from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { orderPart } from "@/lib/api/builds"
import type { Part } from "@/lib/api/builds"

interface PartDetailDrawerProps {
  part: Part | null
  buildId: string
  open: boolean
  onClose: () => void
  onOrdered: (updatedPart: Part) => void
}

type ConfirmingVendorId = string | null

export function PartDetailDrawer({
  part,
  buildId,
  open,
  onClose,
  onOrdered,
}: PartDetailDrawerProps) {
  const [confirmingVendor, setConfirmingVendor] = React.useState<ConfirmingVendorId>(null)
  const [successVendor, setSuccessVendor] = React.useState<ConfirmingVendorId>(null)
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [feedback, setFeedback] = React.useState("")

  if (!part) return null

  const handleOrderClick = (vendorId: string) => {
    setConfirmingVendor(vendorId)
  }

  const handleCancelConfirm = () => {
    setConfirmingVendor(null)
  }

  const handleConfirmOrder = async () => {
    if (!confirmingVendor) return

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Not signed in")

      const updatedPart = await orderPart(
        buildId,
        part.id,
        confirmingVendor,
        session.access_token
      )

      setSuccessVendor(confirmingVendor)
      setConfirmingVendor(null)

      setTimeout(() => {
        setSuccessVendor(null)
        onOrdered(updatedPart)
        onClose()
      }, 600)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to order part")
      setConfirmingVendor(null)
    }
  }

  const handleSendFeedback = () => {
    if (!feedback.trim()) return
    toast.success("Feedback noted — the advisor will suggest an alternative")
    setFeedback("")
    setFeedbackOpen(false)
  }

  const vendors = part.vendors || []
  const sortedVendors = [...vendors].sort((a, b) => (a.price ?? 999999) - (b.price ?? 999999))

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 40,
            animation: "fadeIn 200ms ease",
          }}
        />
      )}

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Part details"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(420px, 100vw)",
          background: "var(--color-background-primary, white)",
          borderLeft: "0.5px solid var(--color-border-tertiary)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 250ms ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "0.5px solid var(--color-border-tertiary)",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--color-text-primary)",
                wordBreak: "break-word",
              }}
            >
              {part.name}
            </div>
            {part.description && (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-tertiary)",
                  marginTop: "2px",
                  wordBreak: "break-word",
                }}
              >
                {part.description}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              width: "28px",
              height: "28px",
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "7px",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              color: "var(--color-text-secondary)",
              fontFamily: "inherit",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Safety Banner */}
        {part.is_safety_critical && (
          <div
            style={{
              backgroundColor: "var(--color-background-warning)",
              borderBottom: "0.5px solid var(--color-border-warning)",
              padding: "8px 16px",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--color-text-warning)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Safety-critical part
            </div>
          </div>
        )}

        {/* Body (scrollable) */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            padding: "12px 14px",
            gap: "12px",
          }}
        >
          {/* Where to buy section */}
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--color-text-primary)",
                marginBottom: "8px",
              }}
            >
              Where to buy
            </div>

            {sortedVendors.length > 0 ? (
              sortedVendors.map((vendor) => {
              const isConfirming = confirmingVendor === vendor.id
              const isSuccess = successVendor === vendor.id
              const totalCost = (vendor.price ?? 0) + (vendor.shipping_cost ?? 0)

              return (
                <div
                  key={vendor.id}
                  style={{
                    padding: "10px",
                    background: isSuccess
                      ? "var(--color-background-success)"
                      : "var(--color-background-secondary)",
                    border: isSuccess
                      ? "0.5px solid var(--color-border-success)"
                      : "0.5px solid var(--color-border-tertiary)",
                    borderRadius: "8px",
                    marginBottom: "8px",
                  }}
                >
                  {/* Vendor name + badge */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginBottom: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: isSuccess ? "var(--color-text-success)" : "var(--color-text-primary)",
                      }}
                    >
                      {vendor.vendor_name}
                    </span>
                    {vendor.is_primary && !isSuccess && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 600,
                          color: "white",
                          background: "#D97706",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Best price
                      </span>
                    )}
                    {isSuccess && (
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--color-text-success)",
                        }}
                      >
                        Ordered ✓
                      </span>
                    )}
                  </div>

                  {!isSuccess && (
                    <>
                      {/* Price */}
                      <div
                        style={{
                          fontSize: "16px",
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                          marginBottom: "6px",
                        }}
                      >
                        ${vendor.price?.toFixed(2) ?? "—"}
                      </div>

                      {/* Meta row */}
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--color-text-tertiary)",
                          marginBottom: "6px",
                        }}
                      >
                        {vendor.ships_from && <span>{vendor.ships_from}</span>}
                        {vendor.ships_from && vendor.estimated_days_min && <span> · </span>}
                        {vendor.estimated_days_min && (
                          <span>
                            {vendor.estimated_days_min}–{vendor.estimated_days_max ?? vendor.estimated_days_min} days
                          </span>
                        )}
                        {(vendor.ships_from || vendor.estimated_days_min) && vendor.shipping_cost != null && <span> · </span>}
                        {vendor.shipping_cost != null && (
                          <span>
                            {vendor.shipping_cost === 0
                              ? "Free shipping"
                              : `$${(vendor.shipping_cost ?? 0).toFixed(2)} shipping`}
                          </span>
                        )}
                      </div>

                      {/* Landed cost */}
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--color-text-secondary)",
                          marginBottom: "8px",
                          paddingTop: "6px",
                          borderTop: "0.5px solid var(--color-border-tertiary)",
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>Landed cost:</span>{" "}
                        <span style={{ fontWeight: 600 }}>${totalCost.toFixed(2)}</span>
                      </div>

                      {/* Action buttons */}
                      {isConfirming ? (
                        <div
                          style={{
                            padding: "8px",
                            background: "var(--color-background-primary)",
                            border: "0.5px solid var(--color-border-tertiary)",
                            borderRadius: "6px",
                            fontSize: "12px",
                            color: "var(--color-text-secondary)",
                            marginBottom: "8px",
                          }}
                        >
                          <div style={{ marginBottom: "8px" }}>
                            Confirm — ordered from <strong>{vendor.vendor_name}</strong>?
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                            }}
                          >
                            <button
                              onClick={handleConfirmOrder}
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "#10B981",
                                color: "white",
                                border: "none",
                                borderRadius: "5px",
                                fontSize: "11px",
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              Yes, confirm
                            </button>
                            <button
                              onClick={handleCancelConfirm}
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "var(--color-background-secondary)",
                                color: "var(--color-text-secondary)",
                                border: "0.5px solid var(--color-border-tertiary)",
                                borderRadius: "5px",
                                fontSize: "11px",
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                          }}
                        >
                          {vendor.vendor_url && (
                            <a
                              href={vendor.vendor_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                textAlign: "center",
                                background: "var(--color-background-primary)",
                                color: "var(--color-text-brand)",
                                border: "0.5px solid var(--color-border-tertiary)",
                                borderRadius: "5px",
                                fontSize: "11px",
                                fontWeight: 600,
                                cursor: "pointer",
                                textDecoration: "none",
                                display: "block",
                              }}
                            >
                              View listing →
                            </a>
                          )}
                          <button
                            onClick={() => handleOrderClick(vendor.id)}
                            style={{
                              flex: 1,
                              padding: "6px 10px",
                              background: "#D97706",
                              color: "white",
                              border: "none",
                              borderRadius: "5px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            I've ordered this
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })
            ) : (
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-tertiary)",
                  padding: "8px",
                  textAlign: "center",
                }}
              >
                No vendors available
              </div>
            )}
          </div>

          {/* Advisor note section */}
          {part.notes && (
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                  marginBottom: "8px",
                }}
              >
                Before you buy
              </div>
              <div
                style={{
                  padding: "10px",
                  background: "var(--color-background-warning)",
                  border: "0.5px solid var(--color-border-warning)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--color-text-warning)",
                  lineHeight: 1.5,
                }}
              >
                {part.notes}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 14px",
            borderTop: "0.5px solid var(--color-border-tertiary)",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {feedbackOpen ? (
            <>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="e.g. doesn't fit my year, too expensive, wrong spec..."
                style={{
                  width: "100%",
                  padding: "8px",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderRadius: "6px",
                  background: "var(--color-background-secondary)",
                  color: "var(--color-text-primary)",
                  minHeight: "60px",
                  resize: "vertical",
                }}
              />
              <button
                onClick={handleSendFeedback}
                disabled={!feedback.trim()}
                style={{
                  padding: "6px 10px",
                  background: "#D97706",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: feedback.trim() ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  opacity: feedback.trim() ? 1 : 0.5,
                }}
              >
                Send feedback
              </button>
            </>
          ) : (
            <button
              onClick={() => setFeedbackOpen(true)}
              style={{
                padding: "6px 10px",
                background: "var(--color-background-secondary)",
                color: "var(--color-text-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "5px",
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Not the right part
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0 }
          to { opacity: 1 }
        }
      `}</style>
    </>
  )
}
