
// Standard modular Firebase v9+ initialization
// Use separate imports for value and type to resolve potential "no exported member" errors in some environments.
// Fix: Use wildcard import and destructuring to resolve 'no exported member' errors for initializeApp.
import * as firebaseApp from "firebase/app";
const { initializeApp } = firebaseApp as any;

// Fix: Removed unused 'FirebaseApp' type import which was causing compilation errors.

import { 
  getFirestore, 
  Firestore,
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where,
  Timestamp,
  deleteDoc,
  doc,
  updateDoc
} from "firebase/firestore";
import { 
  getAuth, 
  Auth,
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User
} from "firebase/auth";
import { StoredDocument } from "../types";

// State to track if we've hit a permission error
let internalPermissionError = false;

const firebaseConfig = {
  apiKey: "AIzaSyDf4CzUgSSGpRKlaLZiHTV25PHPUq4gltQ",
  authDomain: "spiked-ai-76993.firebaseapp.com",
  projectId: "spiked-ai-76993",
  storageBucket: "spiked-ai-76993.firebasestorage.app",
  messagingSenderId: "937017757020",
  appId: "1:937017757020:web:1a899a8be406844e268599"
};

// Properly type db and auth instances instead of using any
let db: Firestore | null = null;
let auth: Auth | null = null;

// Initialize Firebase App, Firestore, and Auth
try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY") {
    // Correct modular initialization for Firebase v9+
    // Using any for app to bypass potential type export issues in this environment
    const app: any = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  }
} catch (error) {
  console.error("Firebase Initialization Error:", error);
}

const COLLECTION_NAME = "cognitive_documents";

export const getAuthInstance = () => auth;
export const getDbInstance = () => db;

export const getFirebasePermissionError = () => internalPermissionError;
export const clearFirebasePermissionError = () => { internalPermissionError = false; };

// Auth Helper Functions
export const loginUser = (email: string, pass: string) => auth ? signInWithEmailAndPassword(auth, email, pass) : Promise.reject("Auth module not initialized");
export const registerUser = (email: string, pass: string) => auth ? createUserWithEmailAndPassword(auth, email, pass) : Promise.reject("Auth module not initialized");
export const logoutUser = () => auth && signOut(auth);
export const subscribeToAuth = (callback: (user: User | null) => void) => {
  if (auth) {
    return onAuthStateChanged(auth, callback);
  }
  // Return a no-op cleanup function if auth is not initialized
  return () => {};
};

export const saveDocumentToFirebase = async (name: string, content: string, type: string): Promise<string | null> => {
  if (!db || !auth || !auth.currentUser) return null;

  try {
    const now = Timestamp.now();
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      userId: auth.currentUser.uid, // Tie document to unique user
      name,
      content,
      type,
      timestamp: now,
      updatedAt: now
    });
    internalPermissionError = false;
    return docRef.id;
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      internalPermissionError = true;
      console.error("CRITICAL: Firestore Permission Denied. Ensure rules are updated to check request.auth.uid.");
    }
    return null;
  }
};

export const updateDocumentInFirebase = async (id: string, newContent: string): Promise<boolean> => {
  if (!db || !auth || !auth.currentUser) return false;
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    // Note: Firestore rules should prevent updating if userId doesn't match
    await updateDoc(docRef, {
      content: newContent,
      updatedAt: Timestamp.now()
    });
    return true;
  } catch (error: any) {
    console.error("Error updating document:", error);
    return false;
  }
};

export const fetchDocumentsFromFirebase = async (): Promise<StoredDocument[]> => {
  if (!db || !auth || !auth.currentUser) return [];

  try {
    // Filter by userId and sort results client-side to avoid composite index requirements.
    const q = query(
      collection(db, COLLECTION_NAME), 
      where("userId", "==", auth.currentUser.uid)
    );
    const querySnapshot = await getDocs(q);
    internalPermissionError = false;
    
    const docs = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        content: data.content,
        type: data.type,
        timestamp: data.timestamp?.toMillis() || Date.now(),
        updatedAt: data.updatedAt?.toMillis() || data.timestamp?.toMillis() || Date.now()
      };
    });

    // Client-side sort by timestamp descending
    return docs.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      internalPermissionError = true;
    }
    console.error("Fetch documents failed:", error);
    return [];
  }
};

export const deleteDocumentFromFirebase = async (id: string): Promise<boolean> => {
  if (!db || !auth || !auth.currentUser) return false;
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    internalPermissionError = false;
    return true;
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      internalPermissionError = true;
    }
    return false;
  }
};

export const isFirebaseActive = (): boolean => !!db;
