import { render } from "@testing-library/react";
import { describe, it, vi } from "vitest";
import { KLineCanvas } from "@/features/market/KLineCanvas";

vi.mock("klinecharts", () => ({
  init: () => ({
    applyNewData: () => {},
    removeIndicator: () => {},
    createIndicator: () => {},
  }),
  dispose: () => {},
}));

describe("KLineCanvas", () => {
  it("mounts with empty candles", () => {
    render(<KLineCanvas candles={[]} indicators={["MA"]} />);
  });
});
