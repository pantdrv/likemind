import { Image, Text, View } from 'react-native';
import { c, font } from '../lib/theme';

// Round profile picture; falls back to the first letter of the name on a colour disc.
export default function Avatar({ url, name, size = 40, color = c.lime }: { url?: string | null; name?: string; size?: number; color?: string }) {
  const box = { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: c.ink, overflow: 'hidden' as const };
  if (url) return <Image source={{ uri: url }} style={box} />;
  return (
    <View style={[box, { backgroundColor: color, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontFamily: font.black, fontSize: size * 0.42, color: c.ink }}>{(name || '?')[0].toUpperCase()}</Text>
    </View>
  );
}
