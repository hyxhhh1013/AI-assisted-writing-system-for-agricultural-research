import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ARTICLES_DIR = path.join(process.cwd(), "热化学小组文章-2024.12.27");

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("file");

    console.log("PDF Request for:", filename);

    if (!filename) {
      return NextResponse.json({ error: "File name is required" }, { status: 400 });
    }

    const filePath = path.join(ARTICLES_DIR, filename);
    console.log("Resolved path:", filePath);

    if (!fs.existsSync(filePath)) {
      console.error("File not found at:", filePath);
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("PDF Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
