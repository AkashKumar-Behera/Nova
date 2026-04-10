const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

async function wipeDatabase() {
  console.log("Initializing Firebase Admin...");
  
  let serviceAccount = null;
  const rootDir = "a:\\React\\Webcam";
  const files = fs.readdirSync(rootDir);
  const saFile = files.find(f => f.endsWith('.json') && f.includes('firebase-adminsdk'));
  if (saFile) {
    serviceAccount = JSON.parse(fs.readFileSync(path.join(rootDir, saFile), 'utf8'));
    console.log("Loaded Firebase Service Account from file:", saFile);
  }

  if (!serviceAccount) {
    console.error("FATAL: Could not resolve Firebase credentials.");
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  async function deleteCollection(collectionPath) {
    console.log(`Deleting collection: ${collectionPath}`);
    const refs = await db.collection(collectionPath).get();
    if (refs.empty) {
      console.log(`${collectionPath} is already empty.`);
      return;
    }
    const batch = db.batch();
    refs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`Deleted ${refs.size} documents from ${collectionPath}`);
  }

  try {
    await deleteCollection("users");
    await deleteCollection("messages");
    await deleteCollection("vaults");
    console.log("\nDATABASE WIPE COMPLETE!");
  } catch (err) {
    console.error("Error wiping database:", err);
  }
}

wipeDatabase();
