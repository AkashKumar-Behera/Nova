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
    const uid = decodedToken.uid;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "incoming" or "outgoing" or "friends"

    if (type === "incoming") {
      const snapshot = await adminDb.collection("friendRequests")
        .where("to", "==", uid)
        .where("status", "==", "pending")
        .get();
      
      const requests = await Promise.all(snapshot.docs.map(async doc => {
        const fromUid = doc.data().from;
        const userDoc = await adminDb.collection("users").doc(fromUid).get();
        return {
          id: doc.id,
          from: fromUid,
          name: userDoc.data()?.displayName || "Unknown",
          photoURL: userDoc.data()?.photoURL || null,
          timestamp: doc.data().timestamp,
        };
      }));
      return NextResponse.json({ requests });
    }

    if (type === "friends") {
      // In this simple E2EE setup, we store friendships in a 'friends' sub-collection or similar
      const snapshot = await adminDb.collection("users").doc(uid).collection("friends").get();
      const friends = await Promise.all(snapshot.docs.map(async doc => {
        const friendUid = doc.id;
        const userDoc = await adminDb.collection("users").doc(friendUid).get();
        return {
          uid: friendUid,
          displayName: userDoc.data()?.displayName || "Unknown",
          photoURL: userDoc.data()?.photoURL || null,
          publicKey: userDoc.data()?.publicKey || null,
        };
      }));
      return NextResponse.json({ friends });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error: any) {
    console.error("Friend List Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
