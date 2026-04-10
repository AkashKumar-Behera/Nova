import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import * as admin from "firebase-admin";

export async function POST(req: Request) {
  try {
    const { 
        fcmToken, 
        ciphertext, 
        iv, 
        senderUid, 
        senderPublicKey, 
        senderName, 
        senderPhoto, 
        recipientUid 
    } = await req.json();

    if (!fcmToken) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const message = {
      token: fcmToken,
      data: {
        ciphertext,
        iv,
        senderUid,
        senderPublicKey,
        senderName: senderName || "Nova User",
        senderPhoto: senderPhoto || "",
        recipientUid: recipientUid
      },
      android: {
        priority: "high" as const,
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    return NextResponse.json({ success: true, messageId: response });

  } catch (error: any) {
    console.error("FCM Send Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
