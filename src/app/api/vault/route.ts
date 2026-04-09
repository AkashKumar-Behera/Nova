import { NextRequest, NextResponse } from "next/server";
import { auth as adminAuth, db as adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const { uid } = decodedToken;

    const vaultDoc = await adminDb.collection("vaults").doc(uid).get();

    if (!vaultDoc.exists) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({ exists: true, vault: vaultDoc.data() });
  } catch (error: any) {
    console.error("Vault GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const { uid } = decodedToken;

    const { ciphertext, iv, salt } = await req.json();

    if (!ciphertext || !iv || !salt) {
      return NextResponse.json({ error: "Missing vault data" }, { status: 400 });
    }

    await adminDb.collection("vaults").doc(uid).set({
      ciphertext,
      iv,
      salt,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Vault POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
