import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorPanel } from "@/components/ErrorPanel";

describe("ErrorPanel", () => {
  it("renders status, code, message", () => {
    render(
      <ErrorPanel
        error={{ status: 400, code: "bad_request", message: "stock code invalid", url: "/v1/stocks/foo/quote" }}
      />
    );
    expect(screen.getByText("400")).toBeInTheDocument();
    expect(screen.getByText("bad_request")).toBeInTheDocument();
    expect(screen.getByText("stock code invalid")).toBeInTheDocument();
    expect(screen.getByText("/v1/stocks/foo/quote")).toBeInTheDocument();
  });
});
