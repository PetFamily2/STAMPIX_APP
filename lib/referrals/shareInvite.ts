import { Alert, Share } from 'react-native';
import * as Sharing from 'expo-sharing';

import { REFERRAL_COPY } from '@/lib/referrals/copy';

export async function shareReferralInvite(args: {
  shareText: string;
  url: string;
  imageUri?: string | null;
}) {
  try {
    if (args.imageUri) {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(args.imageUri, {
          mimeType: 'image/png',
          dialogTitle: REFERRAL_COPY.inviteCta,
        });
      }
    }
    await Share.share({
      message: args.shareText,
      url: args.url,
    });
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('cancel')) {
      return { ok: false as const, reason: 'cancelled' };
    }
    Alert.alert(REFERRAL_COPY.copyLink, args.url);
    return { ok: false as const, reason: 'share_unavailable' };
  }
}
