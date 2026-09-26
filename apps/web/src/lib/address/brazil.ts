export const brazilianStates = [
  ["AC", "Acre"],
  ["AL", "Alagoas"],
  ["AP", "Amapá"],
  ["AM", "Amazonas"],
  ["BA", "Bahia"],
  ["CE", "Ceará"],
  ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"],
  ["GO", "Goiás"],
  ["MA", "Maranhão"],
  ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"],
  ["PA", "Pará"],
  ["PB", "Paraíba"],
  ["PR", "Paraná"],
  ["PE", "Pernambuco"],
  ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"],
  ["RR", "Roraima"],
  ["SC", "Santa Catarina"],
  ["SP", "São Paulo"],
  ["SE", "Sergipe"],
  ["TO", "Tocantins"],
] as const;

export type CepAddress = {
  addressLine: string;
  district: string;
  city: string;
  state: string;
};

// ViaCEP (https://viacep.com.br) é público, sem chave e com CORS liberado, então
// a consulta sai direto do navegador. Retorna null quando o CEP não existe;
// falha de rede propaga como erro para a UI avisar e deixar o preenchimento manual.
export async function fetchAddressByCep(
  cep: string,
  signal?: AbortSignal,
): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) {
    return null;
  }

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
    signal,
  });
  if (response.status === 400) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`ViaCEP respondeu ${response.status}`);
  }

  const data = (await response.json()) as {
    erro?: boolean | string;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };
  if (data.erro) {
    return null;
  }

  return {
    addressLine: data.logradouro ?? "",
    district: data.bairro ?? "",
    city: data.localidade ?? "",
    state: data.uf ?? "",
  };
}

const citiesCache = new Map<string, Promise<string[]>>();

// Municípios por UF na API de localidades do IBGE (mesma base de nomes usada
// pelo ViaCEP, então a cidade vinda do CEP casa com a lista). Cacheia por UF
// durante a sessão; em falha, descarta o cache para tentar de novo depois.
export function fetchCitiesByState(state: string): Promise<string[]> {
  const uf = state.trim().toUpperCase();
  const cached = citiesCache.get(uf);
  if (cached) {
    return cached;
  }

  const request = fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`IBGE respondeu ${response.status}`);
      }
      const data = (await response.json()) as Array<{ nome: string }>;
      return data.map((city) => city.nome);
    })
    .catch((error: unknown) => {
      citiesCache.delete(uf);
      throw error;
    });

  citiesCache.set(uf, request);
  return request;
}
