import { NextRequest, NextResponse } from "next/server";
import { auth as adminAuth, db as adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    await adminAuth.verifyIdToken(token);

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase();

    if (!query) {
      return NextResponse.json({ users: [] });
    }

    // Basic search (in production, use Algolia/Elasticsearch for better results)
    const snapshot = await adminDb.collection("users")
      .where("email", ">=", query)
      .where("email", "<=", query + "\uf8ff")
      .limit(10)
      .get();

    const users = snapshot.docs.map(doc => ({
      uid: doc.id,
      displayName: doc.data().displayName,
      email: doc.data().email,
      photoURL: doc.data().photoURL,
    }));

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("Search Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
