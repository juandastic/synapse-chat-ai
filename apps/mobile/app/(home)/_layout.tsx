import { useMemo } from "react";
import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet } from "react-native";
import { ThreadList } from "../../src/components/ThreadList";
import { usePostHogIdentify } from "../../src/hooks/usePostHogIdentify";
import { useTermsSync } from "../../src/hooks/useTermsSync";
import { useColors } from "../../src/contexts/ThemeContext";

export default function HomeLayout() {
  usePostHogIdentify();
  useTermsSync();
  const colors = useColors();

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1 },
    drawer: {
      width: 300,
      backgroundColor: colors.paper,
    },
  }), [colors]);

  return (
    <GestureHandlerRootView style={s.root}>
      <Drawer
        drawerContent={(props) => <ThreadList {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: "front",
          drawerStyle: s.drawer,
          swipeEdgeWidth: 50,
        }}
      >
        <Drawer.Screen name="index" options={{ title: "Home" }} />
        <Drawer.Screen name="[threadId]" options={{ title: "Chat" }} />
        <Drawer.Screen name="personas" options={{ title: "Personas" }} />
        <Drawer.Screen name="memory" options={{ title: "Memory" }} />
        <Drawer.Screen name="notion" options={{ title: "Notion" }} />
        <Drawer.Screen name="plans" options={{ title: "Plans" }} />
        <Drawer.Screen name="settings" options={{ title: "Account" }} />
      </Drawer>
    </GestureHandlerRootView>
  );
}
