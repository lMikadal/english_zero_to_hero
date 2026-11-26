import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemePicker } from "./ThemePicker";

afterEach(() => {
  document.cookie = "ezh-theme=; path=/; max-age=0";
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemePicker", () => {
  it("is a labelled radio group with สว่าง / มืด / ตามเครื่อง", () => {
    render(<ThemePicker initial="system" />);
    const group = screen.getByRole("radiogroup", { name: "ธีม" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["light", "dark", "system"]);
    for (const name of ["สว่าง", "มืด", "ตามเครื่อง"]) expect(screen.getByRole("radio", { name })).toBeInTheDocument();
  });

  it("checks the stored choice", () => {
    render(<ThemePicker initial="dark" />);
    expect(screen.getByRole("radio", { name: "มืด" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "สว่าง" })).not.toBeChecked();
  });

  it("applies immediately to <html data-theme> and stores the cookie", () => {
    render(<ThemePicker initial="system" />);
    fireEvent.click(screen.getByRole("radio", { name: "มืด" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("ezh-theme=dark");
    fireEvent.click(screen.getByRole("radio", { name: "สว่าง" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.cookie).toContain("ezh-theme=light");
    expect(screen.getByRole("radio", { name: "สว่าง" })).toBeChecked();
  });
});
