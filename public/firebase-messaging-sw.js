// firebase-messaging-sw.js
// Using raw push event (NOT Firebase's onBackgroundMessage wrapper)
// because Android 15 kills the worker too fast when async code isn't
// properly held open with event.waitUntil.

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBGnFw13ko0b4KAs7plpFmHlg0GohowElA",
  authDomain: "webrtc-cd5af.firebaseapp.com",
  projectId: "webrtc-cd5af",
  storageBucket: "webrtc-cd5af.firebasestorage.app",
  messagingSenderId: "373326963708",
  appId: "1:373326963708:web:3d67179d8a8d4698fe4879",
};

firebase.initializeApp(firebaseConfig);
// Initialise messaging to claim push subscription for this SW
firebase.messaging();

// ─── Crypto helpers ───────────────────────────────────────────────
const CryptoHelper = {
  base64ToBuffer(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  },
  async importPrivateKey(b64jwk) {
    const jwk = JSON.parse(atob(b64jwk));
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  },
  async importPublicKey(b64jwk) {
    const jwk = JSON.parse(atob(b64jwk));
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  },
  async deriveSharedKey(priv, pub) {
    return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  },
  async decrypt(key, cipherBuf, ivBuf) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, cipherBuf);
    return new TextDecoder().decode(plain);
  }
};

// ─── IndexedDB key reader (no localforage dependency) ────────────
function readPrivateKey(uid) {
  return new Promise((resolve) => {
    const req = indexedDB.open('NovaKeysDB');
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('keys')) { resolve(null); return; }
      const tx = db.transaction('keys', 'readonly');
      const store = tx.objectStore('keys');
      const get = store.get(`priv_key_${uid}`);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

// ─── Main background handler ──────────────────────────────────────
async function handleBackgroundPush(data) {
  const {
    ciphertext, iv, senderUid, senderPublicKey,
    senderName, senderPhoto, recipientUid
  } = data;

  // Fallback notification (always works, even without decryption)
  const fallback = {
    title: senderName || 'Nova Chat',
    body: 'New message',
    icon: senderPhoto || '/icon-192.png',
    badge: '/icon-192.png',
    tag: `chat-${senderUid}`,
    data: { senderUid },
    vibrate: [200, 100, 200],
    renotify: true,
  };

  // Try to decrypt and show the real message
  try {
    const privKeyB64 = await readPrivateKey(recipientUid);
    if (!privKeyB64) throw new Error('No private key');

    const privKey = await CryptoHelper.importPrivateKey(privKeyB64);
    const pubKey = await CryptoHelper.importPublicKey(senderPublicKey);
    const sharedKey = await CryptoHelper.deriveSharedKey(privKey, pubKey);

    const cipherBuf = CryptoHelper.base64ToBuffer(ciphertext);
    const ivBuf = CryptoHelper.base64ToBuffer(iv);
    const plain = await CryptoHelper.decrypt(sharedKey, cipherBuf, ivBuf);
    const parsed = JSON.parse(plain);

    let body = 'New message';
    if (parsed.type === 'text') body = parsed.text;
    else if (parsed.type === 'image') body = '📷 Photo';
    else if (parsed.type === 'voice') body = '🎤 Voice message';
    else if (parsed.type === 'file') body = `📎 ${parsed.fileName || 'Document'}`;

    await self.registration.showNotification(senderName || 'Nova Chat', {
      ...fallback,
      body,
    });
  } catch (err) {
    console.warn('[sw] Decryption failed, showing fallback:', err.message);
    await self.registration.showNotification(fallback.title, fallback);
  }
}

// ─── Raw push event — holds worker alive with event.waitUntil ─────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    // FCM wraps our data under the 'data' key in the push payload
    const payload = event.data?.json() || {};
    data = payload.data || {};
  } catch (_) {}

  // If this push came from Firebase's internal keepalive / test, ignore
  if (!data.senderUid) return;

  // event.waitUntil keeps the service worker alive until the promise resolves
  event.waitUntil(handleBackgroundPush(data));
});

// ─── Notification click → open/focus the right chat ──────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const senderUid = event.notification.data?.senderUid;
  const url = senderUid ? `/dashboard?chat=${senderUid}` : '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          return client.focus().then(c => c.navigate(url));
        }
      }
      return clients.openWindow(url);
    })
  );
});
