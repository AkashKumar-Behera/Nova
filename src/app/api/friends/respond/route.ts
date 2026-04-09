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
    const myUid = decodedToken.uid;

    const { requestId, action } = await req.json(); // action: "accept" or "decline"

    if (!requestId || !action) {
      return NextResponse.json({ error: "Request ID and action are required" }, { status: 400 });
    }

    const requestRef = adminDb.collection("friendRequests").doc(requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists || requestDoc.data()?.to !== myUid) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (action === "accept") {
      const { from } = requestDoc.data()!;
      // Atomic transaction: Create friendships in both directions and delete request
      const batch = adminDb.batch();
      
      const myFriendRef = adminDb.collection("users").doc(myUid).collection("friends").doc(from);
      const theirFriendRef = adminDb.collection("users").doc(from).collection("friends").doc(myUid);
      
      batch.set(myFriendRef, { since: new Date().toISOString() });
      batch.set(theirFriendRef, { since: new Date().toISOString() });
      batch.delete(requestRef);
      
      await batch.commit();
      return NextResponse.json({ success: true, message: "Friendship established" });
    } else {
      await requestRef.delete();
      return NextResponse.json({ success: true, message: "Request declined" });
    }
  } catch (error: any) {
    console.error("Friend Response Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
