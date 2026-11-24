import { Redirect } from 'expo-router';

export default function Campaigns() {
  return (
    <Redirect
      href={{
        pathname: '/business/loyalty',
        params: { segment: 'campaigns' },
      }}
    />
  );
}
