import { NextRequest, NextResponse } from "next/server";
import { auth as adminAuth, db as adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const { uid, email, name, picture } = decodedToken;

    const { publicKey } = await req.json().catch(() => ({}));

    // Check if user exists
    const userRef = adminDb.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        uid,
        email,
        displayName: name || email?.split("@")[0] || "User",
        photoURL: picture || null,
        publicKey: publicKey || null,
        theme: "dark",
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        isOnline: true,
      });
    } else {
      const updates: any = {
        lastActive: new Date().toISOString(),
        isOnline: true,
      };
      if (publicKey) updates.publicKey = publicKey;
      await userRef.update(updates);
    }

    return NextResponse.json({ success: true, user: decodedToken });
  } catch (error: any) {
    console.error("Registration Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
