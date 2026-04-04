import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet } from "react-native";
import { ThreadList } from "../../src/components/ThreadList";

export default function HomeLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <Drawer
        drawerContent={(props) => <ThreadList {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: "front",
          drawerStyle: styles.drawer,
          swipeEdgeWidth: 50,
        }}
      >
        <Drawer.Screen name="index" options={{ title: "Home" }} />
        <Drawer.Screen name="[threadId]" options={{ title: "Chat" }} />
        <Drawer.Screen name="personas" options={{ title: "Personas" }} />
        <Drawer.Screen name="memory" options={{ title: "Memory" }} />
        <Drawer.Screen name="notion" options={{ title: "Notion" }} />
        <Drawer.Screen name="plans" options={{ title: "Plans" }} />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  drawer: {
    width: 300,
    backgroundColor: "#f5f0e8",
  },
});
