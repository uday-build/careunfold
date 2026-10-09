"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api, safeNext } from "@/lib/api";
import { reduceForm } from "@/lib/form-state";
import { Notice, TextField } from "@/components/shell";

type PublicConfig = { googleSignIn: boolean; emailDelivery: "resend" | "dev-sink" | "unconfigured" };

const deliveryCopy: Record<PublicConfig["emailDelivery"], string> = {
  resend: "If a message can be sent, it will go to that inbox.",
  "dev-sink": "Email delivery is in local development mode. Messages are stored in the development outbox and are not sent to an inbox.",
  unconfigured: "Email delivery is not configured, so a verification or recovery message cannot be sent until that is set up.",
};

export function SignUpForm({ config }: { config: PublicConfig }) {
  const [values, setValues] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    const result = await authClient.signUp.email({
      email: values.email,
      password: values.password,
      name: "",
      callbackURL: "/verify-email",
    });
    setPending(false);
    if (result.error) {
      setValues((current) => reduceForm(current, { type: "error" }));
      setError(result.error.message || "The account could not be created. Nothing was confirmed.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Notice tone="info" title="Check the next step for this email">
        If this address can be registered, the next step is email verification. If you already have an account, sign in or reset your password. {deliveryCopy[config.emailDelivery]}
      </Notice>
    );
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <TextField id="email" label="Email" type="email" autoComplete="email" required value={values.email} onChange={(email) => setValues((current) => reduceForm(current, { type: "edit", name: "email", value: email }))} />
      <TextField id="password" label="Password" type="password" autoComplete="new-password" required value={values.password} onChange={(password) => setValues((current) => reduceForm(current, { type: "edit", name: "password", value: password }))} />
      <p className="muted">Use at least 12 characters. Your password is sent to the server and is not stored in this browser.</p>
      {error ? <p className="form-error" role="alert">Error: {error}</p> : null}
      <button className="primary" type="submit" disabled={pending}>{pending ? "Creating account" : "Create account"}</button>
    </form>
  );
}

export function SignInForm({ config, next, initialError }: { config: PublicConfig; next?: string; initialError?: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ email: "", password: "" });
  const [error, setError] = useState(initialError ?? "");
  const [pending, setPending] = useState(false);
  const destination = safeNext(next);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await authClient.signIn.email({ email: values.email, password: values.password });
    setPending(false);
    if (result.error) {
      setValues((current) => reduceForm(current, { type: "error" }));
      setError(result.error.code === "EMAIL_NOT_VERIFIED" ? "Verify your email before signing in. You can resend the message from the verification page." : "Email or password is incorrect.");
      return;
    }
    if (destination) {
      router.push(destination);
      return;
    }
    const me = await api<{ home: string }>("/api/me");
    router.push(me.ok ? me.data.home : "/onboarding/profile");
    router.refresh();
  }

  return (
    <div className="stack">
      <form className="stack" onSubmit={onSubmit}>
        <TextField id="email" label="Email" type="email" autoComplete="email" required value={values.email} onChange={(email) => setValues((current) => reduceForm(current, { type: "edit", name: "email", value: email }))} />
        <TextField id="password" label="Password" type="password" autoComplete="current-password" required value={values.password} onChange={(password) => setValues((current) => reduceForm(current, { type: "edit", name: "password", value: password }))} />
        {error ? <p className="form-error" role="alert">Error: {error}</p> : null}
        <button className="primary" type="submit" disabled={pending}>{pending ? "Signing in" : "Sign in"}</button>
      </form>
      <GoogleButton enabled={config.googleSignIn} />
      <p className="muted">{deliveryCopy[config.emailDelivery]}</p>
    </div>
  );
}

export function GoogleButton({ enabled }: { enabled: boolean }) {
  const [error, setError] = useState("");
  if (!enabled) {
    return <Notice tone="pending" title="Google sign-in is not configured">Add the Google client ID and secret on the server before this can be used. No Google session will be created.</Notice>;
  }
  return (
    <div className="stack">
      <button
        className="secondary"
        type="button"
        onClick={async () => {
          setError("");
          const result = await authClient.signIn.social({
            provider: "google",
            callbackURL: "/auth/continue",
            errorCallbackURL: "/sign-in",
          });
          if (result?.error) setError("Google sign-in did not start. You can try again or use email.");
        }}
      >
        Continue with Google
      </button>
      {error ? <p className="form-error" role="alert">Error: {error}</p> : null}
    </div>
  );
}

export function ForgotPasswordForm({ config }: { config: PublicConfig }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (result.error && result.error.status !== 200) {
      setError("The reset request could not be completed. Try again when the service is available.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return <Notice tone="info" title="If an account can be recovered, the next step is the same">Use the reset message if it arrives, or return to sign in. {deliveryCopy[config.emailDelivery]}</Notice>;
  }
  return (
    <form className="stack" onSubmit={onSubmit}>
      <TextField id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={setEmail} />
      {error ? <p className="form-error" role="alert">Error: {error}</p> : null}
      <button className="primary" type="submit">Send reset link</button>
    </form>
  );
}

export function ResetPasswordForm({ token, error }: { token?: string; error?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(error ?? "");
  const [pending, setPending] = useState(false);
  if (!token) {
    return <Notice tone="closed" title="This reset link cannot be used">Request a new reset link. Expired and used links do not change your password.</Notice>;
  }
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const result = await authClient.resetPassword({ newPassword: password, token });
        setPending(false);
        if (result.error) {
          setMessage("This reset link is invalid, expired, or already used. Request a new one.");
          return;
        }
        router.push("/sign-in");
      }}
    >
      <TextField id="password" label="New password" type="password" autoComplete="new-password" required value={password} onChange={setPassword} />
      {message ? <p className="form-error" role="alert">Error: {message}</p> : null}
      <button className="primary" type="submit" disabled={pending}>Save new password</button>
    </form>
  );
}

export function ResendVerificationForm({ config }: { config: PublicConfig }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  return done ? (
    <Notice tone="info" title="If a verification message can be sent, the next step is the same">{deliveryCopy[config.emailDelivery]}</Notice>
  ) : (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        await authClient.sendVerificationEmail({ email, callbackURL: "/verify-email" });
        setDone(true);
      }}
    >
      <TextField id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={setEmail} />
      <button className="primary" type="submit">Resend verification</button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="secondary"
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
