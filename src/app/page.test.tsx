import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("renders the app name as the h1", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "English Zero to Hero" })).toBeInTheDocument();
  });

  it("shows a Thai tagline", () => {
    render(<Home />);
    expect(screen.getByText(/[฀-๿]/)).toBeInTheDocument();
  });
});
