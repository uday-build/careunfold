import Link from "next/link";

export function Shell({
  children,
  nav,
}: {
  children: React.ReactNode;
  nav?: Array<{ href: string; label: string; current?: boolean }>;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">CareUnfold</Link>
        {nav ? (
          <nav className="nav" aria-label="Account">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} aria-current={item.current ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <main id="main">{children}</main>
    </div>
  );
}

export function Notice({ tone, title, children }: { tone: "active" | "pending" | "closed" | "info"; title: string; children: React.ReactNode }) {
  return (
    <div className="notice" role="status">
      <span className={`mark mark-${tone}`} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <div className="muted">{children}</div>
      </div>
    </div>
  );
}

export function TextField({
  id,
  label,
  type = "text",
  value,
  onChange,
  error,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required ? " (required)" : ""}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete={autoComplete}
        required={required}
      />
      {error ? <p id={errorId} className="field-error" role="alert">Error: {error}</p> : null}
    </div>
  );
}
