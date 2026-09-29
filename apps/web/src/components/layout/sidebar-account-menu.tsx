"use client";

import Link from "next/link";
import {
  CaretDown,
  SignOut as LogOut,
  UserCircle,
} from "@phosphor-icons/react";
import { signOut } from "@/app/(auth)/login/actions";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * Conta do usuário no rodapé do menu lateral (antes ficava no canto superior
 * direito do cabeçalho). O menu abre para cima, porque embaixo não há espaço.
 */
export function SidebarAccountMenu({
  onNavigate,
  userAvatarUrl,
  userName,
  userOrganization,
  userRole,
}: {
  onNavigate?: () => void;
  userAvatarUrl?: string | null;
  userName: string;
  userOrganization: string;
  userRole: string;
}) {
  return (
    <div className="border-t border-sidebar-border p-3">
      <DropdownMenu
        align="start"
        triggerLabel={`Abrir menu da conta de ${userName}`}
        triggerClassName="group !h-auto !w-full justify-start gap-3 rounded-lg border-transparent bg-transparent px-2 py-2 text-left text-sidebar-foreground shadow-none hover:border-transparent hover:bg-sidebar-hover hover:text-sidebar-foreground aria-expanded:border-transparent aria-expanded:bg-sidebar-hover aria-expanded:text-sidebar-foreground"
        trigger={
          <>
            <Avatar
              name={userName}
              photoUrl={userAvatarUrl}
              size="sm"
              tone="solid"
              className="shadow-[var(--shadow-soft)]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-semibold">
                {userName}
              </span>
              <span className="block truncate text-caption text-sidebar-muted-foreground">
                {userRole}
              </span>
            </span>
            <CaretDown
              className="size-4 shrink-0 text-sidebar-muted-foreground"
              aria-hidden="true"
            />
          </>
        }
      >
        {(close) => (
          <>
            <div className="flex min-w-0 items-center gap-3 px-2.5 py-2.5">
              <Avatar name={userName} photoUrl={userAvatarUrl} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {userName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {userOrganization}
                </span>
              </span>
            </div>

            <DropdownMenuSeparator />

            <Link
              href="/perfil"
              prefetch={true}
              role="menuitem"
              onClick={() => {
                close();
                onNavigate?.();
              }}
              className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-sm font-medium text-foreground transition-colors duration-[var(--motion-fast)] hover:bg-muted"
            >
              <UserCircle className="size-4 shrink-0" aria-hidden="true" />
              Meu perfil
            </Link>

            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors duration-[var(--motion-fast)] hover:bg-muted"
              >
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
                Sair
              </button>
            </form>
          </>
        )}
      </DropdownMenu>
    </div>
  );
}
