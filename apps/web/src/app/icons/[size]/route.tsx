import { ImageResponse } from "next/og";

// Only these two sizes exist. Matched as whole strings, so "192abc" is a 404.
const SIZES = new Set(["192", "512"]);

const BRAND = "#2f3a8f";
const BRAND_INK = "#ffffff";

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const px = Number(size);

  // The "R" sits well inside the centre of the square, so a maskable crop keeps it.
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND,
          color: BRAND_INK,
          fontSize: px * 0.6,
          fontWeight: 700,
        }}
      >
        R
      </div>
    ),
    {
      width: px,
      height: px,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  );
}
