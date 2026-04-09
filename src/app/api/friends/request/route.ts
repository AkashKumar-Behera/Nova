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
    const senderUid = decodedToken.uid;

    const { targetUid } = await req.json();

    if (!targetUid) {
      return NextResponse.json({ error: "Target user ID is required" }, { status: 400 });
    }

    if (senderUid === targetUid) {
      return NextResponse.json({ error: "You cannot send a friend request to yourself" }, { status: 400 });
    }

    // Check if users exist and if a request already exists
    const requestDocId = [senderUid, targetUid].sort().join("_");
    const requestRef = adminDb.collection("friendRequests").doc(requestDocId);
    const requestDoc = await requestRef.get();

    if (requestDoc.exists) {
      return NextResponse.json({ error: "A request or friendship already exists between these users" }, { status: 400 });
    }

    await requestRef.set({
      from: senderUid,
      to: targetUid,
      status: "pending",
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Friend Request Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
