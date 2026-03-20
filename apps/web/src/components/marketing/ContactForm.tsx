"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2, "Informe seu nome completo"),
  email: z.email("Informe um e-mail válido"),
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
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
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
        className="flex flex-col items-center justify-center gap-5 py-16 text-center animate-in fade-in zoom-in-95 duration-500"
        role="status"
        aria-live="polite"
      >
        <div className="w-20 h-20 rounded-full bg-primary-50 border-4 border-white shadow-xl flex items-center justify-center relative">
          <div className="absolute inset-0 rounded-full bg-primary-100 animate-ping opacity-20" />
          <CheckCircle2
            size={40}
            className="text-primary-600 relative z-10"
            aria-hidden="true"
          />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 tracking-tight mb-2">
            Mensagem enviada!
          </h2>
          <p className="text-neutral-500 text-sm max-w-xs mx-auto leading-relaxed">
            Recebemos o seu contacto e a nossa equipa responderá em até 1 dia útil.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      noValidate
    >
      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium animate-in fade-in duration-300"
        >
          {serverError}
        </div>
      )}

      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">
        <Label htmlFor="name" className="text-neutral-700 font-semibold">
          Nome <span className="text-danger" aria-hidden="true">*</span>
        </Label>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="O seu nome completo"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
          className={cn(
            "h-11 rounded-lg transition-all",
            errors.name ? "border-danger focus-visible:ring-danger/20" : "hover:border-primary-300"
          )}
          {...register("name")}
        />
        {errors.name && (
          <p id="name-error" className="text-xs font-medium text-danger animate-in fade-in slide-in-from-top-1" role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
        <Label htmlFor="email" className="text-neutral-700 font-semibold">
          E-mail <span className="text-danger" aria-hidden="true">*</span>
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="voce@clube.com.br"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          className={cn(
            "h-11 rounded-lg transition-all",
            errors.email ? "border-danger focus-visible:ring-danger/20" : "hover:border-primary-300"
          )}
          {...register("email")}
        />
        {errors.email && (
          <p id="email-error" className="text-xs font-medium text-danger animate-in fade-in slide-in-from-top-1" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 fill-mode-both">
        <Label htmlFor="message" className="text-neutral-700 font-semibold">
          Mensagem <span className="text-danger" aria-hidden="true">*</span>
        </Label>
        <textarea
          id="message"
          rows={5}
          placeholder="Descreva como podemos ajudar..."
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "message-error" : undefined}
          className={cn(
            "flex w-full rounded-lg border bg-white px-3 py-2.5 text-[0.9375rem] text-neutral-900 placeholder:text-neutral-400 transition-all focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500 resize-none",
            errors.message ? "border-danger focus-visible:ring-danger/20" : "border-neutral-300 hover:border-primary-300"
          )}
          {...register("message")}
        />
        {errors.message && (
          <p id="message-error" className="text-xs font-medium text-danger animate-in fade-in slide-in-from-top-1" role="alert">
            {errors.message.message}
          </p>
        )}
      </div>

      <div className="pt-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500 fill-mode-both">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto h-11 px-8 rounded-lg bg-accent-500 hover:bg-accent-600 text-white font-bold shadow-md shadow-accent-500/20 border-none transition-all group"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={18} className="animate-spin mr-2" aria-hidden="true" />
              Enviando…
            </>
          ) : (
            <>
              Enviar mensagem
              <Send size={16} className="ml-2 opacity-80 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}