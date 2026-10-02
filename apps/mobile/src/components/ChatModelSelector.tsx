import { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Check, ChevronDown, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@synapse/backend/chatModels";
import { useColors } from "../contexts/ThemeContext";
import { SlideUpModal } from "./SlideUpModal";

interface ChatModelSelectorProps {
  modelId: string;
  onSelect: (modelId: string) => void;
  hasImages: boolean;
  capabilitiesLoading: boolean;
  disabled: boolean;
}

export function ChatModelSelector({
  modelId,
  onSelect,
  hasImages,
  capabilitiesLoading,
  disabled,
}: ChatModelSelectorProps) {
  const [visible, setVisible] = useState(false);
  const colors = useColors();
  const { t } = useTranslation("chat");
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const selected =
    CHAT_MODELS.find((model) => model.id === modelId) ?? DEFAULT_CHAT_MODEL;
  const close = () => setVisible(false);
  useEffect(() => {
    if (disabled) setVisible(false);
  }, [disabled]);
  const s = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          minHeight: 44,
          maxWidth: "100%",
          paddingHorizontal: 12,
        },
        chipLabel: { fontSize: 12, color: colors.inkMuted, flexShrink: 1 },
        sheet: {
          maxHeight: height * 0.8,
          backgroundColor: colors.paper,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingTop: 10,
          paddingBottom: Math.max(12, insets.bottom),
        },
        handle: {
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.rule,
          alignSelf: "center",
          marginBottom: 8,
        },
        header: {
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 20,
          paddingRight: 8,
        },
        title: { flex: 1, fontSize: 19, fontWeight: "600", color: colors.ink },
        close: {
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
        },
        description: {
          color: colors.inkMuted,
          fontSize: 13,
          lineHeight: 18,
          paddingHorizontal: 20,
          marginBottom: 12,
        },
        list: { paddingHorizontal: 12 },
        option: {
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        },
        selected: { backgroundColor: colors.accentLight },
        disabled: { opacity: 0.45 },
        optionBody: { flex: 1 },
        name: { fontSize: 15, color: colors.ink, fontWeight: "500" },
        detail: {
          fontSize: 12,
          lineHeight: 17,
          color: colors.inkMuted,
          marginTop: 3,
        },
      }),
    [colors, height, insets.bottom],
  );

  return (
    <>
      <Pressable
        testID="chat-model-selector"
        style={[s.chip, disabled && s.disabled]}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t("chatInput.chooseModel", {
          model: selected.name,
        })}
        accessibilityState={{ disabled, expanded: visible }}
        onPress={() => {
          Keyboard.dismiss();
          setVisible(true);
        }}
      >
        <Text numberOfLines={1} style={s.chipLabel}>
          {selected.name}
        </Text>
        <ChevronDown size={14} color={colors.inkMuted} />
      </Pressable>
      <SlideUpModal
        visible={visible && !disabled}
        onRequestClose={close}
        onBackdropPress={close}
      >
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>{t("chatInput.modelTitle")}</Text>
            <Pressable
              style={s.close}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={t("chatInput.closeModelSelector")}
            >
              <X size={20} color={colors.inkMuted} />
            </Pressable>
          </View>
          <Text style={s.description}>{t("chatInput.modelContextHint")}</Text>
          <ScrollView style={s.list}>
            {CHAT_MODELS.map((model) => {
              const unavailable =
                !model.images && (hasImages || capabilitiesLoading);
              const isSelected = selected.id === model.id;
              const detail =
                model.provider === "vertex"
                  ? t("chatInput.modelDefault")
                  : `OpenRouter · ${t(model.reasoning === "high" ? "chatInput.reasoningHigh" : "chatInput.reasoningThinking")}`;
              return (
                <Pressable
                  key={model.id}
                  testID={`chat-model-${model.id}`}
                  style={[
                    s.option,
                    isSelected && s.selected,
                    unavailable && s.disabled,
                  ]}
                  disabled={unavailable}
                  accessibilityRole="radio"
                  accessibilityLabel={`${model.name}. ${detail}${unavailable ? `. ${t(hasImages ? "chatInput.modelTextOnly" : "chatInput.modelCheckingImages")}` : ""}`}
                  accessibilityState={{
                    checked: isSelected,
                    disabled: unavailable,
                  }}
                  onPress={() => {
                    onSelect(model.id);
                    close();
                  }}
                >
                  <View style={s.optionBody}>
                    <Text style={s.name}>{model.name}</Text>
                    <Text style={s.detail}>{detail}</Text>
                    {unavailable && (
                      <Text style={s.detail}>
                        {t(
                          hasImages
                            ? "chatInput.modelTextOnly"
                            : "chatInput.modelCheckingImages",
                        )}
                      </Text>
                    )}
                  </View>
                  {isSelected && <Check size={18} color={colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </SlideUpModal>
    </>
  );
}
