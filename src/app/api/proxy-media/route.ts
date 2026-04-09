import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
        return NextResponse.json({ error: "Failed to fetch from remote" }, { status: response.status });
    }
    
    // Read the binary stream
    const arrayBuffer = await response.arrayBuffer();
    
    // Return to client as octet-stream
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (err: any) {
    console.error("Proxy error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
