'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase not configured → Google button hidden; guest mode is the demo-safe path.
export const firebaseAvailable = Boolean(config.apiKey && config.authDomain && config.projectId);

function app(): FirebaseApp {
  return getApps()[0] ?? initializeApp(config);
}

export async function signInWithGoogle(): Promise<{ idToken: string }> {
  const auth = getAuth(app());
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  const idToken = await result.user.getIdToken();
  return { idToken };
}
