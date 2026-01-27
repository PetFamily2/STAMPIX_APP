import { Redirect } from 'expo-router';

// הפניה ברירת מחדל לדף ברוכים הבאים
export default function AuthIndex() {
  return <Redirect href="/(auth)/sign-up" />;
}
