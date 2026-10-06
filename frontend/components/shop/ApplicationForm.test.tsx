import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { shopApi } from "@/lib/shop-api";

import { ApplicationForm } from "./ApplicationForm";

vi.mock("@/lib/shop-api", () => ({ shopApi: { sendApplication: vi.fn() } }));

describe("ApplicationForm — заявки без попапов и капчи", () => {
  it("опт: проверка полей и ловушка для ботов", async () => {
    render(<ApplicationForm type="wholesale" />);
    const honeypot = document.querySelector('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    await userEvent.click(screen.getByRole("button", { name: "Запросить прайс" }));
    expect(screen.getByText("Укажите имя")).toBeInTheDocument();
    expect(screen.getByText("Оставьте телефон или Telegram — одно из двух")).toBeInTheDocument();
    expect(shopApi.sendApplication).not.toHaveBeenCalled();
  });

  it("опт: отправка и благодарность", async () => {
    vi.mocked(shopApi.sendApplication).mockResolvedValue({ ok: true, message: "Спасибо, заявка у нас." });
    render(<ApplicationForm type="wholesale" />);
    await userEvent.type(screen.getByLabelText("Организация"), "Кофейня «Ромашка»");
    await userEvent.type(screen.getByLabelText("Город"), "Владимир");
    await userEvent.type(screen.getByLabelText("Имя"), "Аня");
    await userEvent.type(screen.getByLabelText("Телефон"), "+7 900 123-45-67");
    await userEvent.click(screen.getByRole("checkbox", { name: /обработку персональных данных/ }));
    await userEvent.click(screen.getByRole("button", { name: "Запросить прайс" }));
    expect(shopApi.sendApplication).toHaveBeenCalledWith({
      type: "wholesale",
      name: "Аня",
      phone: "+7 900 123-45-67",
      telegram: null,
      guests: 1,
      data: { organization: "Кофейня «Ромашка»", city: "Владимир", volume: "", comment: "" },
      consent: true,
      website: "",
    });
    expect(await screen.findByText("Спасибо, заявка у нас.")).toBeInTheDocument();
  });

  it("запись на событие: гости не больше свободных мест", async () => {
    vi.mocked(shopApi.sendApplication).mockResolvedValue({ ok: true, message: "Вы записаны" });
    render(<ApplicationForm type="event" eventId="0192f000-0000-7000-8000-0000000000e1" maxGuests={2} />);
    const plus = screen.getByRole("button", { name: "Больше гостей" });
    await userEvent.click(plus);
    expect(plus).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Имя"), "Аня");
    await userEvent.type(screen.getByLabelText("Telegram"), "@anya");
    await userEvent.click(screen.getByRole("checkbox", { name: /обработку персональных данных/ }));
    await userEvent.click(screen.getByRole("button", { name: /Записаться/ }));
    expect(shopApi.sendApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "event",
        event_id: "0192f000-0000-7000-8000-0000000000e1",
        guests: 2,
        phone: null,
        telegram: "@anya",
      }),
    );
  });

  it("индивидуальная церемония: дата, гости, повод", async () => {
    vi.mocked(shopApi.sendApplication).mockResolvedValue({ ok: true, message: "Заявка отправлена." });
    render(<ApplicationForm type="private_ceremony" />);
    await userEvent.type(screen.getByLabelText("Желаемая дата"), "14 ноября");
    await userEvent.type(screen.getByLabelText("Сколько гостей"), "12");
    await userEvent.type(screen.getByLabelText("Повод и место"), "День рождения, дома");
    await userEvent.type(screen.getByLabelText("Имя"), "Аня");
    await userEvent.type(screen.getByLabelText("Телефон"), "89001234567");
    await userEvent.click(screen.getByRole("checkbox", { name: /обработку персональных данных/ }));
    await userEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    expect(shopApi.sendApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "private_ceremony",
        data: { date: "14 ноября", guests: "12", occasion: "День рождения, дома", comment: "" },
      }),
    );
    expect(await screen.findByText("Заявка отправлена.")).toBeInTheDocument();
  });
});
