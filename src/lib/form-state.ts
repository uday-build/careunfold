export type FormValues = Record<string, string>;

export function reduceForm<T extends FormValues>(
  values: T,
  event: { type: "edit"; name: string; value: string } | { type: "error" } | { type: "success" },
): T {
  if (event.type === "edit") return { ...values, [event.name]: event.value };
  return values;
}
