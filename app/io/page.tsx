'use client';

import Header from '../components/Header';
import { Card } from '@/components/ui/card';

export default function IOPage() {
  return (
    <main className="h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">I/O Control</h1>
          <p className="text-muted-foreground">
            Digital input/output control page - Coming soon
          </p>
        </Card>
      </div>
    </main>
  );
}
