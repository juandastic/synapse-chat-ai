import { useEffect, useRef, type ReactNode } from "react";
import {
  Modal,
  Animated,
  Pressable,
  StyleSheet,
  Dimensions,
  type ModalProps,
} from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;

interface SlideUpModalProps extends Pick<ModalProps, "onRequestClose"> {
  visible: boolean;
  children: ReactNode;
  onBackdropPress?: () => void;
}

/**
 * Modal that fades the backdrop in while sliding the content up.
 * Drop-in replacement for <Modal animationType="slide">.
 */
export function SlideUpModal({
  visible,
  children,
  onBackdropPress,
  onRequestClose,
}: SlideUpModalProps) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    }
  }, [visible, translateY]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <Pressable style={styles.backdrop} onPress={onBackdropPress} />
      <Animated.View
        pointerEvents="box-none"
        style={[styles.contentWrapper, { transform: [{ translateY }] }]}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  contentWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
});
