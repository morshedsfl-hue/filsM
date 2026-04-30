import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  profile: any;
  signUp: (email: string, pass: string, name: string) => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<any>;
  updateUserProfile: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        try {
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setProfile(docSnap.data());
          } else {
            // If profile doesn't exist, create it (likely first time Google login)
            const userData = {
              uid: user.uid,
              email: user.email || '',
              name: user.displayName || 'User',
              createdAt: serverTimestamp()
            };
            try {
              await setDoc(docRef, userData);
              const freshDoc = await getDoc(docRef);
              setProfile(freshDoc.data());
            } catch (writeErr) {
              handleFirestoreError(writeErr, OperationType.WRITE, `users/${user.uid}`);
            }
          }
        } catch (err: any) {
          // If it's a WRITE error, it was already handled above
          if (err.message && err.message.includes('operationType')) {
            throw err;
          }
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signUp = async (email: string, pass: string, name: string) => {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(res.user, { displayName: name });
    const userData = {
      uid: res.user.uid,
      email: email || '',
      name: name || 'User',
      createdAt: serverTimestamp()
    };
    try {
      await setDoc(doc(db, 'users', res.user.uid), userData);
      const updatedDoc = await getDoc(doc(db, 'users', res.user.uid));
      setProfile(updatedDoc?.data());
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${res.user.uid}`);
    }
  };

  const updateUserProfile = async (data: any) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'users', user.uid);
      await setDoc(docRef, data, { merge: true });
      const updatedDoc = await getDoc(docRef);
      setProfile(updatedDoc?.data());
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
    provider.addScope('https://www.googleapis.com/auth/userinfo.email');
    
    const result = await signInWithPopup(auth, provider);
    return GoogleAuthProvider.credentialFromResult(result);
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem('drive_access_token');
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider value={{ user, loading, profile, signUp, login, loginWithGoogle, updateUserProfile, logout, resetPassword }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
