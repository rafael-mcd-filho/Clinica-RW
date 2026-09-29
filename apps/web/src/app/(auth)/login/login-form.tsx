"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  EnvelopeSimple,
  Eye,
  EyeSlash,
  LockKey,
  SignIn,
} from "@phosphor-icons/react";
import { signInWithPassword, type LoginState } from "./actions";
import styles from "./login.module.css";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(
    signInWithPassword,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="login-email" className={styles.label}>
          E-mail
        </label>
        <div className={styles.inputWrap}>
          <EnvelopeSimple className={styles.inputIcon} aria-hidden="true" />
          <input
            id="login-email"
            className={styles.input}
            required
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nome@clinica.com.br"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="login-password" className={styles.label}>
          Senha
        </label>
        <div className={styles.inputWrap}>
          <LockKey className={styles.inputIcon} aria-hidden="true" />
          <input
            id="login-password"
            className={`${styles.input} ${styles.passwordInput}`}
            required
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••"
          />
          <button
            type="button"
            className={styles.visibilityButton}
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <Eye aria-hidden="true" />
            ) : (
              <EyeSlash aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <Link href="/esqueci-senha" className={styles.forgotLink}>
        Esqueci minha senha
      </Link>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={styles.submitButton}>
        <SignIn aria-hidden="true" />
        <span>{pending ? "Entrando..." : "Entrar"}</span>
      </button>
    </form>
  );
}
