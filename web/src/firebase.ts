import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth'; // <--- NEW IMPORT

const firebaseConfig = {
  apiKey: "AIzaSyD2439CzuRoCareQ0vPi0VXoXxqpUpPyfE",
  authDomain: "tool-deals.firebaseapp.com",
  projectId: "tool-deals",
  storageBucket: "tool-deals.firebasestorage.app",
  messagingSenderId: "730059424612",
  appId: "1:730059424612:web:09892614c1d0e4e8b83071",
  measurementId: "G-7D7K3F2PPW"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app); // <--- EXPORT AUTH