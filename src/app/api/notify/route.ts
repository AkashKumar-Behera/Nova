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

    // CRITICAL: Send BOTH notification + data fields.
    // - `notification` field ensures Android OS shows it natively even if 
    //   battery optimization kills the service worker before it runs.
    // - `data` field carries the E2EE payload so the SW can decrypt and 
    //   replace the generic notification with the actual message text.
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title: senderName || "Nova Chat",
        body: "New message",   // generic fallback shown by OS
      },
      data: {
        ciphertext: ciphertext || "",
        iv: iv || "",
        senderUid: senderUid || "",
        senderPublicKey: senderPublicKey || "",
        senderName: senderName || "Nova User",
        senderPhoto: senderPhoto || "",
        recipientUid: recipientUid || "",
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
          channelId: "nova_messages",
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
            mutableContent: true,
          },
        },
      },
      webpush: {
        headers: {
          Urgency: "high",
          TTL: "60",
        },
        notification: {
          requireInteraction: true,
          badge: "/icon-192.png",
        },
        fcmOptions: {
          link: `/dashboard?chat=${senderUid}`,
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
