import { Redirect } from 'expo-router';

// Landing route for the Google sign-in redirect (Android opens it as a deep link).
// lib/google.ts finishes the sign-in; the root Gate then sends the user to login or home.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
