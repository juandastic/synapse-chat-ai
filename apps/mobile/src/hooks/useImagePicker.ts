import { useState, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

const MAX_IMAGES = 4;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface PickedImage {
  uri: string;
  id: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
}

export function useImagePicker() {
  const [images, setImages] = useState<PickedImage[]>([]);

  const pickImages = useCallback(async () => {
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Please allow access to your photo library to attach images."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (result.canceled) return;

    const newImages: PickedImage[] = [];
    for (const asset of result.assets) {
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        Alert.alert("File too large", `${asset.fileName ?? "Image"} exceeds 10MB limit`);
        continue;
      }
      newImages.push({
        uri: asset.uri,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: asset.fileName ?? `image-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? "image/jpeg",
        fileSize: asset.fileSize,
      });
    }

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages].slice(0, MAX_IMAGES));
    }
  }, [images.length]);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearImages = useCallback(() => {
    setImages([]);
  }, []);

  const restoreImages = useCallback((imgs: PickedImage[]) => {
    setImages(imgs);
  }, []);

  return { images, pickImages, removeImage, clearImages, restoreImages, maxImages: MAX_IMAGES };
}
