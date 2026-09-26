"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/loader";
import { MaskedInput } from "@/components/ui/masked-input";
import {
  brazilianStates,
  fetchAddressByCep,
  fetchCitiesByState,
} from "@/lib/address/brazil";

export type AddressValues = {
  postal_code: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

type CepStatus = "idle" | "loading" | "not_found" | "error";

const cepMessages: Partial<Record<CepStatus, string>> = {
  not_found: "CEP não encontrado. Preencha o endereço manualmente.",
  error: "Não foi possível consultar o CEP agora. Preencha manualmente.",
};

const stateCodes = new Set<string>(brazilianStates.map(([code]) => code));

// Campos de endereço (renderizados soltos, no grid do card que os envolve).
// Ao completar o CEP, busca no ViaCEP e preenche logradouro, bairro, UF e
// cidade; a cidade é um seletor pesquisável com os municípios da UF (IBGE).
// Os nomes dos campos seguem as colunas de endereço (postal_code, city...).
// `compact` é para grids de 2 colunas (modais): nenhum campo ocupa 2 colunas.
export function AddressFields({
  defaultValues,
  compact = false,
}: {
  defaultValues?: AddressValues | null;
  compact?: boolean;
}) {
  const [addressLine, setAddressLine] = useState(
    defaultValues?.address_line ?? "",
  );
  const [district, setDistrict] = useState(defaultValues?.district ?? "");
  const [state, setState] = useState(
    defaultValues?.state?.trim().toUpperCase() ?? "",
  );
  const [city, setCity] = useState(defaultValues?.city ?? "");
  const [cepStatus, setCepStatus] = useState<CepStatus>("idle");
  const [citiesResult, setCitiesResult] = useState<{
    state: string;
    cities: string[] | null;
  } | null>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const lookupRef = useRef<AbortController | null>(null);
  // Começa com o CEP já salvo para não sobrescrever o endereço ao abrir a edição.
  const lastCepRef = useRef(
    (defaultValues?.postal_code ?? "").replace(/\D/g, ""),
  );
  const knownState = stateCodes.has(state);

  useEffect(() => {
    if (!knownState) {
      return;
    }
    let cancelled = false;
    fetchCitiesByState(state).then(
      (cities) => {
        if (!cancelled) setCitiesResult({ state, cities });
      },
      () => {
        if (!cancelled) setCitiesResult({ state, cities: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state, knownState]);

  useEffect(() => () => lookupRef.current?.abort(), []);

  const citiesLoaded = citiesResult?.state === state;
  const cities = citiesLoaded ? citiesResult.cities : [];
  // Registro antigo (UF fora da lista, ou cidade sem UF) ou IBGE fora do ar: a
  // cidade volta a ser texto livre para não esconder o dado nem travar o cadastro.
  const cityAsText = state ? !knownState || cities === null : Boolean(city);
  const wideClassName = compact ? undefined : "lg:col-span-2";

  function handleCepChange(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) {
      lookupRef.current?.abort();
      lastCepRef.current = "";
      setCepStatus("idle");
      return;
    }
    if (digits === lastCepRef.current) {
      return;
    }
    lastCepRef.current = digits;

    lookupRef.current?.abort();
    const controller = new AbortController();
    lookupRef.current = controller;
    setCepStatus("loading");

    fetchAddressByCep(digits, controller.signal)
      .then((address) => {
        if (controller.signal.aborted) return;
        if (!address) {
          setCepStatus("not_found");
          return;
        }
        setCepStatus("idle");
        // CEPs de cidade inteira vêm sem logradouro/bairro: mantém o digitado.
        if (address.addressLine) setAddressLine(address.addressLine);
        if (address.district) setDistrict(address.district);
        setState(address.state);
        setCity(address.city);
        numberRef.current?.focus();
      })
      .catch(() => {
        if (!controller.signal.aborted) setCepStatus("error");
      });
  }

  function handleStateChange(next: string) {
    if (next === state) return;
    setState(next);
    // A cidade anterior pertence à outra UF.
    setCity("");
  }

  return (
    <>
      <AddressField label="CEP" error={cepMessages[cepStatus]}>
        <span className="relative block">
          <MaskedInput
            name="postal_code"
            maskKind="cep"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            defaultValue={defaultValues?.postal_code ?? ""}
            onValueChange={handleCepChange}
            aria-invalid={cepStatus === "not_found" ? true : undefined}
            className={cepStatus === "loading" ? "pr-9" : undefined}
          />
          {cepStatus === "loading" ? (
            <Spinner className="absolute right-3 top-1/2 -translate-y-1/2" />
          ) : null}
        </span>
      </AddressField>
      <AddressField label="Endereço" className={wideClassName}>
        <Input
          name="address_line"
          autoComplete="address-line1"
          value={addressLine}
          onChange={(event) => setAddressLine(event.target.value)}
        />
      </AddressField>
      <AddressField label="Número">
        <Input
          ref={numberRef}
          name="address_number"
          defaultValue={defaultValues?.address_number ?? ""}
        />
      </AddressField>
      <AddressField label="Complemento">
        <Input
          name="address_complement"
          autoComplete="address-line2"
          defaultValue={defaultValues?.address_complement ?? ""}
        />
      </AddressField>
      <AddressField label="Bairro">
        <Input
          name="district"
          autoComplete="address-level3"
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
        />
      </AddressField>
      <AddressField label="UF">
        <Select
          name="state"
          value={state}
          onValueChange={handleStateChange}
          searchable
          searchPlaceholder="Pesquisar UF..."
        >
          <option value="">Selecione a UF</option>
          {brazilianStates.map(([code, name]) => (
            <option key={code} value={code}>
              {code} — {name}
            </option>
          ))}
        </Select>
      </AddressField>
      <AddressField label="Cidade" className={wideClassName}>
        {cityAsText ? (
          <Input
            name="city"
            autoComplete="address-level2"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        ) : (
          <Select
            name="city"
            value={city}
            onValueChange={setCity}
            disabled={!state || !citiesLoaded}
            placeholder={
              !state
                ? "Selecione a UF primeiro"
                : !citiesLoaded
                  ? "Carregando cidades..."
                  : "Selecione a cidade"
            }
            searchable
            searchPlaceholder="Pesquisar cidade..."
          >
            {cities?.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {/* Cidade salva fora da lista (digitada livremente antes): mantém ao salvar. */}
            {citiesLoaded && city && !cities?.includes(city) ? (
              <option value={city}>{city}</option>
            ) : null}
          </Select>
        )}
      </AddressField>
    </>
  );
}

// Mesmo visual dos campos dos formulários de paciente e da clínica.
function AddressField({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`grid min-w-0 gap-2 text-sm font-medium ${className ?? ""}`}
    >
      <span>{label}</span>
      {children}
      {error ? (
        <span
          role="alert"
          className="text-body-sm font-normal text-destructive"
        >
          {error}
        </span>
      ) : null}
    </label>
  );
}
