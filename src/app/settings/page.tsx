import type { Metadata } from 'next';
import { SettingsView } from './settings-view';

export const metadata: Metadata = {
  title: 'Settings — TwinMind',
  description: 'Your Groq API key, prompt defaults, and runtime knobs.',
};

export default function SettingsPage() {
  return <SettingsView />;
}
