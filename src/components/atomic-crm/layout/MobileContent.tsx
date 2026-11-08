import { type ReactNode } from "react";

export const MobileContent = ({ children }: { children: ReactNode }) => (
  <main
    className="max-w-screen-xl mx-auto pt-[calc(4.5rem+env(safe-area-inset-top))] px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] min-h-screen overflow-y-auto"
    id="main-content"
  >
    {children}
  </main>
);
