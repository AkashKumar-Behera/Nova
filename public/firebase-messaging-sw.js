importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');
importScripts('https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js');

const firebaseConfig = {
  apiKey: "AIzaSyBGnFw13ko0b4KAs7plpFmHlg0GohowElA",
  authDomain: "webrtc-cd5af.firebaseapp.com",
  databaseURL: "https://webrtc-cd5af-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "webrtc-cd5af",
  storageBucket: "webrtc-cd5af.firebasestorage.app",
  messagingSenderId: "373326963708",
  appId: "1:373326963708:web:3d67179d8a8d4698fe4879",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// LocalForage for Keys (Matches KeysDB instance)
const keysStore = localforage.createInstance({
  name: 'NovaKeysDB',
  storeName: 'keys'
});

// Decryption Utilities matching CryptoUtils.ts
const CryptoHelper = {
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  },
  async importPrivateKey(base64) {
    const jwk = JSON.parse(atob(base64));
    return await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  },
  async importPublicKey(base64) {
    const jwk = JSON.parse(atob(base64));
    return await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
  },
  async deriveSharedKey(privateKey, publicKey) {
    return await crypto.subtle.deriveKey({ name: "ECDH", public: publicKey }, privateKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  },
  async decryptMessage(key, ciphertext, iv) {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  }
};

messaging.onBackgroundMessage(async (payload) => {
  console.log('[sw] Background Message:', payload);

  const { ciphertext, iv, senderUid, senderPublicKey, senderName, senderPhoto, recipientUid } = payload.data;
  
  try {
    // 1. Get our Private Key
    const privKeyB64 = await keysStore.getItem(`priv_key_${recipientUid}`);
    if (!privKeyB64) throw new Error("Private key not found");

    // 2. Import Keys
    const privKey = await CryptoHelper.importPrivateKey(privKeyB64);
    const pubKey = await CryptoHelper.importPublicKey(senderPublicKey);

    // 3. Decrypt
    const sharedKey = await CryptoHelper.deriveSharedKey(privKey, pubKey);
    const encryptedBuffer = CryptoHelper.base64ToArrayBuffer(ciphertext);
    const ivBuffer = new Uint8Array(CryptoHelper.base64ToArrayBuffer(iv));
    
    const decryptedStr = await CryptoHelper.decryptMessage(sharedKey, encryptedBuffer, ivBuffer);
    const parsed = JSON.parse(decryptedStr);
    
    let bodyText = "New message";
    if (parsed.type === 'text') bodyText = parsed.text;
    else if (parsed.type === 'image') bodyText = "📷 Photo";
    else if (parsed.type === 'voice') bodyText = "🎤 Voice Message";
    else if (parsed.type === 'file') bodyText = "📎 Document";

    self.registration.showNotification(senderName || "Nova Chat", {
      body: bodyText,
      icon: senderPhoto || '/icon-192.png',
      badge: '/icon-192.png',
      tag: `chat-${senderUid}`,
      data: { senderUid }
    });
  } catch (err) {
    console.error("[sw] Decryption failed:", err);
    // Fallback to generic notification
    self.registration.showNotification(senderName || "Nova Chat", {
      body: "New message received",
      icon: senderPhoto || '/icon-192.png',
      tag: `chat-${senderUid}`,
      data: { senderUid }
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const senderUid = event.notification.data.senderUid;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and redirect
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          return client.focus().then(c => c.navigate(`/dashboard?chat=${senderUid}`));
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(`/dashboard?chat=${senderUid}`);
      }
    })
  );
});
