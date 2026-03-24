"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sileo";
import { TRPCReactProvider } from "@/utils/trpc";

interface ProvidersProps {
  children: React.ReactNode;
}

function SileoToaster() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <Toaster
      position="bottom-right"
      theme={isDark ? "light" : "dark"}
      options={{ fill: isDark ? "#262626" : undefined }}
    />
  );
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <TRPCReactProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <SileoToaster />
        </ThemeProvider>
      </TRPCReactProvider>
    </SessionProvider>
  );
}