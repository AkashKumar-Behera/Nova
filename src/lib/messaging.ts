import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { app, db } from "./firebase-client";
import { doc, updateDoc } from "firebase/firestore";

const VAPID_KEY = "BAauAD-Eld0_j-5iCbxWvA23WZ2xdsay4RkM-gL0EH9sMZG2Zn5oaAuKNj5BU8DzkLK2HUEWPTtPRmikHj0bfcQ";

export const MessagingUtils = {
  async initMessaging(uid: string) {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const messaging = getMessaging(app);
      
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Get token
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token) {
        await updateDoc(doc(db, "users", uid), { fcmToken: token });
        console.log("FCM Token registered:", token);
      }

      // Handle foreground messages
      onMessage(messaging, (payload) => {
        console.log("Foreground message received:", payload);
        // Page level notifications are already handled by our onSnapshot listener in dashboard/page.tsx
      });

    } catch (err) {
      console.error("FCM Initialization failed:", err);
    }
  }
};
