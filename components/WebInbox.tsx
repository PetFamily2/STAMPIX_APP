import { useAuthToken } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { useUser } from '@/contexts/UserContext';
import { createHttpTransport } from '@/lib/web-scanner/httpTransport';
import { getConvexUrl } from '@/utils/convexConfig';

type Message = {
  id: string;
  title: string;
  body: string;
  readAt: number | null;
  createdAt: number;
};
export default function WebInbox() {
  const rows = useQuery(makeFunctionReference<'query'>('webInbox:list'), {}) as
    | Message[]
    | undefined;
  const { user } = useUser();
  const token = useAuthToken();
  const current = useRef({ user, token });
  current.current = { user, token };
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(false);
  const actorId = user?._id;
  useEffect(() => {
    void actorId;
    setBusy(null);
    setError(false);
  }, [actorId]);
  const read = async (id: string) => {
    if (busy || !user || !token) return;
    setBusy(id);
    setError(false);
    try {
      const scope = {
        actorId: user._id,
        businessId: '',
        programId: '',
        runtimeId: '',
        deviceId: '',
      };
      await createHttpTransport({
        url: getConvexUrl(),
        token: () => current.current.token,
        valid: () => current.current.user?._id === scope.actorId,
        online: () =>
          typeof navigator === 'undefined' || navigator.onLine !== false,
      }).request(scope, 'mutation', 'webInbox:markRead', { id });
    } catch {
      if (current.current.user?._id === user._id) setError(true);
    } finally {
      if (current.current.user?._id === user._id) setBusy(null);
    }
  };
  return (
    <View style={styles.page}>
      <Text accessibilityRole="header" style={styles.title}>
        תיבת הודעות
      </Text>
      {rows === undefined ? (
        <Text style={styles.text}>טוענים…</Text>
      ) : !rows.length ? (
        <Text style={styles.text}>אין הודעות חדשות.</Text>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={styles.card}>
            <Text style={styles.title}>{row.title}</Text>
            <Text style={styles.text}>{row.body}</Text>
            {!row.readAt ? (
              <ActionButton
                disabled={!!busy}
                label="סימון כנקרא"
                onPress={() => void read(row.id)}
              />
            ) : (
              <Text style={styles.text}>נקרא</Text>
            )}
          </View>
        ))
      )}
      {error ? (
        <Text accessibilityRole="alert" style={styles.text}>
          לא ניתן לעדכן כעת. נסו שוב כשיש חיבור.
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    padding: 20,
    gap: 16,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
  },
  card: { borderRadius: 16, backgroundColor: 'white', padding: 20, gap: 12 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  text: { fontSize: 16, textAlign: 'right', writingDirection: 'rtl' },
});
