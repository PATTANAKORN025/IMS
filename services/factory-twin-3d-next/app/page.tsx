import TwinShell from '@/components/factory-twin/TwinShell';

// Server Component. Step 3 scope: UI shell only -- see TwinShell.tsx and
// ViewportFrame.tsx's renderer-boundary comment. No Three.js scene here.
export default function FactoryTwinPage() {
  return <TwinShell />;
}
