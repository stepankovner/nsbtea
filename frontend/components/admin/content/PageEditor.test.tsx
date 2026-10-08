import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { pagesApi } from "@/lib/admin/content";
import { renderWithAdmin } from "@/tests/admin";

import { adminPage } from "./fixtures";
import { PageEditor } from "./PageEditor";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/content/pages/p1",
}));
vi.mock("@/lib/admin/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/content")>();
  return { ...actual, pagesApi: { get: vi.fn(), patch: vi.fn(), archive: vi.fn() } };
});
vi.mock("@/lib/admin/media", () => ({ uploadMedia: vi.fn(), MAX_UPLOAD_MB: 15 }));
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn().mockResolvedValue([]) }));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const club = adminPage({ id: "p-club", title: "Чайный клуб", slug: "club", is_published: false, site_url: "https://nsbtea.ru/pages/club" });
const offer = adminPage({ id: "p-offer", title: "Публичная оферта", slug: "offer", kind: "legal", is_published: false, required: true });

describe("PageEditor — страница сайта", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("черновик сохраняется сам, без кнопки", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(club);
    vi.mocked(pagesApi.patch).mockResolvedValue({ ...club, title: "Чайный клуб по средам" });
    renderWithAdmin(<PageEditor id="p-club" />);
    await userEvent.type(await screen.findByLabelText("Название страницы"), " по средам");
    expect(screen.getByText(/Есть несохранённые изменения/)).toBeInTheDocument();
    await waitFor(() => expect(pagesApi.patch).toHaveBeenCalledWith("p-club", expect.objectContaining({ title: "Чайный клуб по средам" })), {
      timeout: 4000,
    });
    // черновик остаётся черновиком — на сайт ничего не попадает
    expect(pagesApi.patch).not.toHaveBeenCalledWith("p-club", expect.objectContaining({ is_published: true }));
    expect(await screen.findByText("Черновик сохранён")).toBeInTheDocument();
  });

  it("опубликовать черновик — одной кнопкой", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(club);
    vi.mocked(pagesApi.patch).mockResolvedValue({ ...club, is_published: true });
    renderWithAdmin(<PageEditor id="p-club" />);
    expect(await screen.findByText("Черновик")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Опубликовать" }));
    expect(pagesApi.patch).toHaveBeenCalledWith("p-club", expect.objectContaining({ title: "Чайный клуб", is_published: true }));
    expect(await screen.findByText("На сайте")).toBeInTheDocument();
  });

  it("опубликованная страница: правки попадают на сайт только по кнопке", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(adminPage());
    vi.mocked(pagesApi.patch).mockResolvedValue(adminPage({ title: "О магазине и мастере" }));
    renderWithAdmin(<PageEditor id="p1" />);
    await userEvent.type(await screen.findByLabelText("Название страницы"), " и мастере");
    await sleep(1800);
    expect(pagesApi.patch).not.toHaveBeenCalled();
    expect(screen.getByText(/ещё не на сайте/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    expect(pagesApi.patch).toHaveBeenCalledWith("p1", expect.objectContaining({ title: "О магазине и мастере" }));
  });

  it("несохранённые правки опубликованной страницы не теряются, если закрыть вкладку", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(adminPage());
    const first = renderWithAdmin(<PageEditor id="p1" />);
    await userEvent.type(await screen.findByLabelText("Название страницы"), " и мастере");
    await sleep(1200);
    first.unmount();

    renderWithAdmin(<PageEditor id="p1" />);
    expect(await screen.findByText(/остались несохранённые правки/)).toBeInTheDocument();
    expect(screen.getByLabelText("Название страницы")).toHaveValue("О магазине");
    await userEvent.click(screen.getByRole("button", { name: "Вернуть правки" }));
    expect(screen.getByLabelText("Название страницы")).toHaveValue("О магазине и мастере");
    expect(pagesApi.patch).not.toHaveBeenCalled();
  });

  it("снять с сайта — с подтверждением", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(adminPage({ id: "p-club", title: "Чайный клуб", slug: "club" }));
    vi.mocked(pagesApi.patch).mockResolvedValue({ ...club, is_published: false });
    renderWithAdmin(<PageEditor id="p-club" />);
    await userEvent.click(await screen.findByRole("button", { name: "Снять с сайта" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Да, снять с сайта" }));
    expect(pagesApi.patch).toHaveBeenCalledWith("p-club", expect.objectContaining({ is_published: false }));
  });

  it("как это увидят в Яндексе — заголовок и описание для поиска", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(adminPage());
    renderWithAdmin(<PageEditor id="p1" />);
    const snippet = await screen.findByTestId("yandex-snippet");
    expect(snippet).toHaveTextContent("О магазине — НСБ Чай");
    expect(snippet).toHaveTextContent("nsbtea.ru/about");
    await userEvent.type(screen.getByLabelText("Заголовок для Яндекса"), "Магазин чая во Владимире");
    expect(snippet).toHaveTextContent("Магазин чая во Владимире — НСБ Чай");
    expect(screen.getByRole("button", { name: "Подсказка: Заголовок для Яндекса" })).toBeInTheDocument();
  });

  it("адрес — с подсказкой; у служебных страниц его не поменять", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(adminPage());
    renderWithAdmin(<PageEditor id="p1" />);
    expect(await screen.findByLabelText("Адрес страницы")).toBeDisabled();
    expect(screen.getByText(/ведут ссылки с сайта/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Подсказка: Адрес страницы" })).toBeInTheDocument();
  });

  it("документ (оферта): особые правила объяснены, удалить нельзя", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(offer);
    renderWithAdmin(<PageEditor id="p-offer" />);
    expect(await screen.findByText(/Обязательный документ/)).toBeInTheDocument();
    expect(screen.getByText(/нельзя запускать магазин/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Убрать в архив" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Как заваривать" })).not.toBeInTheDocument();
  });

  it("убрать в архив — с подтверждением, потом к списку", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(club);
    vi.mocked(pagesApi.archive).mockResolvedValue({ ok: true });
    renderWithAdmin(<PageEditor id="p-club" />);
    await userEvent.click(await screen.findByRole("button", { name: "Убрать в архив" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/восстановить/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Да, убрать в архив" }));
    expect(pagesApi.archive).toHaveBeenCalledWith("p-club");
    expect(push).toHaveBeenCalledWith("/admin/content/pages");
  });

  it("предпросмотр «Как это увидит покупатель»", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(adminPage());
    renderWithAdmin(<PageEditor id="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Как это увидит покупатель" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "О магазине" })).toBeInTheDocument();
    expect(within(dialog).getByText("Расскажите о магазине и о чайном мастере")).toBeInTheDocument();
  });

  it("ссылка «Открыть на сайте» — только у опубликованной страницы", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(adminPage());
    const { unmount } = renderWithAdmin(<PageEditor id="p1" />);
    expect(await screen.findByRole("link", { name: /Открыть на сайте/ })).toHaveAttribute("href", "/about");
    unmount();
    vi.mocked(pagesApi.get).mockResolvedValue(club);
    renderWithAdmin(<PageEditor id="p-club" />);
    expect(await screen.findByLabelText("Название страницы")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Открыть на сайте/ })).not.toBeInTheDocument();
  });

  it("ошибка сервера (адрес занят) — видна у поля", async () => {
    vi.mocked(pagesApi.get).mockResolvedValue(adminPage({ id: "p-club", title: "Чайный клуб", slug: "club" }));
    vi.mocked(pagesApi.patch).mockRejectedValue(new ApiError(400, "Адрес «delivery» уже занят", "domain_error", { field: "slug" }));
    renderWithAdmin(<PageEditor id="p-club" />);
    const slug = await screen.findByLabelText("Адрес страницы");
    await userEvent.clear(slug);
    await userEvent.type(slug, "delivery");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    expect(await screen.findByText("Адрес «delivery» уже занят")).toBeInTheDocument();
  });
});
