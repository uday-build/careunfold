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
        If this address can be registered, the next step is email verification. After that, access still waits for administrator approval. If you already have an account, sign in or reset your password. {deliveryCopy[config.emailDelivery]}
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
      <p className="muted">{deliveryCopy[config.emailDelivery]}</p>
    </div>
  );
}

export function GoogleButton({
  enabled,
  label,
  returnTo,
}: {
  enabled: boolean;
  label: string;
  returnTo: "/sign-in" | "/sign-up";
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (!enabled) {
    return (
      <Notice tone="pending" title="Google is not configured yet">
        The server needs a Google client ID and secret before this option works. No Google account will be created.
      </Notice>
    );
  }
  return (
    <div className="stack">
      <button
        className="secondary google"
        type="button"
        disabled={pending}
        onClick={async () => {
          setError("");
          setPending(true);
          const result = await authClient.signIn.social({
            provider: "google",
            callbackURL: "/auth/continue",
            newUserCallbackURL: "/auth/continue",
            errorCallbackURL: returnTo,
          });
          if (result?.error) {
            setPending(false);
            setError("Google sign-in did not start. Try again, or use email and password.");
          }
        }}
      >
        <GoogleMark />
        {pending ? "Opening Google" : label}
      </button>
      <p className="muted">CareUnfold asks Google only for your name, email address, and profile picture.</p>
      {error ? <p className="form-error" role="alert">Error: {error}</p> : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
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

export function SignOutButton({ className = "secondary" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      className={className}
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
