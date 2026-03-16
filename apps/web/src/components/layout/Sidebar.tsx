"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Users,
    Users2,
    LayoutList,
    CreditCard,
    Menu,
    X,
    LogOut,
    ChevronRight,
    Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
    soon?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Sócios", href: "/members", icon: Users },
    { label: "Atletas", href: "/athletes", icon: Users2 },
    { label: "Planos", href: "/plans", icon: LayoutList },
    { label: "Cobranças", href: "/charges", icon: CreditCard },
];

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
    const pathname = usePathname();
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
    const Icon = item.icon;

    const inner = (
        <span
            className={cn(
                "group relative flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-all duration-150",
                isActive
                    ? "bg-primary-50 text-primary-700"
                    : item.soon
                        ? "cursor-default text-neutral-300"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                collapsed && "justify-center px-2",
            )}
            aria-current={isActive ? "page" : undefined}
        >
            {isActive && (
                <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-primary-500"
                    aria-hidden="true"
                />
            )}

            <Icon
                size={17}
                className={cn(
                    "flex-shrink-0 transition-colors",
                    isActive ? "text-primary-600" : item.soon ? "text-neutral-300" : "text-neutral-400 group-hover:text-neutral-600",
                )}
                aria-hidden="true"
            />

            {!collapsed && (
                <span className="flex-1 truncate">{item.label}</span>
            )}

            {!collapsed && item.soon && (
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-neutral-300 bg-neutral-100 rounded px-1.5 py-0.5">
                    Em breve
                </span>
            )}

            {collapsed && (
                <span
                    className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 z-50"
                    role="tooltip"
                >
                    {item.label}
                    {item.soon && " (em breve)"}
                </span>
            )}
        </span>
    );

    if (item.soon) {
        return <div aria-disabled="true">{inner}</div>;
    }

    return (
        <Link href={item.href} aria-label={item.label}>
            {inner}
        </Link>
    );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
    const { user, logout } = useAuth();

    const initials = user?.email
        ? user.email
            .split("@")[0]
            .split(/[._\-]/)
            .map((p: string) => p[0] ?? "")
            .slice(0, 2)
            .join("")
            .toUpperCase() || user.email[0].toUpperCase()
        : "?";

    const displayName = user?.email
        ? user.email.split("@")[0].replace(/[._]/g, " ")
        : "Usuário";

    const roleLabel = user?.role === "ADMIN" ? "Administrador" : "Tesoureiro";

    return (
        <div className={cn("border-t border-neutral-100 pt-3", collapsed ? "px-2" : "px-3")}>
            <div
                className={cn(
                    "flex items-center gap-3 rounded px-2 py-2",
                    collapsed && "justify-center",
                )}
            >
                <div
                    className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700 select-none"
                    aria-hidden="true"
                >
                    {initials}
                </div>

                {!collapsed && (
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-800 truncate leading-tight capitalize">
                            {displayName}
                        </p>
                        <p className="text-xs text-neutral-400 truncate leading-tight mt-0.5">
                            {roleLabel}
                        </p>
                    </div>
                )}
            </div>

            <button
                type="button"
                onClick={logout}
                className={cn(
                    "group mt-1 w-full flex items-center gap-3 rounded px-2 py-2 text-sm text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600",
                    collapsed && "justify-center",
                )}
                aria-label="Sair da conta"
            >
                <LogOut
                    size={15}
                    className="flex-shrink-0 transition-colors group-hover:text-red-500"
                    aria-hidden="true"
                />
                {!collapsed && <span>Sair</span>}

                {collapsed && (
                    <span
                        className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 z-50"
                        role="tooltip"
                    >
                        Sair
                    </span>
                )}
            </button>
        </div>
    );
}

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

function SidebarInner({ collapsed, onToggle }: SidebarProps) {
    return (
        <nav
            className={cn(
                "relative flex flex-col h-full bg-white border-r border-neutral-200 transition-all duration-200",
                collapsed ? "w-[60px]" : "w-[240px]",
            )}
            aria-label="Navegação principal"
        >
            <div
                className={cn(
                    "flex items-center border-b border-neutral-100 px-3 py-4",
                    collapsed ? "justify-center" : "justify-between",
                )}
            >
                {!collapsed && (
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
                            <Shield size={14} className="text-white" strokeWidth={2} aria-hidden="true" />
                        </div>
                        <span className="text-[0.9375rem] font-bold text-neutral-900 tracking-tight">
                            ClubOS
                        </span>
                    </div>
                )}

                <button
                    type="button"
                    onClick={onToggle}
                    className={cn(
                        "flex-shrink-0 p-1.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors",
                        collapsed && "mx-auto",
                    )}
                    aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
                >
                    <ChevronRight
                        size={16}
                        className={cn("transition-transform duration-200", !collapsed && "rotate-180")}
                        aria-hidden="true"
                    />
                </button>
            </div>

            <div className={cn("flex-1 overflow-y-auto py-3 space-y-0.5", collapsed ? "px-2" : "px-3")}>
                {PRIMARY_NAV.map((item) => (
                    <NavLink key={item.href} item={item} collapsed={collapsed} />
                ))}
            </div>

            <div className="pb-3">
                <UserMenu collapsed={collapsed} />
            </div>
        </nav>
    );
}

function MobileDrawer({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    return (
        <>
            <div
                className={cn(
                    "fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 md:hidden",
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
                )}
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-[240px] flex flex-col bg-white shadow-lg transition-transform duration-200 md:hidden",
                    open ? "translate-x-0" : "-translate-x-full",
                )}
                role="dialog"
                aria-modal="true"
                aria-label="Menu de navegação"
            >
                <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center">
                            <Shield size={14} className="text-white" strokeWidth={2} aria-hidden="true" />
                        </div>
                        <span className="text-[0.9375rem] font-bold text-neutral-900 tracking-tight">
                            ClubOS
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                        aria-label="Fechar menu"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5" onClick={onClose}>
                    {PRIMARY_NAV.map((item) => (
                        <NavLink key={item.href} item={item} collapsed={false} />
                    ))}
                </div>

                <div className="pb-3">
                    <UserMenu collapsed={false} />
                </div>
            </div>
        </>
    );
}

function MobileTopBar({ onOpen }: { onOpen: () => void }) {
    const pathname = usePathname();

    const activeItem = PRIMARY_NAV.find(
        (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
    );

    return (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4 md:hidden">
            <button
                type="button"
                onClick={onOpen}
                className="p-1.5 -ml-1.5 rounded text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors"
                aria-label="Abrir menu"
            >
                <Menu size={20} aria-hidden="true" />
            </button>

            <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary-500 flex items-center justify-center">
                    <Shield size={12} className="text-white" strokeWidth={2} aria-hidden="true" />
                </div>
                <span className="text-sm font-bold text-neutral-900">
                    {activeItem?.label ?? "ClubOS"}
                </span>
            </div>

            <div className="w-8" aria-hidden="true" />
        </header>
    );
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <div className="min-h-dvh flex bg-neutral-100">
            <div className="hidden md:flex md:flex-shrink-0">
                <SidebarInner
                    collapsed={collapsed}
                    onToggle={() => setCollapsed((v) => !v)}
                />
            </div>

            <MobileDrawer
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
            />

            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                <MobileTopBar onOpen={() => setMobileOpen(true)} />

                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}