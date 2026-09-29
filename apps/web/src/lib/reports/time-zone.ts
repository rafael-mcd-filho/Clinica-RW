import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { normalizeAgendaTimeZone } from "../agenda/range";

// Os períodos dos relatórios são datas do calendário da clínica. Contados em
// UTC, um atendimento às 21h em Fortaleza (meia-noite em UTC) caía no dia
// seguinte, e o período inteiro ficava deslocado em três horas.

/** Fuso da clínica (`organization_settings.timezone`), com o padrão do app. */
export async function loadReportTimeZone(
  supabase: SupabaseClient,
  organizationId: string,
) {
  const { data } = await supabase
    .from("organization_settings")
    .select("timezone")
    .eq("organization_id", organizationId)
    .maybeSingle<{ timezone: string | null }>();

  return normalizeAgendaTimeZone(data?.timezone);
}

/** Primeiro instante da data (yyyy-mm-dd) no fuso da clínica. */
export function zonedDayStart(dateKey: string, timeZone: string) {
  return fromZonedTime(`${dateKey}T00:00:00`, timeZone);
}

/** Primeiro instante do dia seguinte: o fim exclusivo de um período. */
export function zonedDayEndExclusive(dateKey: string, timeZone: string) {
  return zonedDayStart(addDateKeyDays(dateKey, 1), timeZone);
}

/** Data (yyyy-mm-dd) do instante no fuso da clínica. */
export function zonedDateKey(value: Date | string, timeZone: string) {
  return formatInTimeZone(value, timeZone, "yyyy-MM-dd");
}

export function addDateKeyDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount, 12))
    .toISOString()
    .slice(0, 10);
}

/** Datas (yyyy-mm-dd) de `from` a `to`, inclusive. */
export function dateKeysBetween(from: string, to: string) {
  const keys: string[] = [];
  for (let key = from; key <= to; key = addDateKeyDays(key, 1)) {
    keys.push(key);
  }
  return keys;
}

/** Dia da semana (0 = domingo) de uma data do calendário. */
export function dateKeyWeekday(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}
