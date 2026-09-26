import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { font, whenLabel } from '../lib/theme';

const YELLOW = '#FFD84D', INK = '#0E0E10', PINK = '#FF7AC3', BLUE = '#7CC4FF';
export type Joined = { id: string; icon: string; title: string; starts_at: string; venue_name: string };

// Loud "you're in" moment after joining a plan (the "Pop" design, used only for celebrations).
export function Celebrate({ plan, onOpen, onClose }: { plan: Joined | null; onOpen: (id: string) => void; onClose: () => void }) {
  return (
    <Modal visible={!!plan} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: YELLOW, padding: 24 }}>
        {plan && (<>
          <Pressable onPress={onClose} hitSlop={12} style={{ alignSelf: 'flex-end', width: 36, height: 36, borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.black, fontSize: 18, color: INK }}>✕</Text>
          </Pressable>
          <Text style={{ fontFamily: font.black, fontSize: 56, lineHeight: 56, color: INK, marginTop: 18, letterSpacing: -1.5 }}>YOU'RE{'\n'}IN.</Text>

          <View style={{ height: 190, marginTop: 24, alignItems: 'center', justifyContent: 'center' }}>
            <View style={[sq, { backgroundColor: PINK, transform: [{ rotate: '-8deg' }, { translateX: -44 }] }]}><Text style={{ fontSize: 56 }}>{plan.icon}</Text></View>
            <View style={[sq, { backgroundColor: BLUE, transform: [{ rotate: '6deg' }, { translateX: 44 }] }]}><Text style={{ fontSize: 56 }}>🙌</Text></View>
          </View>

          <View style={{ borderWidth: 2, borderColor: INK, backgroundColor: '#fff', padding: 14, marginTop: 8, boxShadow: `5px 5px 0px ${INK}` }}>
            <Text style={{ fontFamily: font.black, fontSize: 18, color: INK }} numberOfLines={2}>{plan.title}</Text>
            <Text style={{ fontFamily: font.semi, fontSize: 14, color: INK, marginTop: 4 }}>🗓 {whenLabel(plan.starts_at)}  ·  📍 {plan.venue_name}</Text>
          </View>
          <Text style={{ fontFamily: font.medium, color: INK, marginTop: 14 }}>Say hi in the group chat and check the exact spot on the plan page.</Text>

          <View style={{ flex: 1 }} />
          <Pressable onPress={() => onOpen(plan.id)} style={({ pressed }) => [{ backgroundColor: INK, paddingVertical: 18, alignItems: 'center', boxShadow: `5px 5px 0px ${PINK}` }, pressed && { opacity: 0.85 }]}>
            <Text style={{ fontFamily: font.black, color: YELLOW, fontSize: 16, letterSpacing: 1.5 }}>OPEN THE PLAN</Text>
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: 16 }}>
            <Text style={{ fontFamily: font.bold, color: INK, textDecorationLine: 'underline' }}>Keep exploring</Text>
          </Pressable>
        </>)}
      </SafeAreaView>
    </Modal>
  );
}

// const [celebration, celebrate] = useCelebrate(); … celebrate(plan) after a successful join; render {celebration}.
export function useCelebrate(onOpen: (id: string) => void) {
  const [plan, setPlan] = useState<Joined | null>(null);
  const node = <Celebrate plan={plan} onClose={() => setPlan(null)} onOpen={(id) => { setPlan(null); onOpen(id); }} />;
  return [node, setPlan] as const;
}

const sq = { position: 'absolute' as const, width: 130, height: 130, borderWidth: 3, borderColor: INK, alignItems: 'center' as const, justifyContent: 'center' as const, boxShadow: `6px 6px 0px ${INK}` };
