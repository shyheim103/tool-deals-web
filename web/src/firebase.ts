import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Your configuration from the old file
const firebaseConfig = {
  apiKey: "AIzaSyD2439CzuRoCareQ0vPi0VXoXxqpUpPyfE",
  authDomain: "tool-deals.firebaseapp.com",
  projectId: "tool-deals",
  storageBucket: "tool-deals.firebasestorage.app",
  messagingSenderId: "730059424612",
  appId: "1:730059424612:web:09892614c1d0e4e8b83071",
  measurementId: "G-7D7K3F2PPW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the database so Main.tsx can use it
export const db = getFirestore(app);