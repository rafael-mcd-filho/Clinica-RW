import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./paginate";

describe("fetchAllRows", () => {
  it("junta as páginas até a última incompleta", async () => {
    const source = Array.from({ length: 2_350 }, (_, index) => index);
    const calls: Array<[number, number]> = [];
    const result = await fetchAllRows((from, to) => {
      calls.push([from, to]);
      return Promise.resolve({ data: source.slice(from, to + 1), error: null });
    });
    expect(result.data).toHaveLength(2_350);
    expect(result.truncated).toBe(false);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("para no erro e avisa quando passa do limite", async () => {
    const failing = await fetchAllRows(() =>
      Promise.resolve({ data: null, error: new Error("falhou") }),
    );
    expect(failing.error).toBeInstanceOf(Error);

    const capped = await fetchAllRows(
      (from, to) =>
        Promise.resolve({
          data: Array.from(
            { length: to - from + 1 },
            (_, index) => from + index,
          ),
          error: null,
        }),
      { pageSize: 10, maxRows: 30 },
    );
    expect(capped.data).toHaveLength(30);
    expect(capped.truncated).toBe(true);
  });
});
