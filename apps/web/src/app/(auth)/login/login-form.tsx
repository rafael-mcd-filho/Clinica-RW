"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
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
// Só o e-mail, e só neste navegador, quando a pessoa marca "Lembrar".
const rememberedEmailKey = "hi-clinic:login-email";

function readRememberedEmail() {
  try {
    return window.localStorage.getItem(rememberedEmailKey) ?? "";
  } catch {
    return "";
  }
}

function saveRememberedEmail(email: string | null) {
  try {
    if (email) window.localStorage.setItem(rememberedEmailKey, email);
    else window.localStorage.removeItem(rememberedEmailKey);
  } catch {
    // Navegador sem armazenamento local: segue sem lembrar.
  }
}

export function LoginForm() {
  const [state, action, pending] = useActionState(
    signInWithPassword,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);
  const lastEmailRef = useRef("");

  // Raio-X PF2: e-mail lembrado já vem preenchido e o foco vai para a senha.
  useEffect(() => {
    const saved = readRememberedEmail();
    if (saved && emailRef.current && !emailRef.current.value) {
      emailRef.current.value = saved;
      if (rememberRef.current) rememberRef.current.checked = true;
      passwordRef.current?.focus();
    }
  }, []);

  // O formulário se limpa depois de cada envio; com erro, o e-mail volta
  // para a pessoa só redigitar a senha.
  useEffect(() => {
    if (state.error && emailRef.current && lastEmailRef.current) {
      emailRef.current.value = lastEmailRef.current;
      if (rememberRef.current)
        rememberRef.current.checked = Boolean(readRememberedEmail());
      passwordRef.current?.focus();
    }
  }, [state]);

  return (
    <form
      action={action}
      className={styles.form}
      onSubmit={() => {
        const email = emailRef.current?.value.trim() ?? "";
        lastEmailRef.current = email;
        saveRememberedEmail(rememberRef.current?.checked ? email : null);
      }}
    >
      <div className={styles.field}>
        <label htmlFor="login-email" className={styles.label}>
          E-mail
        </label>
        <div className={styles.inputWrap}>
          <EnvelopeSimple className={styles.inputIcon} aria-hidden="true" />
          <input
            ref={emailRef}
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
            ref={passwordRef}
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

      <div className={styles.optionsRow}>
        <label className={styles.remember}>
          <input ref={rememberRef} type="checkbox" name="remember" />
          Lembrar meu e-mail
        </label>
        <Link href="/esqueci-senha" className={styles.forgotLink}>
          Esqueci minha senha
        </Link>
      </div>

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
