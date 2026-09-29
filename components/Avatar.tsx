import { useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { thumbFromUrl } from '../lib/photos';
import { c, font } from '../lib/theme';

// Round profile picture; falls back to the first letter of the name on a colour disc.
// Loads the small copy of the photo (disk-cached), and the full photo if an older upload has no small copy.
export default function Avatar({ url, name, size = 40, color = c.lime }: { url?: string | null; name?: string; size?: number; color?: string }) {
  const [failed, setFailed] = useState<string | null>(null); // URL whose small copy is missing
  const box = { width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: c.line, overflow: 'hidden' as const };
  if (url) {
    const small = thumbFromUrl(url);
    const full = failed === url;
    return (
      <Image source={{ uri: small && !full ? small : url }} style={box} contentFit="cover" cachePolicy="disk" recyclingKey={url}
        onError={() => small && !full && setFailed(url)} />
    );
  }
  return (
    <View style={[box, { backgroundColor: color, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontFamily: font.black, fontSize: size * 0.42, color: c.ink }}>{(name || '?')[0].toUpperCase()}</Text>
    </View>
  );
}
