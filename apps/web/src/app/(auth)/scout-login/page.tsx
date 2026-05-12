import { ScoutAuthProvider } from "@/contexts/scout-auth.context";
import { ScoutLoginForm } from "@/components/scout/ScoutLoginForm";

export const metadata = { title: "Scout — Entrar | ClubOS" };

export default function ScoutLoginPage() {
    return (
        <ScoutAuthProvider>
            <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-6">
                <div className="w-full max-w-lg">
                    <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow">
                        <div className="mb-8 text-center">
                            <span className="text-2xl font-bold text-primary-600">ClubOS</span>
                            <p className="mt-1 text-sm text-neutral-500">
                                Acesso de olheiro
                            </p>
                        </div>
                        <ScoutLoginForm />
                    </div>

                    <p className="mt-4 text-center text-sm text-neutral-500">
                        Ainda não tem conta?{" "}
                        <a href="/scout-onboarding" className="text-primary-600 hover:underline">
                            Criar conta de olheiro
                        </a>
                    </p>
                </div>
            </div>
        </ScoutAuthProvider>
    );
}