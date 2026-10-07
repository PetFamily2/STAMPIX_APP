import { useRouter } from 'expo-router';
import { WelcomeContent } from '@/components/public-web/WelcomeContent';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

export default function WebWelcomeScreen() {
  const router = useRouter();
  const { completeStep, trackContinue } = useOnboardingTracking({
    screen: 'welcome',
  });
  return (
    <WelcomeContent
      onNavigate={(event, href) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        if (href === '/sign-up') {
          trackContinue();
          completeStep();
        }
        router.push(href);
      }}
    />
  );
}
