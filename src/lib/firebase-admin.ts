import * as admin from "firebase-admin";
import fs from 'fs';
import path from 'path';

let serviceAccount: any = null;

// 1. Try environment variable
let saEnv = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
if (saEnv) {
  try {
    saEnv = saEnv.replace(/^['"]|['"]$/g, '');
    serviceAccount = JSON.parse(saEnv);
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var, falling back to file.");
  }
}

// 2. Try local file if env var failed or is missing
if (!serviceAccount) {
  const rootDir = process.cwd();
  const files = fs.readdirSync(rootDir);
  const saFile = files.find(f => f.endsWith('.json') && f.includes('firebase-adminsdk'));
  if (saFile) {
    serviceAccount = JSON.parse(fs.readFileSync(path.join(rootDir, saFile), 'utf8'));
    console.log("Loaded Firebase Service Account from file:", saFile);
  }
}

if (!admin.apps.length) {
  const config = {
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  };

  if (serviceAccount) {
    admin.initializeApp({
      ...config,
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    // Falls back to Application Default Credentials if running on GCP
    admin.initializeApp(config);
  }
}

const auth = admin.auth();
const db = admin.firestore();
const rtdb = admin.database();

export { auth, db, rtdb };
