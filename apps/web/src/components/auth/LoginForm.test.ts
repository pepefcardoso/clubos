import { describe, it, expect } from "vitest";
import { z } from "zod";

const loginSchema = z.object({
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

type LoginFields = z.infer<typeof loginSchema>;

function validate(data: unknown): {
  success: boolean;
  errors: Record<string, string>;
} {
  const result = loginSchema.safeParse(data);
  if (result.success) return { success: true, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]);
    if (!errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}

describe("LoginForm — email validation", () => {
  it("accepts a valid email", () => {
    const { success } = validate({
      email: "tesoureiro@clube.com",
      password: "senha1234",
    });
    expect(success).toBe(true);
  });

  it("rejects missing email", () => {
    const { errors } = validate({ email: "", password: "senha1234" });
    expect(errors.email).toBeDefined();
  });

  it("rejects email without @", () => {
    const { errors } = validate({ email: "notanemail", password: "senha1234" });
    expect(errors.email).toMatch(/e-mail/i);
  });

  it("rejects email without domain", () => {
    const { errors } = validate({ email: "user@", password: "senha1234" });
    expect(errors.email).toBeDefined();
  });

  it("accepts email with subdomain", () => {
    const { success } = validate({
      email: "user@mail.clube.com",
      password: "senha1234",
    });
    expect(success).toBe(true);
  });
});

describe("LoginForm — password validation", () => {
  it("accepts a password with exactly 8 chars", () => {
    const { success } = validate({
      email: "user@example.com",
      password: "12345678",
    });
    expect(success).toBe(true);
  });

  it("rejects a password shorter than 8 chars", () => {
    const { errors } = validate({
      email: "user@example.com",
      password: "1234567",
    });
    expect(errors.password).toMatch(/8 caracteres/i);
  });

  it("rejects empty password", () => {
    const { errors } = validate({ email: "user@example.com", password: "" });
    expect(errors.password).toBeDefined();
  });

  it("accepts long passwords", () => {
    const { success } = validate({
      email: "user@example.com",
      password: "a".repeat(100),
    });
    expect(success).toBe(true);
  });
});

describe("LoginForm — combined validation", () => {
  it("reports both errors when fields are empty", () => {
    const { success, errors } = validate({ email: "", password: "" });
    expect(success).toBe(false);
    expect(errors.email).toBeDefined();
    expect(errors.password).toBeDefined();
  });

  it("passes with valid credentials", () => {
    const data: LoginFields = {
      email: "admin@clubos.com",
      password: "supersecret",
    };
    const { success, errors } = validate(data);
    expect(success).toBe(true);
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
