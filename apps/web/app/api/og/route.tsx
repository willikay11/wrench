import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#000",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          padding: "80px",
        }}
      >
        <img
          src={`${origin}/logo.svg`}
          width={240}
          height={240}
          alt="Wrench"
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              color: "#dd6e40",
              fontSize: 96,
              fontWeight: 700,
            }}
          >
            Wrench
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}