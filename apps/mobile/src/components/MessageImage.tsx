import { memo, useState } from "react";
import {
  View,
  Image,
  StyleSheet,
  Pressable,
  Modal,
  Dimensions,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@synapse/backend/api";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../constants/colors";

interface MessageImageProps {
  imageKey: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export const MessageImage = memo(function MessageImage({ imageKey }: MessageImageProps) {
  const imageUrl = useQuery(api.messages.getImageUrl, { key: imageKey });
  const [fullscreen, setFullscreen] = useState(false);
  const insets = useSafeAreaInsets();

  if (!imageUrl) {
    return <View style={styles.skeleton} />;
  }

  return (
    <>
      <Pressable onPress={() => setFullscreen(true)}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      </Pressable>

      <Modal
        visible={fullscreen}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreen(false)}
      >
        <View style={styles.fullscreenBg}>
          <Pressable
            style={[styles.closeButton, { top: insets.top + 12 }]}
            onPress={() => setFullscreen(false)}
          >
            <X size={24} color="#fff" />
          </Pressable>
          <Image
            source={{ uri: imageUrl }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  skeleton: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "rgba(139, 94, 60, 0.08)",
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    maxHeight: 200,
  },
  fullscreenBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
});
