import { AssistedConsentCapture } from '../../../components/assisted-consent-capture';

export default async function AssistedConsentPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  return <AssistedConsentCapture storyId={storyId} />;
}
