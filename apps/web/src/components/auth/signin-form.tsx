import { useState, useEffect } from "react";
import { useRouter, useSearch } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { sileo } from "sileo";

import { useSignIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Icons } from "@/components/ui/icons";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignInFormData = z.infer<typeof signInSchema>;

export function SignInForm() {
  const router = useRouter();
  const search = useSearch({ strict: false }) as { error?: string; next?: string };

  const signInMutation = useSignIn();
  const isLoading = signInMutation.isPending;

  useEffect(() => {
    const error = search.error;
    if (error === "AccountNotFound") {
      sileo.error({ title: "Account not found. Please contact your administrator." });
    } else if (error === "NoEmail") {
      sileo.error({ title: "Could not retrieve email from provider." });
    } else if (error === "OAuthAccountNotLinked") {
      sileo.error({ title: "This email is already registered with a different sign-in method." });
    }
  }, [search.error]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInFormData) => {
    try {
      await signInMutation.mutateAsync({ email: data.email, password: data.password });
      sileo.success({ title: "Signed in successfully!" });
      router.navigate({ to: (search.next as string) ?? "/dashboard" });
    } catch (error) {
      console.error('Sign in error:', error);
      sileo.error({ title: (error as Error).message || "Invalid credentials. Please try again." });
    }
  };

  // Google / GitHub OAuth not implemented in the Bun+Hono rewrite yet.
  // Buttons render disabled so the UI stays faithful but clicks no-op with a hint.
  const handleGoogleSignIn = () => {
    sileo.error({ title: "Google sign-in will return once OAuth is re-wired (coming soon)." });
  };
  const handleGitHubSignIn = () => {
    sileo.error({ title: "GitHub sign-in will return once OAuth is re-wired (coming soon)." });
  };

  return (
    <div className="space-y-6">
      {/* OAuth Providers */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={handleGoogleSignIn}
          disabled
          className="h-11"
        >
          <Icons.google className="mr-2 h-4 w-4" />
          Google
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={handleGitHubSignIn}
          disabled
          className="h-11"
        >
          <Icons.gitHub className="mr-2 h-4 w-4" />
          GitHub
        </Button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with email
          </span>
        </div>
      </div>

      {/* Email/Password Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            {...register("email")}
            disabled={isLoading}
            className="h-11"
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            {...register("password")}
            disabled={isLoading}
            className="h-11"
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full h-11" disabled={isLoading}>
          {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
          Sign In
        </Button>
      </form>

      {import.meta.env.VITE_IS_MULTI_TENANT === "true" && (
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a href="/auth/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign up
          </a>
        </p>
      )}
    </div>
  );
}
