import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";

export default function Root() {
  const { isSignedIn } = useAuth();
  return <Redirect href={isSignedIn ? "/(home)" : "/(auth)"} />;
}
