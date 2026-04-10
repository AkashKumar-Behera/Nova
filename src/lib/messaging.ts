import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { app, db } from "./firebase-client";
import { doc, updateDoc } from "firebase/firestore";

const VAPID_KEY = "BAauAD-Eld0_j-5iCbxWvA23WZ2xdsay4RkM-gL0EH9sMZG2Zn5oaAuKNj5BU8DzkLK2HUEWPTtPRmikHj0bfcQ";

export const MessagingUtils = {
  async initMessaging(uid: string, registration: ServiceWorkerRegistration) {
    if (typeof window === 'undefined') return;

    try {
      const messaging = getMessaging(app);
      
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Get token using explicit registration
      const token = await getToken(messaging, { 
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration 
      });
      
      if (token) {
        await updateDoc(doc(db, "users", uid), { fcmToken: token });
        console.log("FCM Token registered successfully:", token);
        return true;
      }
      return false;
    } catch (err) {
      console.error("FCM Initialization failed:", err);
      return false;
    }
  }
};
