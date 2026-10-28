import { Platform, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { NativeCompanionRedirect } from '@/components/navigation/NativeCompanionRedirect';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { shareUrl } from '@/lib/shareUrl';
export default function BusinessWebQr() {
  const { activeBusiness } = useActiveBusiness();
  if (Platform.OS !== 'web') return <NativeCompanionRedirect />;
  const id = activeBusiness?.businessPublicId;
  const url = id
    ? shareUrl(`https://stampaix.com/join?biz=${encodeURIComponent(id)}`)
    : null;
  return (
    <View style={{ padding: 24, alignItems: 'center', gap: 20 }}>
      <Text
        accessibilityRole="header"
        style={{ fontSize: 24, textAlign: 'right' }}
      >
        קוד הצטרפות לעסק
      </Text>
      {url ? (
        <>
          <View accessible={true} accessibilityLabel="קוד QR להצטרפות לעסק">
            <QRCode value={url} size={220} />
          </View>
          <Text selectable={true} style={{ textAlign: 'right' }}>
            {url}
          </Text>
        </>
      ) : (
        <Text>קוד ההצטרפות אינו זמין כרגע.</Text>
      )}
    </View>
  );
}
