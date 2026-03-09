"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Informe seu nome completo"),
  email: z.string().email("Informe um e-mail válido"),
  message: z
    .string()
    .min(10, "A mensagem deve ter ao menos 10 caracteres"),
});

type FormData = z.infer<typeof schema>;

export function ContactForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const json = await res.json();
        setServerError(
          json.error ??
            "Não conseguimos enviar sua mensagem. Tente novamente.",
        );
        return;
      }

      setSubmitted(true);
    } catch {
      setServerError(
        "Erro de conexão. Verifique sua internet e tente novamente.",
      );
    }
  };

  if (submitted) {
    return (
      <div
        className="flex flex-col items-center gap-4 py-12 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center">
          <CheckCircle
            size={28}
            className="text-primary-600"
            aria-hidden="true"
          />
        </div>
        <h2 className="text-xl font-bold text-neutral-900">
          Mensagem enviada!
        </h2>
        <p className="text-neutral-500 text-sm max-w-xs">
          Recebemos seu contato e responderemos em até 1 dia útil.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
      noValidate
    >
      {serverError && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {serverError}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">
          Nome{" "}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Seu nome completo"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
          {...register("name")}
        />
        {errors.name && (
          <p id="name-error" className="text-sm text-danger" role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">
          E-mail{" "}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="voce@clube.com.br"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p id="email-error" className="text-sm text-danger" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="message">
          Mensagem{" "}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        </Label>
        <textarea
          id="message"
          rows={5}
          placeholder="Descreva como podemos ajudar..."
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "message-error" : undefined}
          className="flex w-full rounded border border-neutral-300 bg-white px-3 py-2 text-[0.9375rem] text-neutral-900 placeholder:text-neutral-400 transition-colors focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/20 resize-none"
          {...register("message")}
        />
        {errors.message && (
          <p
            id="message-error"
            className="text-sm text-danger"
            role="alert"
          >
            {errors.message.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="sm:self-start px-8"
      >
        {isSubmitting ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Enviando…
          </>
        ) : (
          "Enviar mensagem"
        )}
      </Button>
    </form>
  );
}