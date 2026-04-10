const admin = require('firebase-admin');
const serviceAccount = require('../webrtc-cd5af-firebase-adminsdk-fbsvc-b8234e653b.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUsers() {
  console.log("Fetching users from Firestore...");
  const snapshot = await db.collection('users').get();
  console.log(`Total users: ${snapshot.size}`);

  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`\n---------------------------`);
    console.log(`User: ${data.displayName} (${data.email})`);
    console.log(`UID: ${data.uid}`);
    console.log(`Public Key: ${data.publicKey ? "PRESENT - " + data.publicKey.substring(0, 50) + "..." : "NULL ❌"}`);
  });
  
  process.exit(0);
}

checkUsers();
