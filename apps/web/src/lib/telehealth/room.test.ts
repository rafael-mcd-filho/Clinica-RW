import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("sala de teleconsulta", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("é estável por agendamento e diferente entre agendamentos", async () => {
    vi.stubEnv("TELEHEALTH_ROOM_SECRET", "segredo");
    const { telehealthRoomName } = await import("./room");
    const a = telehealthRoomName("3f2a9c1e-7b4d-4e8a-9f10-2b3c4d5e6f70");
    expect(a).toMatch(/^HiClinic-[A-Za-z0-9]{22}$/);
    expect(telehealthRoomName("3F2A9C1E-7B4D-4E8A-9F10-2B3C4D5E6F70")).toBe(a);
    expect(telehealthRoomName("00000000-0000-4000-8000-000000000001")).not.toBe(
      a,
    );
  });

  it("usa o servidor configurado", async () => {
    vi.stubEnv("TELEHEALTH_ROOM_SECRET", "segredo");
    vi.stubEnv("TELEHEALTH_BASE_URL", "https://video.minhaclinica.com.br/");
    const { telehealthRoomUrl } = await import("./room");
    expect(telehealthRoomUrl("3f2a9c1e-7b4d-4e8a-9f10-2b3c4d5e6f70")).toMatch(
      /^https:\/\/video\.minhaclinica\.com\.br\/HiClinic-/,
    );
  });
});
