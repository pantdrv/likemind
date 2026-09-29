import { useState } from 'react';
import { Image, ImageStyle } from 'expo-image';
import { StyleProp } from 'react-native';
import { photoUrl, thumbUrl } from '../lib/photos';

// Small version of an uploaded photo for grids (disk-cached). Falls back to the full photo for old uploads without one.
export default function Thumb({ path, style }: { path: string; style?: StyleProp<ImageStyle> }) {
  const [failed, setFailed] = useState<string | null>(null); // path whose small copy is missing
  const full = failed === path;
  return (
    <Image source={{ uri: full ? photoUrl(path) : thumbUrl(path) }} style={[{ flex: 1 }, style]} contentFit="cover"
      cachePolicy="disk" transition={120} recyclingKey={path} onError={() => !full && setFailed(path)} />
  );
}
