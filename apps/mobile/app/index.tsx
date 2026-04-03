import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/clerk-expo";
import { api } from "@synapse/backend/api";

export default function HomeScreen() {
  const { isSignedIn } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Synapse</Text>
      <Text style={styles.subtitle}>
        {isSignedIn ? "You're signed in!" : "Welcome to Synapse"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#faf8f5",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
  },
});
