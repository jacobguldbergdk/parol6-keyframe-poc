'use client';

import Header from '../components/Header';
import { Card } from '@/components/ui/card';

export default function GripperPage() {
  return (
    <main className="h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Gripper Control</h1>
          <p className="text-muted-foreground">
            Electric gripper control and calibration page - Coming soon
          </p>
        </Card>
      </div>
    </main>
  );
}
