import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { shopApi } from "@/lib/shop-api";

import { AddressBook } from "./AddressBook";

vi.mock("@/lib/shop-api", () => ({ shopApi: { addAddress: vi.fn(), deleteAddress: vi.fn() } }));

const saved = {
  id: "0192f000-0000-7000-8000-0000000000b1",
  kind: "courier" as const,
  label: "Владимир, ул. Мира, 1, кв. 2",
  data: {},
  is_default: true,
};

describe("AddressBook — сохранённые адреса", () => {
  it("список и удаление", async () => {
    vi.mocked(shopApi.deleteAddress).mockResolvedValue({ ok: true });
    render(<AddressBook initial={[saved]} />);
    expect(screen.getByText("Владимир, ул. Мира, 1, кв. 2")).toBeInTheDocument();
    expect(screen.getByText("Курьер по Владимиру · основной")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Удалить: Владимир, ул. Мира, 1, кв. 2" }));
    expect(shopApi.deleteAddress).toHaveBeenCalledWith(saved.id);
    expect(screen.queryByText("Владимир, ул. Мира, 1, кв. 2")).not.toBeInTheDocument();
  });

  it("добавление адреса", async () => {
    vi.mocked(shopApi.addAddress).mockResolvedValue({ ...saved, id: "0192f000-0000-7000-8000-0000000000b2", kind: "cdek_door", label: "Москва, Тверская, 1", is_default: false });
    render(<AddressBook initial={[]} />);
    expect(screen.getByText(/Пока нет сохранённых адресов/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Способ"), "cdek_door");
    await userEvent.type(screen.getByLabelText("Адрес"), "Москва, Тверская, 1");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить адрес" }));
    expect(shopApi.addAddress).toHaveBeenCalledWith({ kind: "cdek_door", label: "Москва, Тверская, 1", data: {}, is_default: false });
    expect(await screen.findByText("Москва, Тверская, 1")).toBeInTheDocument();
  });
});
