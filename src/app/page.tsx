import { ChatColumn } from '@/components/columns/chat-column';
import { SuggestionsColumn } from '@/components/columns/suggestions-column';
import { TranscriptColumn } from '@/components/columns/transcript-column';
import { Header } from '@/components/header';
import { SessionLoader } from '@/components/session-loader';

export default function Home() {
  return (
    <div className="flex h-dvh flex-col">
      <SessionLoader />
      <Header />
      <main className="mx-auto grid min-h-0 w-full max-w-screen-2xl flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-3">
        <TranscriptColumn />
        <SuggestionsColumn />
        <ChatColumn />
      </main>
    </div>
  );
}
